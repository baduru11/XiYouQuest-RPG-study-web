import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
    const { nodeId, score, xpEarned, durationSeconds } = body as {
      nodeId?: string;
      score?: number;
      xpEarned?: number;
      durationSeconds?: number;
    };

    if (!nodeId) {
      return NextResponse.json(
        { error: "Missing required field: nodeId" },
        { status: 400 }
      );
    }

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

    // Determine if checkpoint is ready (all complete and not the last phase)
    const isLastPhase = node.phase === 4;
    const isCheckpointReady = allPhaseComplete && !isLastPhase;

    // Suppress unused variable warning - durationSeconds is accepted for future use
    void durationSeconds;

    return NextResponse.json({
      xpEarned: xpEarned ?? 0,
      phaseProgress: {
        completed: completedCount,
        total: totalCount,
      },
      isCheckpointReady,
      isLastPhase,
      allPhaseComplete,
    });
  } catch (error) {
    console.error("Node complete error:", error);
    return NextResponse.json(
      { error: "Failed to complete node" },
      { status: 500 }
    );
  }
}
