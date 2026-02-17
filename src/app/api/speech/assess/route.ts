import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { assessPronunciation, type IseCategory } from "@/lib/iflytek-speech/client";

const VALID_CATEGORIES = new Set<IseCategory>([
  "read_syllable",
  "read_word",
  "read_sentence",
  "read_chapter",
]);

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
    const result = await assessPronunciation(buffer, referenceText, "zh-CN", category);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Speech assessment error:", error);
    return NextResponse.json({ error: "Assessment failed" }, { status: 500 });
  }
}
