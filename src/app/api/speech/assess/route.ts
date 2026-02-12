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
