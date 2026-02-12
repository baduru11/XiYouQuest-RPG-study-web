import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateQuestions } from "@/lib/gemini/client";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { component, count, difficulty } = await request.json();
    const questions = await generateQuestions({ component, count: count || 10, difficulty });
    return NextResponse.json({ questions });
  } catch (error) {
    console.error("Question generation error:", error);
    return NextResponse.json({ error: "Generation failed" }, { status: 500 });
  }
}
