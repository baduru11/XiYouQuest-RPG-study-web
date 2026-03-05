import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const insertSchema = z.object({
  totalScore: z.number().min(0).max(100),
  grade: z.string().max(20),
  componentScores: z.array(z.object({
    componentNumber: z.number().int().min(1).max(5),
    score: z.number().min(0).max(100),
    points: z.number().min(0).max(100),
  })).min(1).max(5),
  durationSeconds: z.number().int().min(0),
  totalXp: z.number().int().min(0),
});

const patchSchema = z.object({
  id: z.string().uuid(),
  aiFeedback: z.string().max(5000),
});

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = insertSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const { totalScore, grade, componentScores, durationSeconds, totalXp } = parsed.data;

  const { data, error } = await supabase
    .from("mock_exam_results")
    .insert({
      user_id: user.id,
      total_score: totalScore,
      grade,
      component_scores: componentScores,
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
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
