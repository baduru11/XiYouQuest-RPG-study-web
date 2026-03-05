import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { quickCompletion } from "@/lib/gemini/client";
import { aiInsightsSchema } from "@/lib/validations";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = aiInsightsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const { progress, recentSessions, questProgress } = parsed.data;

    const systemPrompt = `You are an expert PSC (Putonghua Proficiency Test) analyst writing a detailed study report. Analyze the student's practice data thoroughly and produce a deep, analytical breakdown.

Structure your response as 3 short sections separated by blank lines:

PERFORMANCE OVERVIEW
2-3 sentences. Hit rates, trends, which components are untouched. Actual percentages.

DIAGNOSIS
2-3 sentences. Root causes behind weak areas. Cross-reference patterns. PSC grade impact (C4+C5 = 60% of score).

RECOMMENDED STRATEGY
2-3 sentences. Prioritized action plan with specific drills and sub-skills to target.

Rules: English only. No emojis. No bullet points. Keep it tight — every sentence must add value. Reference C1-C7 by full name. Use actual numbers.
C1=Monosyllabic Characters C2=Multisyllabic Words C3=Vocabulary & Grammar C4=Passage Reading C5=Prompted Speaking C6=Cantonese Mistakes C7=Polyphonic Characters`;

    const dataStr = JSON.stringify(
      { progress, recentSessions: recentSessions?.slice(0, 20), questProgress },
    );

    const insights = await quickCompletion(systemPrompt, `Data: ${dataStr}`, 750);

    return NextResponse.json({ insights });
  } catch (error) {
    console.error("AI insights error:", error instanceof Error ? error.message : error);
    return NextResponse.json({
      insights: "• Keep practicing your weakest components regularly.\n• Focus on C1 and C2 pronunciation drills for the biggest score impact.\n• Try completing at least one practice session per day to build consistency.",
    });
  }
}
