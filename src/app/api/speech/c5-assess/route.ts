import { NextRequest, NextResponse } from "next/server";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { transcribeAudio } from "@/lib/iflytek-speech/asr-client";
import {
  assessPronunciation,
  type PronunciationAssessmentResult,
} from "@/lib/iflytek-speech/client";
import { analyzeC5Speaking } from "@/lib/gemini/client";
import { calculateC5Score } from "@/lib/scoring/c5-scoring";
import { getPcmWavDurationSeconds } from "@/lib/audio-utils";
import { OFFICIAL_PSC_SPEAKING_TOPICS } from "@/lib/psc/official-speaking-topics";
import { questionBankHasContent } from "@/lib/question-bank";

// Audio cap (16MB) plus multipart overhead.
const MAX_REQUEST_BYTES = 17 * 1024 * 1024;

// ISE read_chapter max audio duration. 120s fails; 82s works. Use 90s with margin.
// PCM 16kHz 16-bit mono = 32000 bytes/s.
const ISE_MAX_SECONDS = 90;
const ISE_MAX_PCM_BYTES = ISE_MAX_SECONDS * 32000;
const C5_MAX_RECORDING_SECONDS = 180;
const C5_DURATION_TOLERANCE_SECONDS = 1;

async function isControlledSpeakingTopic(
  topic: string,
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<boolean> {
  if (OFFICIAL_PSC_SPEAKING_TOPICS.some((officialTopic) => officialTopic === topic)) return true;
  if (!topic.trim()) return false;

  // Exact-content lookup against the whole bank: the previous capped list
  // fetch (.limit(150), physical order) silently rejected topics past the cap.
  return questionBankHasContent(supabase, 5, topic);
}

/**
 * Split audio + transcript into <=90s chunks and assess each via ISE,
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
        .catch(() => {
          console.warn(`[C5] ISE chunk ${i + 1}/${chunkCount} unavailable`);
          return null;
        }),
    );
  }

  const settled = await Promise.all(chunkPromises);
  const results = settled.filter((r): r is PronunciationAssessmentResult => r !== null);

  if (results.length !== chunkCount) {
    throw new Error("One or more ISE chunks failed");
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

export const maxDuration = 140;

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = await enforceRateLimit(user.id, "speech");
  if (limited) return limited;

  try {
    // Reject oversized bodies before parsing them into memory.
    if (Number(request.headers.get("content-length") ?? 0) > MAX_REQUEST_BYTES) {
      return NextResponse.json({ error: "Request too large" }, { status: 413 });
    }
    const formData = await request.formData();
    const audio = formData.get("audio");
    const topic = formData.get("topic");

    if (!(audio instanceof File) || typeof topic !== "string" || !topic) {
      return NextResponse.json({ error: "Missing audio or topic" }, { status: 400 });
    }

    // Validate file size: 16MB is ~8.7 min of the 16kHz mono WAV the client
    // records. Untimed C4 practice has no recorder limit, so leave slow-reader headroom.
    const MAX_FILE_SIZE = 16 * 1024 * 1024;
    if (audio.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "Audio file too large (max 16MB)" }, { status: 400 });
    }

    const buffer = Buffer.from(await audio.arrayBuffer());
    const measuredDurationSeconds = getPcmWavDurationSeconds(buffer);
    if (
      measuredDurationSeconds === null ||
      measuredDurationSeconds > C5_MAX_RECORDING_SECONDS + C5_DURATION_TOLERANCE_SECONDS
    ) {
      return NextResponse.json(
        { error: "Invalid C5 recording. Please record again." },
        { status: 400 },
      );
    }

    const supabase = await createClient();
    if (!(await isControlledSpeakingTopic(topic, supabase))) {
      return NextResponse.json(
        { error: "Selected topic is not available for C5 practice." },
        { status: 400 },
      );
    }
    const spokenDurationSeconds = Math.min(
      measuredDurationSeconds,
      C5_MAX_RECORDING_SECONDS,
    );

    // Step 1: ASR transcription
    console.log("[C5] Step 1: Transcribing audio...");
    let transcript: string;
    try {
      const asrResult = await transcribeAudio(buffer);
      transcript = asrResult.transcript.trim();
    } catch {
      console.warn("[C5] ASR unavailable");
      return NextResponse.json(
        { error: "Practice assessment unavailable. Please retry." },
        { status: 503 },
      );
    }

    if (!transcript) {
      return NextResponse.json(
        { error: "No recognizable speech detected. Please record again." },
        { status: 422 },
      );
    }

    console.info("[C5] Transcript received", { characters: transcript.length });

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

    console.info("[C5] Practice assessment completed");
    return NextResponse.json({
      ...result,
      assessmentType: "xiyouquest_speaking_practice_signal",
      assessmentVersion: "xiyouquest-speaking-practice-v2",
    });
  } catch {
    console.error("[C5] Practice assessment unavailable");
    return NextResponse.json(
      { error: "Practice assessment unavailable. Please retry." },
      { status: 503 },
    );
  }
}
