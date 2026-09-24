import { NextRequest, NextResponse } from "next/server";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import {
  CURRENT_PSC_MOCK_SCORE_VERSION,
  hasConsistentMockExamTotal,
  normalizeMockExamResult,
} from "@/lib/psc/mock-exam-contract";
import { calculateMockExamXpCeiling } from "@/lib/psc/mock-exam-xp";
import { getXiYouQuestPracticeBand } from "@/lib/psc/practice-band";
import { z } from "zod";

const insertSchema = z.object({
  totalScore: z.number().min(0).max(100),
  practiceBand: z.string().max(20),
  scoreVersion: z.literal(CURRENT_PSC_MOCK_SCORE_VERSION),
  componentScores: z.array(z.object({
    componentNumber: z.number().int().min(1).max(5),
    score: z.number().min(0).max(100),
    points: z.number().min(0).max(100),
    scoreVersion: z.literal(CURRENT_PSC_MOCK_SCORE_VERSION),
  })).min(1).max(5),
  durationSeconds: z.number().int().min(0),
  totalXp: z.number().int().min(0),
}).strict();

const patchSchema = z.object({
  id: z.string().uuid(),
  aiFeedback: z.string().max(5000),
}).strict();

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await enforceRateLimit(user.id, "write");
  if (limited) return limited;

  const body = await request.json();
  const parsed = insertSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const { totalScore, componentScores, durationSeconds, totalXp, scoreVersion } = parsed.data;
  const normalizedResult = normalizeMockExamResult(scoreVersion, componentScores);
  if (!normalizedResult || !hasConsistentMockExamTotal(totalScore, normalizedResult)) {
    return NextResponse.json({ error: "Invalid scoring contract" }, { status: 400 });
  }

  // XP is client-computed but bounded server-side: a failed assessment may
  // legitimately report less than the score-derived XP, never more.
  if (totalXp > calculateMockExamXpCeiling(normalizedResult.componentScores)) {
    return NextResponse.json({ error: "Invalid scoring contract" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("mock_exam_results")
    .insert({
      user_id: user.id,
      total_score: normalizedResult.totalScore,
      grade: getXiYouQuestPracticeBand(normalizedResult.totalScore).label,
      component_scores: normalizedResult.componentScores,
      duration_seconds: durationSeconds,
      total_xp: totalXp,
    })
    .select("id")
    .single();

  if (error) {
    console.error("Save mock exam error:", error.message);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }

  return NextResponse.json({ id: data.id });
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await enforceRateLimit(user.id, "write");
  if (limited) return limited;

  const body = await request.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const { error } = await supabase
    .from("mock_exam_results")
    .update({ ai_feedback: parsed.data.aiFeedback })
    .eq("id", parsed.data.id)
    .eq("user_id", user.id);

  if (error) {
    console.error("Patch mock exam error:", error.message);
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
