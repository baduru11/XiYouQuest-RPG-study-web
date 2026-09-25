import {
  corsResponse,
  jsonResponse,
  errorResponse,
} from "../_shared/cors.ts";
import { verifyUser } from "../_shared/verify-jwt.ts";
import { enforceRateLimit } from "../_shared/rate-limit.ts";
import { transcribeAudio } from "../_shared/iflytek-asr.ts";
import {
  assessPronunciation,
  type PronunciationAssessmentResult,
} from "../_shared/iflytek-ise.ts";
import { analyzeC5Speaking } from "../_shared/ai-client.ts";
import {
  calculateC5Score,
} from "../_shared/c5-scoring.ts";
import { createRequestClient } from "../_shared/supabase.ts";
import { getPcmWavDurationSeconds } from "../_shared/c5-wav.ts";
import { OFFICIAL_PSC_SPEAKING_TOPICS } from "../_shared/official-speaking-topics.ts";

// Audio cap (16MB) plus multipart overhead.
const MAX_REQUEST_BYTES = 17 * 1024 * 1024;

// ISE read_chapter max audio duration. 90s with margin.
// PCM 16kHz 16-bit mono = 32000 bytes/s.
const ISE_MAX_SECONDS = 90;
const ISE_MAX_PCM_BYTES = ISE_MAX_SECONDS * 32000;
const C5_MAX_RECORDING_SECONDS = 180;
const C5_DURATION_TOLERANCE_SECONDS = 1;

async function isControlledSpeakingTopic(
  topic: string,
  user: { id: string },
): Promise<boolean> {
  if (OFFICIAL_PSC_SPEAKING_TOPICS.some((officialTopic) => officialTopic === topic)) return true;
  if (!topic.trim()) return false;

  // Exact-content lookup against the whole bank: the previous capped list
  // fetch (.limit(150), physical order) silently rejected topics past the cap.
  const supabase = createRequestClient(user);
  const { data, error } = await supabase
    .from("question_banks")
    .select("id")
    .eq("component", 5)
    .eq("content", topic)
    .limit(1);
  if (error) return false;

  return (data ?? []).length > 0;
}

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
      ).catch(() => {
        console.warn(`[C5] ISE chunk ${i + 1}/${chunkCount} unavailable`);
        return null;
      }),
    );
  }

  const settled = await Promise.all(chunkPromises);
  const results = settled.filter(
    (r): r is PronunciationAssessmentResult => r !== null,
  );

  if (results.length !== chunkCount) {
    throw new Error("One or more ISE chunks failed");
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

  const user = await verifyUser(req);
  if (!user) return errorResponse("Unauthorized", 401);

  const limited = await enforceRateLimit(user.id, "speech");
  if (limited) return limited;

  try {
    // Reject oversized bodies before parsing them into memory.
    if (Number(req.headers.get("content-length") ?? 0) > MAX_REQUEST_BYTES) {
      return errorResponse("Request too large", 413);
    }
    const formData = await req.formData();
    const audio = formData.get("audio");
    const topic = formData.get("topic");

    if (!(audio instanceof File) || typeof topic !== "string" || !topic) {
      return errorResponse("Missing audio or topic", 400);
    }

    // Validate file size: 16MB is ~8.7 min of the 16kHz mono WAV the client
    // records. Untimed C4 practice has no recorder limit, so leave slow-reader headroom.
    const MAX_FILE_SIZE = 16 * 1024 * 1024;
    if (audio.size > MAX_FILE_SIZE) {
      return errorResponse("Audio file too large (max 16MB)", 400);
    }

    const audioData = new Uint8Array(await audio.arrayBuffer());
    const measuredDurationSeconds = getPcmWavDurationSeconds(audioData);
    if (
      measuredDurationSeconds === null ||
      measuredDurationSeconds > C5_MAX_RECORDING_SECONDS + C5_DURATION_TOLERANCE_SECONDS
    ) {
      return errorResponse("Invalid C5 recording. Please record again.", 400);
    }

    if (!(await isControlledSpeakingTopic(topic, user))) {
      return errorResponse("Selected topic is not available for C5 practice.", 400);
    }
    const spokenDurationSeconds = Math.min(
      measuredDurationSeconds,
      C5_MAX_RECORDING_SECONDS,
    );

    // Step 1: ASR transcription
    console.log("[C5] Step 1: Transcribing audio...");
    let transcript: string;
    try {
      const asrResult = await transcribeAudio(audioData);
      transcript = asrResult.transcript.trim();
    } catch {
      console.warn("[C5] ASR unavailable");
      return errorResponse("Practice assessment unavailable. Please retry.", 503);
    }

    if (!transcript) {
      return errorResponse("No recognizable speech detected. Please record again.", 422);
    }

    console.info("[C5] Transcript received", { characters: transcript.length });

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

    console.info("[C5] Practice assessment completed");
    return jsonResponse({
      ...result,
      assessmentType: "xiyouquest_speaking_practice_signal",
      assessmentVersion: "xiyouquest-speaking-practice-v2",
    });
  } catch {
    console.error("[speech-c5-assess] Practice assessment unavailable");
    return errorResponse("Practice assessment unavailable. Please retry.", 503);
  }
});
