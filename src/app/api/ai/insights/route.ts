import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { quickCompletion } from "@/lib/gemini/client";
import { aiInsightsSchema } from "@/lib/validations";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = await enforceRateLimit(user.id, "ai-text");
  if (limited) return limited;

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
2-3 sentences. Root causes behind weak areas. Cross-reference patterns. Explain XiYouQuest practice-score weighting without predicting an official PSC outcome.

RECOMMENDED STRATEGY
2-3 sentences. Prioritized action plan with specific drills and sub-skills to target.

Rules: English only. No emojis. No bullet points. Keep it tight — every sentence must add value. Reference C1-C7 by full name. Use actual numbers. This is XiYouQuest practice feedback only: never claim, predict, or imply an official PSC result, grade, certification, eligibility, or policy decision.
C1=Monosyllabic Characters C2=Multisyllabic Words C3=Selection & Judgment C4=Passage Reading C5=Prompted Speaking C6=Supplementary Cantonese Mistakes C7=Supplementary Polyphonic Characters`;

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
