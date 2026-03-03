import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const planId = searchParams.get("planId");
    const checkpointId = searchParams.get("checkpointId");

    // Single checkpoint lookup
    if (checkpointId) {
      const { data: checkpoint, error: checkpointError } = await supabase
        .from("learning_checkpoints")
        .select("*, learning_plans!inner(user_id)")
        .eq("id", checkpointId)
        .single();

      if (checkpointError || !checkpoint) {
        return NextResponse.json(
          { error: "Checkpoint not found" },
          { status: 404 }
        );
      }

      // Verify ownership via the joined plan
      const plan = checkpoint.learning_plans as unknown as {
        user_id: string;
      };
      if (plan.user_id !== user.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
      }

      // Strip the join data before returning
      const { learning_plans: _, ...checkpointData } = checkpoint;
      void _;

      return NextResponse.json({ checkpoint: checkpointData });
    }

    // Full plan report
    if (planId) {
      // Fetch plan and verify ownership
      const { data: plan, error: planError } = await supabase
        .from("learning_plans")
        .select("*")
        .eq("id", planId)
        .single();

      if (planError || !plan) {
        return NextResponse.json(
          { error: "Plan not found" },
          { status: 404 }
        );
      }

      if (plan.user_id !== user.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
      }

      // Fetch checkpoints and completed nodes in parallel
      const [checkpointsResult, completedNodesResult] = await Promise.all([
        supabase
          .from("learning_checkpoints")
          .select("*")
          .eq("plan_id", planId)
          .order("checkpoint_number", { ascending: true }),
        supabase
          .from("learning_nodes")
          .select("*")
          .eq("plan_id", planId)
          .eq("status", "completed"),
      ]);

      const checkpoints = checkpointsResult.data ?? [];
      const completedNodes = completedNodesResult.data ?? [];

      // Calculate totalStudyMinutes estimate: mock_exam=15min, drill=8min per node
      const totalStudyMinutes = completedNodes.reduce((sum, node) => {
        return sum + (node.node_type === "mock_exam" ? 15 : 8);
      }, 0);

      return NextResponse.json({
        plan,
        checkpoints,
        completedNodes,
        totalStudyMinutes,
      });
    }

    // Neither planId nor checkpointId provided
    return NextResponse.json(
      { error: "Missing required query parameter: planId or checkpointId" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Report fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch report" },
      { status: 500 }
    );
  }
}
