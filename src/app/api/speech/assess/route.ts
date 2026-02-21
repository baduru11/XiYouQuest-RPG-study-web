import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  assessPronunciation,
  type IseCategory,
  type PronunciationAssessmentResult,
} from "@/lib/iflytek-speech/client";

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

/**
 * Assess audio that may exceed the ISE single-request limit (~90s) by splitting
 * into chunks and merging results. Only needed for read_chapter / read_sentence.
 */
async function assessChunked(
  buffer: Buffer,
  referenceText: string,
  category: IseCategory,
): Promise<PronunciationAssessmentResult> {
  const hasWavHeader =
    buffer.length > 44 && buffer.toString("ascii", 0, 4) === "RIFF";
  const pcmData = hasWavHeader ? buffer.subarray(44) : buffer;
  const totalPcmBytes = pcmData.length;

  // If within limit, single request
  if (totalPcmBytes <= ISE_MAX_PCM_BYTES) {
    return assessPronunciation(buffer, referenceText, "zh-CN", category);
  }

  // Split into chunks
  const chunkCount = Math.ceil(totalPcmBytes / ISE_MAX_PCM_BYTES);
  const charsPerByte = referenceText.length / totalPcmBytes;

  console.log(
    `[assess] Splitting ${Math.round(totalPcmBytes / 32000)}s audio into ${chunkCount} chunks for ISE ${category}`,
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

    // Build a WAV buffer for this chunk (header + pcm)
    const wavHeader = hasWavHeader ? buffer.subarray(0, 44) : Buffer.alloc(0);
    const chunkBuffer = Buffer.concat([wavHeader, chunkPcm]);

    console.log(
      `[assess] Chunk ${i + 1}/${chunkCount}: ${Math.round(chunkPcm.length / 32000)}s audio, ${chunkText.length} chars`,
    );

    chunkPromises.push(
      assessPronunciation(chunkBuffer, chunkText, "zh-CN", category).catch(
        (err) => {
          console.error(`[assess] ISE chunk ${i + 1}/${chunkCount} failed:`, err);
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

  console.log(`[assess] ISE: ${results.length}/${chunkCount} chunks succeeded`);

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

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const audio = formData.get("audio") as File;
    const referenceText = formData.get("referenceText") as string;

    if (!audio || !referenceText) {
      return NextResponse.json({ error: "Missing audio or referenceText" }, { status: 400 });
    }

    // Validate file size (25MB max)
    const MAX_FILE_SIZE = 25 * 1024 * 1024;
    if (audio.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "Audio file too large (max 25MB)" }, { status: 400 });
    }

    // Validate MIME type
    const ALLOWED_TYPES = ["audio/wav", "audio/wave", "audio/x-wav", "audio/webm", "audio/ogg", "audio/mpeg"];
    if (audio.type && !ALLOWED_TYPES.includes(audio.type)) {
      return NextResponse.json({ error: "Invalid audio format" }, { status: 400 });
    }

    const categoryParam = formData.get("category") as string;
    const category: IseCategory = VALID_CATEGORIES.has(categoryParam as IseCategory)
      ? (categoryParam as IseCategory)
      : "read_word";

    const buffer = Buffer.from(await audio.arrayBuffer());

    // Use chunked assessment for categories that can exceed ISE's ~90s limit
    const needsChunking = category === "read_chapter" || category === "read_sentence";
    const result = needsChunking
      ? await assessChunked(buffer, referenceText, category)
      : await assessPronunciation(buffer, referenceText, "zh-CN", category);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Speech assessment error:", error);
    return NextResponse.json({ error: "Assessment failed" }, { status: 500 });
  }
}
