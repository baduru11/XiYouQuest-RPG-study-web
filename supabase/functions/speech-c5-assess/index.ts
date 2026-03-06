import {
  corsResponse,
  jsonResponse,
  errorResponse,
} from "../_shared/cors.ts";
import { createSupabaseClient } from "../_shared/supabase.ts";
import { transcribeAudio } from "../_shared/iflytek-asr.ts";
import {
  assessPronunciation,
  type PronunciationAssessmentResult,
} from "../_shared/iflytek-ise.ts";
import { analyzeC5Speaking } from "../_shared/ai-client.ts";
import {
  calculateC5Score,
  type C5AssessmentResult,
} from "../_shared/c5-scoring.ts";

// ISE read_chapter max audio duration. 90s with margin.
// PCM 16kHz 16-bit mono = 32000 bytes/s.
const ISE_MAX_SECONDS = 90;
const ISE_MAX_PCM_BYTES = ISE_MAX_SECONDS * 32000;

const EMPTY_RESULT: C5AssessmentResult = {
  pronunciation: {
    score: 0,
    deduction: 20,
    level: 6,
    label: "六档",
    notes: "No speech detected",
  },
  vocabGrammar: {
    score: 0,
    deduction: 5,
    level: 3,
    label: "三档",
    notes: "No speech detected",
  },
  fluency: {
    score: 0,
    deduction: 5,
    level: 3,
    label: "三档",
    notes: "No speech detected",
  },
  timePenalty: 30,
  totalScore: 0,
  normalizedScore: 0,
  transcript: "",
  errorCount: 0,
};

// ---------- Buffer helpers ----------

function concatUint8Arrays(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((sum, a) => sum + a.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    result.set(a, offset);
    offset += a.length;
  }
  return result;
}

/**
 * Split audio + transcript into <=90s chunks and assess each via ISE,
 * then merge all word-level results into a single combined result.
 */
async function assessFullAudio(
  audioData: Uint8Array,
  transcript: string,
): Promise<PronunciationAssessmentResult> {
  const hasWavHeader =
    audioData.length > 44 &&
    new TextDecoder().decode(audioData.subarray(0, 4)) === "RIFF";
  const headerSize = hasWavHeader ? 44 : 0;
  const pcmData = hasWavHeader ? audioData.subarray(44) : audioData;
  const totalPcmBytes = pcmData.length;

  // If within limit, single request
  if (totalPcmBytes <= ISE_MAX_PCM_BYTES) {
    return assessPronunciation(
      audioData,
      transcript,
      "zh-CN",
      "read_chapter",
    );
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

    // Build a WAV-prefixed chunk if original had a header
    const wavHeader = hasWavHeader
      ? audioData.subarray(0, headerSize)
      : new Uint8Array(0);
    const chunkBuffer = concatUint8Arrays(wavHeader, chunkPcm);

    console.log(
      `[C5] Chunk ${i + 1}/${chunkCount}: ${Math.round(chunkPcm.length / 32000)}s audio, ${chunkText.length} chars`,
    );

    chunkPromises.push(
      assessPronunciation(
        chunkBuffer,
        chunkText,
        "zh-CN",
        "read_chapter",
      ).catch((err) => {
        console.error(
          `[C5] ISE chunk ${i + 1}/${chunkCount} failed:`,
          err,
        );
        return null;
      }),
    );
  }

  const settled = await Promise.all(chunkPromises);
  const results = settled.filter(
    (r): r is PronunciationAssessmentResult => r !== null,
  );

  if (results.length === 0) {
    throw new Error("All ISE chunks failed");
  }

  console.log(
    `[C5] ISE: ${results.length}/${chunkCount} chunks succeeded`,
  );

  // Merge all chunk results
  const allWords = results.flatMap((r) => r.words);
  const allSentences = results.flatMap((r) => r.sentences ?? []);

  const n = results.length;
  let wAccuracy = 0,
    wFluency = 0,
    wCompleteness = 0,
    wPron = 0,
    wTone = 0;
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return corsResponse();

  const supabase = createSupabaseClient(req);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return errorResponse("Unauthorized", 401);

  try {
    const formData = await req.formData();
    const audio = formData.get("audio") as File;
    const topic = formData.get("topic") as string;
    const spokenDurationStr = formData.get(
      "spokenDurationSeconds",
    ) as string;

    if (!audio || !topic) {
      return errorResponse("Missing audio or topic", 400);
    }

    // Validate file size (25MB max)
    const MAX_FILE_SIZE = 25 * 1024 * 1024;
    if (audio.size > MAX_FILE_SIZE) {
      return errorResponse("Audio file too large (max 25MB)", 400);
    }

    const spokenDurationSeconds = parseFloat(spokenDurationStr) || 0;
    const audioData = new Uint8Array(await audio.arrayBuffer());

    // Step 1: ASR transcription
    console.log("[C5] Step 1: Transcribing audio...");
    let transcript: string;
    try {
      const asrResult = await transcribeAudio(audioData);
      transcript = asrResult.transcript.trim();
    } catch (err) {
      console.error("[C5] ASR transcription failed:", err);
      return jsonResponse(EMPTY_RESULT);
    }

    if (!transcript) {
      console.log("[C5] Empty transcript — returning zeroed result");
      return jsonResponse(EMPTY_RESULT);
    }

    console.log(
      `[C5] Transcript (${transcript.length} chars): ${transcript.substring(0, 200)}...`,
    );

    // Step 2: ISE pronunciation scoring (chunked) + AI content analysis (in parallel)
    console.log("[C5] Step 2: Running ISE + AI in parallel...");
    const [iseResult, geminiAnalysis] = await Promise.all([
      assessFullAudio(audioData, transcript),
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

    console.log(
      `[C5] Final score: ${result.totalScore}/30 (normalized: ${result.normalizedScore}/100)`,
    );
    return jsonResponse(result);
  } catch (error) {
    console.error("[speech-c5-assess] Error:", error);
    return errorResponse("C5 assessment failed", 500);
  }
});
