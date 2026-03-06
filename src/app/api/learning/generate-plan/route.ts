import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generatePhase, calculateTotalCheckpoints } from "@/lib/gemini/client";
import type { PhaseGenerationInput } from "@/lib/gemini/client";
import { checkAndUnlockAchievements } from "@/lib/achievements/check";
import { generatePlanSchema } from "@/lib/validations";

export const maxDuration = 60;

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
    const parsed = generatePlanSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input" },
        { status: 400 }
      );
    }
    const { scores, examDate } = parsed.data;

    // Calculate days remaining (minimum 1)
    const daysRemaining = Math.max(
      1,
      Math.ceil(
        (new Date(examDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      )
    );

    const totalCheckpoints = calculateTotalCheckpoints(daysRemaining);

    // Abandon any existing active plan
    await supabase
      .from("learning_plans")
      .update({ status: "abandoned" })
      .eq("user_id", user.id)
      .eq("status", "active");

    // Fetch available question IDs per component (1-7)
    const availableQuestionIds: Record<number, string[]> = {};
    const availableQuestionCounts: Record<number, number> = {};
    const componentPromises = [1, 2, 3, 4, 5, 6, 7].map(async (comp) => {
      const { data } = await supabase
        .from("question_banks")
        .select("id")
        .eq("component", comp);
      const ids = (data ?? []).map((row) => row.id);
      availableQuestionIds[comp] = ids;
      availableQuestionCounts[comp] = ids.length;
    });
    await Promise.all(componentPromises);

    // Generate Phase 1 only — AI analyzes weaknesses and creates first batch
    const phaseInput: PhaseGenerationInput = {
      scores,
      daysRemaining,
      phaseNumber: 1,
      totalCheckpoints,
      availableQuestionCounts,
    };

    const phase = await generatePhase(phaseInput);

    // Insert learning plan with AI analysis
    const { data: plan, error: planError } = await supabase
      .from("learning_plans")
      .insert({
        user_id: user.id,
        exam_date: examDate,
        initial_scores: scores,
        total_nodes: phase.nodes.length,
        total_checkpoints: totalCheckpoints,
        ai_analysis: phase.analysis,
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

    // Assign random question IDs from the bank server-side
    const usedIds: Record<number, Set<string>> = {};
    for (let c = 1; c <= 7; c++) usedIds[c] = new Set();

    function pickRandomIds(component: number, count: number): string[] {
      const pool = availableQuestionIds[component] ?? [];
      const unused = pool.filter((id) => !usedIds[component].has(id));
      const shuffled = [...unused].sort(() => Math.random() - 0.5);
      const picked = shuffled.slice(0, count);
      picked.forEach((id) => usedIds[component].add(id));
      return picked;
    }

    let sortOrder = 0;
    const nodeRows = phase.nodes.map((node) => {
      sortOrder++;
      let nodeType: "drill" | "mock_exam" = "drill";
      if (node.component === 5) nodeType = "mock_exam";

      const questionIds = pickRandomIds(node.component, node.questionCount);

      return {
        plan_id: plan.id,
        phase: 1,
        component: node.component,
        node_type: nodeType,
        focus_area: node.focusArea,
        question_ids: questionIds,
        sort_order: sortOrder,
        status: "available" as const,
        xp_earned: 0,
        estimated_minutes: node.estimatedMinutes,
      };
    });

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

    // Check for first-step achievement
    const newAchievements = await checkAndUnlockAchievements(supabase, user.id, {
      type: "learning_plan_created",
    });

    return NextResponse.json({
      planId: plan.id,
      analysis: phase.analysis,
      totalCheckpoints,
      nodes: nodes ?? [],
      newAchievements,
    });
  } catch (error) {
    console.error("Generate plan error:", error);
    return NextResponse.json(
      { error: "Failed to generate learning plan" },
      { status: 500 }
    );
  }
}
