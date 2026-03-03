import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  generateCheckpointFeedback,
  generateCurriculum,
} from "@/lib/gemini/client";
import type { CurriculumInput, CheckpointFeedbackInput } from "@/lib/gemini/client";
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

    // 3. Fetch plan and verify ownership
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

    // 4. Get previous scores: latest checkpoint or initial_scores
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

    // 5. Calculate score deltas
    const scoreDeltas: Record<string, number> = {};
    for (const key of Object.keys(scores)) {
      scoreDeltas[key] = scores[key] - (previousScores[key] ?? 0);
    }

    // 6. Get completed nodes for feedback context
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

    // 7. Calculate weighted PSC grade
    const weightedScore = calculateWeightedScore(scores);
    const predictedGrade = getPSCGrade(weightedScore);

    // 8. Generate checkpoint feedback via LLM
    const feedbackInput: CheckpointFeedbackInput = {
      originalScores: previousScores,
      currentScores: scores,
      completedNodes,
      phaseNumber: checkpointNumber,
    };

    const feedback = await generateCheckpointFeedback(feedbackInput);

    // 9. Insert checkpoint record
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

    // 10. Advance phase
    const nextPhase = checkpointNumber + 1;
    const { error: advanceError } = await supabase
      .from("learning_plans")
      .update({ current_phase: nextPhase })
      .eq("id", planId);

    if (advanceError) {
      console.error("Failed to advance phase:", advanceError);
    }

    // 11. Delete uncompleted nodes in remaining phases
    const { error: deleteError } = await supabase
      .from("learning_nodes")
      .delete()
      .eq("plan_id", planId)
      .gt("phase", checkpointNumber)
      .in("status", ["locked", "available"]);

    if (deleteError) {
      console.error("Failed to delete uncompleted nodes:", deleteError);
    }

    // 12. Regenerate remaining phases
    // Fetch available question IDs per component
    const availableQuestionIds: Record<number, string[]> = {};
    const componentPromises = [1, 2, 3, 4, 5, 6, 7].map(async (comp) => {
      const { data } = await supabase
        .from("question_banks")
        .select("id")
        .eq("component", comp);
      availableQuestionIds[comp] = (data ?? []).map((row) => row.id);
    });
    await Promise.all(componentPromises);

    // Get recently used question IDs to avoid repeats
    const { data: usedNodes } = await supabase
      .from("learning_nodes")
      .select("question_ids")
      .eq("plan_id", planId)
      .eq("status", "completed");

    const usedQuestionIds = new Set(
      (usedNodes ?? []).flatMap((n) => n.question_ids as string[])
    );

    // Remove used IDs from available pool
    for (const comp of Object.keys(availableQuestionIds)) {
      availableQuestionIds[Number(comp)] = availableQuestionIds[
        Number(comp)
      ].filter((id) => !usedQuestionIds.has(id));
    }

    // Fetch all checkpoints for previous checkpoint context
    const { data: allCheckpoints } = await supabase
      .from("learning_checkpoints")
      .select("scores")
      .eq("plan_id", planId)
      .order("checkpoint_number", { ascending: true });

    const { data: allCompletedNodes } = await supabase
      .from("learning_nodes")
      .select("component, focus_area")
      .eq("plan_id", planId)
      .eq("status", "completed");

    const previousCheckpoints = (allCheckpoints ?? []).map((cp) => ({
      scores: cp.scores as Record<string, number>,
      completedNodes: (allCompletedNodes ?? []).map((n) => ({
        component: n.component as number,
        focusArea: n.focus_area as string,
      })),
    }));

    // Calculate days remaining
    const daysRemaining = Math.max(
      1,
      Math.ceil(
        (new Date(plan.exam_date).getTime() - Date.now()) /
          (1000 * 60 * 60 * 24)
      )
    );

    const curriculumInput: CurriculumInput = {
      scores,
      daysRemaining,
      availableQuestionIds,
      recentQuestionTexts: [],
      previousCheckpoints,
    };

    const curriculum = await generateCurriculum(curriculumInput);

    // 13. Insert new nodes for phases > checkpointNumber
    // Remap curriculum phases to start from nextPhase
    // Also get the max sort_order from existing nodes
    const { data: maxSortNode } = await supabase
      .from("learning_nodes")
      .select("sort_order")
      .eq("plan_id", planId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    let sortOrder = (maxSortNode?.sort_order as number) ?? 0;

    const newNodeRows = curriculum.phases.flatMap((phase, phaseIdx) => {
      const actualPhase = nextPhase + phaseIdx;
      return phase.nodes.map((node) => {
        sortOrder++;
        const rawNode = node as unknown as Record<string, unknown>;
        let nodeType: "drill" | "mock_exam" = "drill";
        if (
          rawNode.nodeType === "mock_exam" ||
          rawNode.node_type === "mock_exam"
        ) {
          nodeType = "mock_exam";
        } else if (node.component === 5) {
          nodeType = "mock_exam";
        }

        return {
          plan_id: planId,
          phase: actualPhase,
          component: node.component,
          node_type: nodeType,
          focus_area: node.focusArea,
          question_ids: node.questionIds,
          sort_order: sortOrder,
          status: actualPhase === nextPhase ? "available" : "locked",
          xp_earned: 0,
        };
      });
    });

    if (newNodeRows.length > 0) {
      const { error: insertNodesError } = await supabase
        .from("learning_nodes")
        .insert(newNodeRows);

      if (insertNodesError) {
        console.error("Failed to insert regenerated nodes:", insertNodesError);
      }
    }

    // 14. Update total_nodes count
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

    // Achievement check for learning checkpoint milestones
    const newAchievements = await checkAndUnlockAchievements(supabase, user.id, {
      type: "learning_checkpoint",
      checkpointNumber,
    });

    // 15. Return response
    return NextResponse.json({
      feedback,
      predictedGrade,
      scoreDeltas,
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
