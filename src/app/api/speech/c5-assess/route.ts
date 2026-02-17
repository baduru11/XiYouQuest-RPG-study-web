import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { transcribeAudio } from "@/lib/iflytek-speech/asr-client";
import {
  assessPronunciation,
  type PronunciationAssessmentResult,
} from "@/lib/iflytek-speech/client";
import { analyzeC5Speaking } from "@/lib/gemini/client";
import { calculateC5Score, type C5AssessmentResult } from "@/lib/scoring/c5-scoring";

// ISE read_chapter max audio duration. 120s fails; 82s works. Use 90s with margin.
// PCM 16kHz 16-bit mono = 32000 bytes/s.
const ISE_MAX_SECONDS = 90;
const ISE_MAX_PCM_BYTES = ISE_MAX_SECONDS * 32000;

const EMPTY_RESULT: C5AssessmentResult = {
  pronunciation: { score: 0, deduction: 20, level: 6, label: "六档", notes: "No speech detected" },
  vocabGrammar: { score: 0, deduction: 5, level: 3, label: "三档", notes: "No speech detected" },
  fluency: { score: 0, deduction: 5, level: 3, label: "三档", notes: "No speech detected" },
  timePenalty: 30,
  totalScore: 0,
  normalizedScore: 0,
  transcript: "",
  errorCount: 0,
};

/**
 * Split audio + transcript into <=120s chunks and assess each via ISE,
 * then merge all word-level results into a single combined result.
 */
async function assessFullAudio(
  buffer: Buffer,
  transcript: string,
): Promise<PronunciationAssessmentResult> {
  const hasWavHeader =
    buffer.length > 44 && buffer.toString("ascii", 0, 4) === "RIFF";
  const headerSize = hasWavHeader ? 44 : 0;
  const pcmData = hasWavHeader ? buffer.subarray(44) : buffer;
  const totalPcmBytes = pcmData.length;

  // If within limit, single request
  if (totalPcmBytes <= ISE_MAX_PCM_BYTES) {
    return assessPronunciation(buffer, transcript, "zh-CN", "read_chapter");
  }

  // Split into chunks
  const chunkCount = Math.ceil(totalPcmBytes / ISE_MAX_PCM_BYTES);
  const charsPerByte = transcript.length / totalPcmBytes;

  console.log(
    `[C5] Splitting ${Math.round(totalPcmBytes / 32000)}s audio into ${chunkCount} chunks for ISE`,
  );

  const chunkPromises: Promise<PronunciationAssessmentResult | null>[] = [];

  for (let i = 0; i < chunkCount; i++) {
    const pcmStart = i * ISE_MAX_PCM_BYTES;
    const pcmEnd = Math.min(pcmStart + ISE_MAX_PCM_BYTES, totalPcmBytes);
    const chunkPcm = pcmData.subarray(pcmStart, pcmEnd);

    // Proportional transcript slice
    const textStart = Math.floor(pcmStart * charsPerByte);
    const textEnd = Math.floor(pcmEnd * charsPerByte);
    const chunkText = transcript.substring(textStart, textEnd);

    // Build a WAV buffer for this chunk (header + pcm)
    const wavHeader = hasWavHeader ? buffer.subarray(0, headerSize) : Buffer.alloc(0);
    const chunkBuffer = Buffer.concat([wavHeader, chunkPcm]);

    console.log(
      `[C5] Chunk ${i + 1}/${chunkCount}: ${Math.round(chunkPcm.length / 32000)}s audio, ${chunkText.length} chars`,
    );

    chunkPromises.push(
      assessPronunciation(chunkBuffer, chunkText, "zh-CN", "read_chapter")
        .catch((err) => {
          console.error(`[C5] ISE chunk ${i + 1}/${chunkCount} failed:`, err);
          return null;
        }),
    );
  }

  const settled = await Promise.all(chunkPromises);
  const results = settled.filter((r): r is PronunciationAssessmentResult => r !== null);

  if (results.length === 0) {
    throw new Error("All ISE chunks failed");
  }

  console.log(`[C5] ISE: ${results.length}/${chunkCount} chunks succeeded`);

  // Merge all chunk results: combine words, weighted-average scores
  const allWords = results.flatMap((r) => r.words);
  const allSentences = results.flatMap((r) => r.sentences ?? []);

  // Weighted average by number of successful results
  const n = results.length;
  let wAccuracy = 0, wFluency = 0, wCompleteness = 0, wPron = 0, wTone = 0;
  for (const r of results) {
    wAccuracy += r.accuracyScore / n;
    wFluency += r.fluencyScore / n;
    wCompleteness += r.completenessScore / n;
    wPron += r.pronunciationScore / n;
    wTone += r.toneScore / n;
  }

  return {
    accuracyScore: Math.round(wAccuracy),
    fluencyScore: Math.round(wFluency),
    completenessScore: Math.round(wCompleteness),
    pronunciationScore: Math.round(wPron),
    toneScore: Math.round(wTone),
    words: allWords,
    sentences: allSentences.length > 0 ? allSentences : undefined,
  };
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const audio = formData.get("audio") as File;
    const topic = formData.get("topic") as string;
    const spokenDurationStr = formData.get("spokenDurationSeconds") as string;

    if (!audio || !topic) {
      return NextResponse.json({ error: "Missing audio or topic" }, { status: 400 });
    }

    // Validate file size (25MB max)
    const MAX_FILE_SIZE = 25 * 1024 * 1024;
    if (audio.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "Audio file too large (max 25MB)" }, { status: 400 });
    }

    const spokenDurationSeconds = parseFloat(spokenDurationStr) || 0;
    const buffer = Buffer.from(await audio.arrayBuffer());

    // Step 1: ASR transcription
    console.log("[C5] Step 1: Transcribing audio...");
    let transcript: string;
    try {
      const asrResult = await transcribeAudio(buffer);
      transcript = asrResult.transcript.trim();
    } catch (err) {
      console.error("[C5] ASR transcription failed:", err);
      return NextResponse.json(EMPTY_RESULT);
    }

    if (!transcript) {
      console.log("[C5] Empty transcript — returning zeroed result");
      return NextResponse.json(EMPTY_RESULT);
    }

    console.log(`[C5] Transcript (${transcript.length} chars): ${transcript.substring(0, 200)}...`);

    // Step 2: ISE pronunciation scoring (chunked) + Gemini content analysis (in parallel)
    console.log("[C5] Step 2: Running ISE + Gemini in parallel...");
    const [iseResult, geminiAnalysis] = await Promise.all([
      assessFullAudio(buffer, transcript),
      analyzeC5Speaking({ transcript, topic }),
    ]);

    // Step 3: Calculate C5 score
    console.log("[C5] Step 3: Calculating C5 score...");
    const result = calculateC5Score({
      iseResult,
      geminiAnalysis,
      spokenDurationSeconds,
      transcript,
    });

    console.log(`[C5] Final score: ${result.totalScore}/30 (normalized: ${result.normalizedScore}/100)`);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[C5] Assessment error:", error);
    return NextResponse.json({ error: "C5 assessment failed" }, { status: 500 });
  }
}
