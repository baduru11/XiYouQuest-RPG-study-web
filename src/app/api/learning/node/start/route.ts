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
    const { nodeId } = body as { nodeId?: string };

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

    // Verify node is available
    if (node.status !== "available") {
      return NextResponse.json(
        { error: `Node is not available (current status: ${node.status})` },
        { status: 400 }
      );
    }

    // For mock_exam nodes, return empty questions
    if (node.node_type === "mock_exam") {
      return NextResponse.json({
        nodeType: "mock_exam",
        component: node.component,
        focusArea: node.focus_area,
        questions: [],
      });
    }

    // Fetch questions from question_banks using the node's question_ids
    const questionIds = node.question_ids ?? [];
    let questions: unknown[] = [];

    if (questionIds.length > 0) {
      const { data: questionData } = await supabase
        .from("question_banks")
        .select("*")
        .in("id", questionIds);
      questions = questionData ?? [];
    }

    return NextResponse.json({
      nodeType: node.node_type,
      component: node.component,
      focusArea: node.focus_area,
      questions,
    });
  } catch (error) {
    console.error("Node start error:", error);
    return NextResponse.json(
      { error: "Failed to start node" },
      { status: 500 }
    );
  }
}
