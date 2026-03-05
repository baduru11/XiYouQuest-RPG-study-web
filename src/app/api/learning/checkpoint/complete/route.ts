import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  generateCheckpointFeedback,
  generatePhase,
} from "@/lib/gemini/client";
import type { PhaseGenerationInput } from "@/lib/gemini/client";
import { checkAndUnlockAchievements } from "@/lib/achievements/check";
import { z } from "zod";

const checkpointBodySchema = z.object({
  planId: z.string().uuid(),
  checkpointNumber: z.number().int().min(1).max(10),
  scores: z.record(z.string(), z.number().min(0).max(100)),
});

const PSC_WEIGHTS: Record<string, number> = {
  c1: 0.1,
  c2: 0.2,
  c3: 0.1,
  c4: 0.3,
  c5: 0.3,
};

function getPSCGrade(weightedScore: number): string {
  if (weightedScore >= 97) return "一级甲等";
  if (weightedScore >= 92) return "一级乙等";
  if (weightedScore >= 87) return "二级甲等";
  if (weightedScore >= 80) return "二级乙等";
  if (weightedScore >= 70) return "三级甲等";
  if (weightedScore >= 60) return "三级乙等";
  return "不达标";
}

function calculateWeightedScore(scores: Record<string, number>): number {
  let total = 0;
  for (const [key, weight] of Object.entries(PSC_WEIGHTS)) {
    total += (scores[key] ?? 0) * weight;
  }
  return total;
}

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
    const parsed = checkpointBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    const { planId, checkpointNumber, scores } = parsed.data;

    // Fetch plan and verify ownership
    const { data: plan, error: planError } = await supabase
      .from("learning_plans")
      .select("*")
      .eq("id", planId)
      .single();

    if (planError || !plan) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    if (plan.user_id !== user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const totalCheckpoints = (plan.total_checkpoints as number) ?? 2;

    // Get previous scores: latest checkpoint or initial_scores
    const { data: lastCheckpoint } = await supabase
      .from("learning_checkpoints")
      .select("scores")
      .eq("plan_id", planId)
      .order("checkpoint_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    const previousScores: Record<string, number> = lastCheckpoint
      ? (lastCheckpoint.scores as Record<string, number>)
      : (plan.initial_scores as Record<string, number>);

    // Calculate score deltas
    const scoreDeltas: Record<string, number> = {};
    for (const key of Object.keys(scores)) {
      scoreDeltas[key] = scores[key] - (previousScores[key] ?? 0);
    }

    // Get completed nodes for feedback context
    const { data: completedNodesData } = await supabase
      .from("learning_nodes")
      .select("component, focus_area")
      .eq("plan_id", planId)
      .eq("phase", checkpointNumber)
      .eq("status", "completed");

    const completedNodes = (completedNodesData ?? []).map((n) => ({
      component: n.component as number,
      focusArea: n.focus_area as string,
    }));

    // Calculate weighted PSC grade
    const weightedScore = calculateWeightedScore(scores);
    const predictedGrade = getPSCGrade(weightedScore);

    // Generate checkpoint feedback via LLM
    const feedback = await generateCheckpointFeedback({
      originalScores: previousScores,
      currentScores: scores,
      completedNodes,
      phaseNumber: checkpointNumber,
    });

    // Insert checkpoint record
    const { error: checkpointError } = await supabase
      .from("learning_checkpoints")
      .insert({
        plan_id: planId,
        checkpoint_number: checkpointNumber,
        scores,
        score_deltas: scoreDeltas,
        llm_feedback: feedback,
        predicted_grade: predictedGrade,
      });

    if (checkpointError) {
      console.error("Failed to insert checkpoint:", checkpointError);
      return NextResponse.json(
        { error: "Failed to save checkpoint" },
        { status: 500 }
      );
    }

    // Advance phase
    const nextPhase = checkpointNumber + 1;
    await supabase
      .from("learning_plans")
      .update({ current_phase: nextPhase })
      .eq("id", planId);

    // Generate NEXT phase via AI (only if more phases remain)
    let nextPhaseAnalysis: string | null = null;
    const isLastCheckpoint = checkpointNumber >= totalCheckpoints;

    if (!isLastCheckpoint) {
      // Fetch available question IDs, excluding already-used ones
      const availableQuestionIds: Record<number, string[]> = {};
      const availableQuestionCounts: Record<number, number> = {};
      const componentPromises = [1, 2, 3, 4, 5, 6, 7].map(async (comp) => {
        const { data } = await supabase
          .from("question_banks")
          .select("id")
          .eq("component", comp);
        availableQuestionIds[comp] = (data ?? []).map((row) => row.id);
      });
      await Promise.all(componentPromises);

      // Get used question IDs to avoid repeats
      const { data: usedNodes } = await supabase
        .from("learning_nodes")
        .select("question_ids")
        .eq("plan_id", planId)
        .eq("status", "completed");

      const usedQuestionIds = new Set(
        (usedNodes ?? []).flatMap((n) => n.question_ids as string[])
      );

      for (const comp of Object.keys(availableQuestionIds)) {
        availableQuestionIds[Number(comp)] = availableQuestionIds[Number(comp)]
          .filter((id) => !usedQuestionIds.has(id));
        availableQuestionCounts[Number(comp)] = availableQuestionIds[Number(comp)].length;
      }

      // Build previous phase history for AI context
      const { data: allCheckpoints } = await supabase
        .from("learning_checkpoints")
        .select("checkpoint_number, scores")
        .eq("plan_id", planId)
        .order("checkpoint_number", { ascending: true });

      const { data: allCompletedNodes } = await supabase
        .from("learning_nodes")
        .select("component, focus_area, phase")
        .eq("plan_id", planId)
        .eq("status", "completed");

      const previousPhases = (allCheckpoints ?? []).map((cp) => ({
        phaseNumber: cp.checkpoint_number as number,
        scores: cp.scores as Record<string, number>,
        completedNodes: (allCompletedNodes ?? [])
          .filter((n) => (n.phase as number) <= (cp.checkpoint_number as number))
          .map((n) => ({
            component: n.component as number,
            focusArea: n.focus_area as string,
          })),
      }));

      const daysRemaining = Math.max(
        1,
        Math.ceil(
          (new Date(plan.exam_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        )
      );

      const phaseInput: PhaseGenerationInput = {
        scores,
        daysRemaining,
        phaseNumber: nextPhase,
        totalCheckpoints,
        availableQuestionCounts,
        previousPhases,
      };

      const phase = await generatePhase(phaseInput);
      nextPhaseAnalysis = phase.analysis;

      // Update plan with new analysis
      await supabase
        .from("learning_plans")
        .update({ ai_analysis: phase.analysis })
        .eq("id", planId);

      // Insert new nodes for the next phase
      const { data: maxSortNode } = await supabase
        .from("learning_nodes")
        .select("sort_order")
        .eq("plan_id", planId)
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();

      let sortOrder = (maxSortNode?.sort_order as number) ?? 0;

      const cpUsedIds: Record<number, Set<string>> = {};
      for (let c = 1; c <= 7; c++) {
        cpUsedIds[c] = new Set(usedQuestionIds);
      }

      function pickRandomIds(component: number, count: number): string[] {
        const pool = availableQuestionIds[component] ?? [];
        const unused = pool.filter((id) => !cpUsedIds[component].has(id));
        const shuffled = [...unused].sort(() => Math.random() - 0.5);
        const picked = shuffled.slice(0, count);
        picked.forEach((id) => cpUsedIds[component].add(id));
        return picked;
      }

      const newNodeRows = phase.nodes.map((node) => {
        sortOrder++;
        let nodeType: "drill" | "mock_exam" = "drill";
        if (node.component === 5) nodeType = "mock_exam";

        const questionIds = pickRandomIds(node.component, node.questionCount);

        return {
          plan_id: planId,
          phase: nextPhase,
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

      if (newNodeRows.length > 0) {
        const { error: insertNodesError } = await supabase
          .from("learning_nodes")
          .insert(newNodeRows);

        if (insertNodesError) {
          console.error("Failed to insert next phase nodes:", insertNodesError);
        }
      }
    }

    // Update total_nodes count
    const { count: totalNodes } = await supabase
      .from("learning_nodes")
      .select("*", { count: "exact", head: true })
      .eq("plan_id", planId);

    if (totalNodes !== null) {
      await supabase
        .from("learning_plans")
        .update({ total_nodes: totalNodes })
        .eq("id", planId);
    }

    // Fetch updated nodes for response
    const { data: updatedNodes } = await supabase
      .from("learning_nodes")
      .select("*")
      .eq("plan_id", planId)
      .order("sort_order", { ascending: true });

    // Achievement check
    const newAchievements = await checkAndUnlockAchievements(supabase, user.id, {
      type: "learning_checkpoint",
      checkpointNumber,
    });

    return NextResponse.json({
      feedback,
      predictedGrade,
      scoreDeltas,
      nextPhaseAnalysis,
      updatedNodes: updatedNodes ?? [],
      newAchievements,
    });
  } catch (error) {
    console.error("Checkpoint complete error:", error);
    return NextResponse.json(
      { error: "Failed to complete checkpoint" },
      { status: 500 }
    );
  }
}
