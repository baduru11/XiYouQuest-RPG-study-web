import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateFeedback } from "@/lib/gemini/client";
import { aiFeedbackSchema } from "@/lib/validations";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown> | undefined;
  try {
    body = await request.json();
    const parsed = aiFeedbackSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const feedback = await generateFeedback(parsed.data);

    return NextResponse.json({ feedback });
  } catch (error) {
    console.error("AI feedback error:", error);
    const fallback = body?.isCorrect
      ? "做得好！继续加油！ Nice work, keep it up!"
      : "再试一次吧！Practice makes perfect!";
    return NextResponse.json({ feedback: fallback, fallback: true });
  }
}
