import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateQuestions } from "@/lib/gemini/client";
import { aiGenerateSchema } from "@/lib/validations";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = aiGenerateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const { component, count, difficulty } = parsed.data;
    const questions = await generateQuestions({ component, count, difficulty });
    return NextResponse.json({ questions });
  } catch (error) {
    console.error("Question generation error:", error);
    return NextResponse.json({ error: "Generation failed" }, { status: 500 });
  }
}
