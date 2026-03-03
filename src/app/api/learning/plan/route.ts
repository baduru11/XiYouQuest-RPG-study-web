import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Get active plan (most recent)
    const { data: plan, error: planError } = await supabase
      .from("learning_plans")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (planError) {
      console.error("Failed to fetch learning plan:", planError);
      return NextResponse.json(
        { error: "Failed to fetch learning plan" },
        { status: 500 }
      );
    }

    if (!plan) {
      return NextResponse.json({ plan: null });
    }

    // Fetch nodes and checkpoints in parallel
    const [nodesResult, checkpointsResult] = await Promise.all([
      supabase
        .from("learning_nodes")
        .select("*")
        .eq("plan_id", plan.id)
        .order("sort_order", { ascending: true }),
      supabase
        .from("learning_checkpoints")
        .select("*")
        .eq("plan_id", plan.id)
        .order("checkpoint_number", { ascending: true }),
    ]);

    const nodes = nodesResult.data ?? [];
    const checkpoints = checkpointsResult.data ?? [];

    // Calculate days remaining
    const daysRemaining = Math.max(
      0,
      Math.ceil(
        (new Date(plan.exam_date).getTime() - Date.now()) /
          (1000 * 60 * 60 * 24)
      )
    );

    // Calculate progress percent
    const completedNodes = nodes.filter(
      (n) => n.status === "completed"
    ).length;
    const progressPercent =
      nodes.length > 0
        ? Math.round((completedNodes / nodes.length) * 100)
        : 0;

    return NextResponse.json({
      plan,
      nodes,
      checkpoints,
      daysRemaining,
      progressPercent,
    });
  } catch (error) {
    console.error("Fetch plan error:", error);
    return NextResponse.json(
      { error: "Failed to fetch learning plan" },
      { status: 500 }
    );
  }
}
