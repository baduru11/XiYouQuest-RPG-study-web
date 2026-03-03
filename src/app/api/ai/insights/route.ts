import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { chatConversation } from "@/lib/gemini/client";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { progress, recentSessions, questProgress } = await request.json();

    const systemPrompt = `You are a PSC (Putonghua Proficiency Test) study advisor analyzing a student's practice data.
Generate 3-5 actionable insights about their strengths, weaknesses, and recommended focus areas.
Mix Chinese and English naturally. Be specific — reference exact components (C1-C7) and scores.
Format as bullet points starting with "•".
Keep each bullet concise (1-2 sentences).

Component reference:
- C1: 读单音节字词 (Monosyllabic Characters)
- C2: 读多音节词语 (Multisyllabic Words)
- C3: 选择判断 (Vocabulary & Grammar)
- C4: 朗读短文 (Passage Reading)
- C5: 命题说话 (Prompted Speaking)
- C6: 易错字词 (Cantonese Mistakes)
- C7: 多音字 (Polyphonic Characters)`;

    const dataStr = JSON.stringify(
      { progress, recentSessions: recentSessions?.slice(0, 20), questProgress },
      null,
      2,
    );

    const userPrompt = `Here is the student's practice data:\n\n${dataStr}\n\nAnalyze this data and provide actionable insights.`;

    const result = await chatConversation([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ]);

    const insights = typeof result === "string" ? result : result.content;

    return NextResponse.json({ insights });
  } catch (error) {
    console.error("AI insights error:", error);
    return NextResponse.json(
      { error: "Failed to generate insights" },
      { status: 500 },
    );
  }
}
