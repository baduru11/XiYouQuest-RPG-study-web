import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkAndUnlockAchievements } from "@/lib/achievements/check";
import { nodeCompleteSchema } from "@/lib/validations";

const MAX_NODE_XP = 200;

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
    const parsed = nodeCompleteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input" },
        { status: 400 }
      );
    }
    const { nodeId, score, durationSeconds } = parsed.data;
    // Server-side XP cap
    const xpEarned = Math.min(parsed.data.xpEarned ?? 0, MAX_NODE_XP);

    // Fetch the node
    const { data: node, error: nodeError } = await supabase
      .from("learning_nodes")
      .select("*")
      .eq("id", nodeId)
      .single();

    if (nodeError || !node) {
      return NextResponse.json({ error: "Node not found" }, { status: 404 });
    }

    // Verify ownership by fetching the plan
    const { data: plan, error: planError } = await supabase
      .from("learning_plans")
      .select("user_id")
      .eq("id", node.plan_id)
      .single();

    if (planError || !plan) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    if (plan.user_id !== user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Update node: mark as completed
    const { error: updateError } = await supabase
      .from("learning_nodes")
      .update({
        status: "completed",
        score: score ?? null,
        xp_earned: xpEarned ?? 0,
        completed_at: new Date().toISOString(),
      })
      .eq("id", nodeId);

    if (updateError) {
      console.error("Failed to update node:", updateError);
      return NextResponse.json(
        { error: "Failed to complete node" },
        { status: 500 }
      );
    }

    // Check phase completion: fetch all nodes in same plan + phase
    const { data: phaseNodes } = await supabase
      .from("learning_nodes")
      .select("id, status")
      .eq("plan_id", node.plan_id)
      .eq("phase", node.phase);

    const allPhaseNodes = phaseNodes ?? [];
    // Count completed (include the one we just updated)
    const completedCount = allPhaseNodes.filter(
      (n) => n.status === "completed" || n.id === nodeId
    ).length;
    const totalCount = allPhaseNodes.length;
    const allPhaseComplete = completedCount >= totalCount;

    // Determine the max phase dynamically from existing nodes
    const { data: maxPhaseRow } = await supabase
      .from("learning_nodes")
      .select("phase")
      .eq("plan_id", node.plan_id)
      .order("phase", { ascending: false })
      .limit(1)
      .maybeSingle();

    const maxPhase = (maxPhaseRow?.phase as number) ?? node.phase;
    const isLastPhase = node.phase >= maxPhase;
    const isCheckpointReady = allPhaseComplete && !isLastPhase;

    // Suppress unused variable warning - durationSeconds is accepted for future use
    void durationSeconds;

    // If Phase 4 is complete, mark the plan as completed and trigger achievement
    let newAchievements: { key: string; name: string; emoji: string; tier: string }[] = [];
    if (isLastPhase && allPhaseComplete) {
      await supabase
        .from("learning_plans")
        .update({ status: "completed" })
        .eq("id", node.plan_id);

      newAchievements = await checkAndUnlockAchievements(
        supabase,
        user.id,
        { type: "learning_complete" }
      );
    }

    return NextResponse.json({
      xpEarned: xpEarned ?? 0,
      phaseProgress: {
        completed: completedCount,
        total: totalCount,
      },
      isCheckpointReady,
      isLastPhase,
      allPhaseComplete,
      newAchievements,
    });
  } catch (error) {
    console.error("Node complete error:", error);
    return NextResponse.json(
      { error: "Failed to complete node" },
      { status: 500 }
    );
  }
}
