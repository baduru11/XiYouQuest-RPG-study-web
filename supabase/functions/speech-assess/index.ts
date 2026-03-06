import {
  corsResponse,
  jsonResponse,
  errorResponse,
} from "../_shared/cors.ts";
import { createSupabaseClient } from "../_shared/supabase.ts";
import {
  assessPronunciation,
  type IseCategory,
  type PronunciationAssessmentResult,
} from "../_shared/iflytek-ise.ts";

const VALID_CATEGORIES = new Set<IseCategory>([
  "read_syllable",
  "read_word",
  "read_sentence",
  "read_chapter",
]);

// ISE read_chapter/read_sentence max audio duration (~90s empirically).
// PCM 16kHz 16-bit mono = 32000 bytes/s.
const ISE_MAX_SECONDS = 90;
const ISE_MAX_PCM_BYTES = ISE_MAX_SECONDS * 32000;

function concatUint8Arrays(arrays: Uint8Array[]): Uint8Array {
  const totalLen = arrays.reduce((sum, a) => sum + a.length, 0);
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const a of arrays) {
    result.set(a, offset);
    offset += a.length;
  }
  return result;
}

/**
 * Assess audio that may exceed the ISE single-request limit (~90s) by splitting
 * into chunks and merging results.
 */
async function assessChunked(
  audioData: Uint8Array,
  referenceText: string,
  category: IseCategory,
): Promise<PronunciationAssessmentResult> {
  const hasWavHeader =
    audioData.length > 44 &&
    new TextDecoder().decode(audioData.subarray(0, 4)) === "RIFF";
  const pcmData = hasWavHeader ? audioData.subarray(44) : audioData;
  const wavHeader = hasWavHeader ? audioData.subarray(0, 44) : new Uint8Array(0);
  const totalPcmBytes = pcmData.length;

  // If within limit, single request
  if (totalPcmBytes <= ISE_MAX_PCM_BYTES) {
    return assessPronunciation(audioData, referenceText, "zh-CN", category);
  }

  // Split into chunks
  const chunkCount = Math.ceil(totalPcmBytes / ISE_MAX_PCM_BYTES);
  const charsPerByte = referenceText.length / totalPcmBytes;

  console.log(
    `[speech-assess] Splitting ${Math.round(totalPcmBytes / 32000)}s audio into ${chunkCount} chunks`,
  );

  const chunkPromises: Promise<PronunciationAssessmentResult | null>[] = [];

  for (let i = 0; i < chunkCount; i++) {
    const pcmStart = i * ISE_MAX_PCM_BYTES;
    const pcmEnd = Math.min(pcmStart + ISE_MAX_PCM_BYTES, totalPcmBytes);
    const chunkPcm = pcmData.subarray(pcmStart, pcmEnd);

    // Proportional text slice
    const textStart = Math.floor(pcmStart * charsPerByte);
    const textEnd = Math.floor(pcmEnd * charsPerByte);
    const chunkText = referenceText.substring(textStart, textEnd);

    // Build WAV for this chunk (header + pcm)
    const chunkBuffer = wavHeader.length > 0
      ? concatUint8Arrays([wavHeader, chunkPcm])
      : chunkPcm;

    chunkPromises.push(
      assessPronunciation(chunkBuffer, chunkText, "zh-CN", category).catch(
        (err) => {
          console.error(`[speech-assess] Chunk ${i + 1}/${chunkCount} failed:`, err);
          return null;
        },
      ),
    );
  }

  const settled = await Promise.all(chunkPromises);
  const results = settled.filter(
    (r): r is PronunciationAssessmentResult => r !== null,
  );

  if (results.length === 0) {
    throw new Error("All ISE chunks failed");
  }

  // Merge: concatenate words/sentences, average top-level scores
  const allWords = results.flatMap((r) => r.words);
  const allSentences = results.flatMap((r) => r.sentences ?? []);
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return corsResponse();

  const supabase = createSupabaseClient(req);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return errorResponse("Unauthorized", 401);

  try {
    const formData = await req.formData();
    const audio = formData.get("audio") as File | null;
    const referenceText = formData.get("referenceText") as string | null;

    if (!audio || !referenceText) {
      return errorResponse("Missing audio or referenceText", 400);
    }

    // Validate file size (25MB max)
    const MAX_FILE_SIZE = 25 * 1024 * 1024;
    if (audio.size > MAX_FILE_SIZE) {
      return errorResponse("Audio file too large (max 25MB)", 400);
    }

    // Validate MIME type
    const ALLOWED_TYPES = ["audio/wav", "audio/wave", "audio/x-wav", "audio/webm", "audio/ogg", "audio/mpeg"];
    if (audio.type && !ALLOWED_TYPES.includes(audio.type)) {
      return errorResponse("Invalid audio format", 400);
    }

    const categoryParam = formData.get("category") as string;
    const category: IseCategory = VALID_CATEGORIES.has(categoryParam as IseCategory)
      ? (categoryParam as IseCategory)
      : "read_word";

    const audioData = new Uint8Array(await audio.arrayBuffer());

    // Use chunked assessment for categories that can exceed ISE's ~90s limit
    const needsChunking = category === "read_chapter" || category === "read_sentence";
    const result = needsChunking
      ? await assessChunked(audioData, referenceText, category)
      : await assessPronunciation(audioData, referenceText, "zh-CN", category);

    return jsonResponse(result);
  } catch (error) {
    console.error("[speech-assess] Error:", error instanceof Error ? error.message : error);
    return errorResponse("Assessment failed", 500);
  }
});
