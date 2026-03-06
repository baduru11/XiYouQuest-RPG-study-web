import {
  corsResponse,
  jsonResponse,
  errorResponse,
} from "../_shared/cors.ts";
import { createSupabaseClient } from "../_shared/supabase.ts";
import {
  generatePhase,
  calculateTotalCheckpoints,
  type PhaseGenerationInput,
} from "../_shared/ai-client.ts";
import { generatePlanSchema } from "../_shared/validations.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return corsResponse();

  const supabase = createSupabaseClient(req);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return errorResponse("Unauthorized", 401);

  try {
    const body = await req.json();
    const parsed = generatePlanSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse("Invalid input", 400);
    }
    const { scores, examDate } = parsed.data;

    // Calculate days remaining (minimum 1)
    const daysRemaining = Math.max(
      1,
      Math.ceil(
        (new Date(examDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
      ),
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
      const ids = (data ?? []).map((row: { id: string }) => row.id);
      availableQuestionIds[comp] = ids;
      availableQuestionCounts[comp] = ids.length;
    });
    await Promise.all(componentPromises);

    // Generate Phase 1
    const phaseInput: PhaseGenerationInput = {
      scores,
      daysRemaining,
      phaseNumber: 1,
      totalCheckpoints,
      availableQuestionCounts,
    };

    const phase = await generatePhase(phaseInput);

    // Insert learning plan
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
      return errorResponse("Failed to create learning plan", 500);
    }

    // Assign random question IDs from the bank
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
      return errorResponse("Failed to create learning nodes", 500);
    }

    // Fetch all created nodes
    const { data: nodes } = await supabase
      .from("learning_nodes")
      .select("*")
      .eq("plan_id", plan.id)
      .order("sort_order", { ascending: true });

    // Note: Achievement checking is omitted here since the achievement system
    // relies on imports from src/ that aren't ported. The Vercel route can
    // continue to handle achievements, or we can add a lightweight check later.

    return jsonResponse({
      planId: plan.id,
      analysis: phase.analysis,
      totalCheckpoints,
      nodes: nodes ?? [],
      newAchievements: [],
    });
  } catch (error) {
    console.error("[learning-generate-plan] Error:", error);
    return errorResponse("Failed to generate learning plan", 500);
  }
});
