import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateCurriculum } from "@/lib/gemini/client";
import type { CurriculumInput } from "@/lib/gemini/client";

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
    const { scores, examDate } = body as {
      scores?: Record<string, number>;
      examDate?: string;
    };

    if (!scores || !examDate) {
      return NextResponse.json(
        { error: "Missing required fields: scores and examDate" },
        { status: 400 }
      );
    }

    // Calculate days remaining (minimum 1)
    const daysRemaining = Math.max(
      1,
      Math.ceil(
        (new Date(examDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      )
    );

    // Abandon any existing active plan
    await supabase
      .from("learning_plans")
      .update({ status: "abandoned" })
      .eq("user_id", user.id)
      .eq("status", "active");

    // Fetch available question IDs per component (1-7)
    const availableQuestionIds: Record<number, string[]> = {};
    const componentPromises = [1, 2, 3, 4, 5, 6, 7].map(async (comp) => {
      const { data } = await supabase
        .from("question_banks")
        .select("id")
        .eq("component", comp);
      availableQuestionIds[comp] = (data ?? []).map((row) => row.id);
    });
    await Promise.all(componentPromises);

    // Generate curriculum via LLM
    const curriculumInput: CurriculumInput = {
      scores,
      daysRemaining,
      availableQuestionIds,
      recentQuestionTexts: [],
    };

    const curriculum = await generateCurriculum(curriculumInput);

    // Insert learning plan
    const { data: plan, error: planError } = await supabase
      .from("learning_plans")
      .insert({
        user_id: user.id,
        exam_date: examDate,
        initial_scores: scores,
        total_nodes: curriculum.totalNodes,
      })
      .select()
      .single();

    if (planError || !plan) {
      console.error("Failed to insert learning plan:", planError);
      return NextResponse.json(
        { error: "Failed to create learning plan" },
        { status: 500 }
      );
    }

    // Build node rows from curriculum phases
    let sortOrder = 0;
    const nodeRows = curriculum.phases.flatMap((phase) =>
      phase.nodes.map((node) => {
        sortOrder++;
        // Determine node_type: check for nodeType field on raw data, else default
        const rawNode = node as unknown as Record<string, unknown>;
        let nodeType: "drill" | "mock_exam" = "drill";
        if (
          rawNode.nodeType === "mock_exam" ||
          rawNode.node_type === "mock_exam"
        ) {
          nodeType = "mock_exam";
        } else if (node.component === 5) {
          // C5 prompted speaking defaults to mock_exam
          nodeType = "mock_exam";
        }

        return {
          plan_id: plan.id,
          phase: phase.phase,
          component: node.component,
          node_type: nodeType,
          focus_area: node.focusArea,
          question_ids: node.questionIds,
          sort_order: sortOrder,
          status: phase.phase === 1 ? "available" : "locked",
          xp_earned: 0,
        };
      })
    );

    const { error: nodesError } = await supabase
      .from("learning_nodes")
      .insert(nodeRows);

    if (nodesError) {
      console.error("Failed to insert learning nodes:", nodesError);
      return NextResponse.json(
        { error: "Failed to create learning nodes" },
        { status: 500 }
      );
    }

    // Fetch all created nodes
    const { data: nodes } = await supabase
      .from("learning_nodes")
      .select("*")
      .eq("plan_id", plan.id)
      .order("sort_order", { ascending: true });

    return NextResponse.json({
      planId: plan.id,
      phases: curriculum.phases,
      totalNodes: curriculum.totalNodes,
      nodes: nodes ?? [],
    });
  } catch (error) {
    console.error("Generate plan error:", error);
    return NextResponse.json(
      { error: "Failed to generate learning plan" },
      { status: 500 }
    );
  }
}
