// src/app/api/quest/progress/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { StageNumber } from "@/lib/quest/types";

/** GET: Fetch all quest progress for the authenticated user */
export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("quest_progress")
    .select("*")
    .eq("user_id", user.id)
    .order("stage", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ progress: data });
}

/** POST: Save/update quest progress for a stage */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { stage, is_cleared, score } = body as {
    stage: StageNumber;
    is_cleared: boolean;
    score: number;
  };

  if (!stage || stage < 1 || stage > 7) {
    return NextResponse.json({ error: "Invalid stage" }, { status: 400 });
  }

  // Upsert: increment attempts, update best_score and is_cleared
  const { data: existing } = await supabase
    .from("quest_progress")
    .select("*")
    .eq("user_id", user.id)
    .eq("stage", stage)
    .single();

  if (existing) {
    const updates: Record<string, unknown> = {
      attempts: existing.attempts + 1,
      updated_at: new Date().toISOString(),
    };
    if (score > existing.best_score) {
      updates.best_score = score;
    }
    if (is_cleared && !existing.is_cleared) {
      updates.is_cleared = true;
      updates.cleared_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from("quest_progress")
      .update(updates)
      .eq("id", existing.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  } else {
    const { error } = await supabase.from("quest_progress").insert({
      user_id: user.id,
      stage,
      is_cleared,
      attempts: 1,
      best_score: score,
      cleared_at: is_cleared ? new Date().toISOString() : null,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true });
}
