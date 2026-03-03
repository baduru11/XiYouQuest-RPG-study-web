# Personalized Learning Path Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an adaptive, LLM-curated PSC study plan with initial assessment, 4-phase curriculum roadmap, 3 mid-checkpoints with dynamic curriculum adjustment, and full gamification integration.

**Architecture:** New route `/learning-path` with a single client component managing a state machine (`welcome → assessment → time_input → roadmap → node_session | checkpoint → summary`). 3 new DB tables. 6 new API routes. LLM (DeepSeek via OpenRouter) generates and adjusts the curriculum. Existing practice UI components are reused for node sessions. The initial assessment and checkpoints reuse a trimmed ExamRunner (30% question counts).

**Tech Stack:** Next.js 16 App Router, Supabase (Postgres + RLS), DeepSeek v3.2 via OpenRouter, existing iFlytek ISE/ASR pipelines, Tailwind CSS 4, shadcn/ui

---

### Task 1: Database Migration — 3 New Tables

**Files:**
- Create via Supabase MCP: `apply_migration` with name `add_learning_path_tables`

**Step 1: Apply migration**

Use the Supabase MCP `apply_migration` tool with this SQL:

```sql
-- Learning plans
CREATE TABLE learning_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  exam_date date NOT NULL,
  initial_scores jsonb NOT NULL DEFAULT '{}',
  current_phase int NOT NULL DEFAULT 1,
  total_nodes int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'abandoned')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Learning nodes
CREATE TABLE learning_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES learning_plans(id) ON DELETE CASCADE,
  phase int NOT NULL CHECK (phase BETWEEN 1 AND 4),
  component int NOT NULL CHECK (component BETWEEN 1 AND 7),
  node_type text NOT NULL DEFAULT 'drill' CHECK (node_type IN ('drill', 'mock_exam')),
  focus_area text NOT NULL DEFAULT '',
  question_ids uuid[] NOT NULL DEFAULT '{}',
  sort_order int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'locked' CHECK (status IN ('locked', 'available', 'completed')),
  score float,
  xp_earned int NOT NULL DEFAULT 0,
  completed_at timestamptz
);

-- Learning checkpoints
CREATE TABLE learning_checkpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES learning_plans(id) ON DELETE CASCADE,
  checkpoint_number int NOT NULL CHECK (checkpoint_number BETWEEN 1 AND 3),
  scores jsonb NOT NULL DEFAULT '{}',
  score_deltas jsonb NOT NULL DEFAULT '{}',
  llm_feedback text NOT NULL DEFAULT '',
  predicted_grade text NOT NULL DEFAULT '',
  completed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_id, checkpoint_number)
);

-- Indexes
CREATE INDEX idx_learning_plans_user ON learning_plans(user_id);
CREATE INDEX idx_learning_plans_status ON learning_plans(user_id, status);
CREATE INDEX idx_learning_nodes_plan ON learning_nodes(plan_id);
CREATE INDEX idx_learning_nodes_phase ON learning_nodes(plan_id, phase);
CREATE INDEX idx_learning_checkpoints_plan ON learning_checkpoints(plan_id);

-- RLS
ALTER TABLE learning_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_checkpoints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own learning plans"
  ON learning_plans FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can read own learning nodes"
  ON learning_nodes FOR SELECT
  USING (plan_id IN (SELECT id FROM learning_plans WHERE user_id = auth.uid()));

CREATE POLICY "Users can update own learning nodes"
  ON learning_nodes FOR UPDATE
  USING (plan_id IN (SELECT id FROM learning_plans WHERE user_id = auth.uid()));

CREATE POLICY "Service role can manage all learning nodes"
  ON learning_nodes FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Users can read own learning checkpoints"
  ON learning_checkpoints FOR SELECT
  USING (plan_id IN (SELECT id FROM learning_plans WHERE user_id = auth.uid()));

CREATE POLICY "Service role can manage all learning checkpoints"
  ON learning_checkpoints FOR ALL
  USING (auth.role() = 'service_role');
```

**Step 2: Verify migration**

Use Supabase MCP `list_tables` to confirm `learning_plans`, `learning_nodes`, `learning_checkpoints` exist in the `public` schema.

**Step 3: Commit**

```bash
git add -A && git commit -m "feat(db): add learning path tables with RLS"
```

---

### Task 2: TypeScript Types

**Files:**
- Modify: `src/types/database.ts` — add 3 new interfaces

**Step 1: Add types to database.ts**

Add these interfaces after the existing `ChatMessage` interface (at the end of the file, before any closing brackets):

```typescript
// Learning Path types
interface LearningPlan {
  id: string;
  user_id: string;
  exam_date: string;
  initial_scores: Record<string, number>; // { c1: 82, c2: 75, c3: 90, c4: 68, c5: 71 }
  current_phase: number;
  total_nodes: number;
  status: "active" | "completed" | "abandoned";
  created_at: string;
}

interface LearningNode {
  id: string;
  plan_id: string;
  phase: number;
  component: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  node_type: "drill" | "mock_exam";
  focus_area: string;
  question_ids: string[];
  sort_order: number;
  status: "locked" | "available" | "completed";
  score: number | null;
  xp_earned: number;
  completed_at: string | null;
}

interface LearningCheckpoint {
  id: string;
  plan_id: string;
  checkpoint_number: number;
  scores: Record<string, number>;
  score_deltas: Record<string, number>;
  llm_feedback: string;
  predicted_grade: string;
  completed_at: string;
}
```

Also add the table entries to the `Database["public"]["Tables"]` type if it exists as a mapped type, following the existing pattern for other tables.

**Step 2: Verify types compile**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No new errors related to learning types.

**Step 3: Commit**

```bash
git add src/types/database.ts && git commit -m "feat(types): add learning path database types"
```

---

### Task 3: LLM Curriculum Generation Function

**Files:**
- Modify: `src/lib/gemini/client.ts` — add `generateCurriculum()` and `generateCheckpointFeedback()` exports
- Create: `src/lib/gemini/__tests__/learning-prompts.test.ts` — test prompt construction

**Step 1: Write the test**

Create `src/lib/gemini/__tests__/learning-prompts.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";

// We'll test the prompt construction helpers, not the API call itself
// Import after implementing
describe("buildCurriculumPrompt", () => {
  it("includes all component scores in the prompt", () => {
    const { buildCurriculumPrompt } = require("../client");
    const prompt = buildCurriculumPrompt({
      scores: { c1: 82, c2: 75, c3: 90, c4: 68, c5: 71 },
      daysRemaining: 30,
      availableQuestionIds: { 1: ["id1"], 2: ["id2"], 3: ["id3"], 4: ["id4"], 5: ["id5"] },
      recentQuestionTexts: [],
    });
    expect(prompt).toContain("C1");
    expect(prompt).toContain("82");
    expect(prompt).toContain("30");
  });

  it("scales node count recommendation based on days", () => {
    const { buildCurriculumPrompt } = require("../client");
    const shortPrompt = buildCurriculumPrompt({
      scores: { c1: 80, c2: 80, c3: 80, c4: 80, c5: 80 },
      daysRemaining: 7,
      availableQuestionIds: { 1: [], 2: [], 3: [], 4: [], 5: [] },
      recentQuestionTexts: [],
    });
    const longPrompt = buildCurriculumPrompt({
      scores: { c1: 80, c2: 80, c3: 80, c4: 80, c5: 80 },
      daysRemaining: 60,
      availableQuestionIds: { 1: [], 2: [], 3: [], 4: [], 5: [] },
      recentQuestionTexts: [],
    });
    // Both should contain the days value
    expect(shortPrompt).toContain("7");
    expect(longPrompt).toContain("60");
  });
});

describe("buildCheckpointFeedbackPrompt", () => {
  it("includes current and previous scores", () => {
    const { buildCheckpointFeedbackPrompt } = require("../client");
    const prompt = buildCheckpointFeedbackPrompt({
      currentScores: { c1: 88, c2: 80, c3: 92, c4: 75, c5: 78 },
      previousScores: { c1: 82, c2: 75, c3: 90, c4: 68, c5: 71 },
      checkpointNumber: 1,
      completedNodes: [],
    });
    expect(prompt).toContain("88");
    expect(prompt).toContain("82");
    expect(prompt).toContain("+6"); // c1 delta
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/gemini/__tests__/learning-prompts.test.ts`
Expected: FAIL — functions not exported yet.

**Step 3: Implement the functions**

Add to `src/lib/gemini/client.ts`:

```typescript
// --- Learning Path Curriculum Generation ---

export interface CurriculumInput {
  scores: Record<string, number>;
  daysRemaining: number;
  availableQuestionIds: Record<number, string[]>;
  recentQuestionTexts: string[];
  previousCheckpoints?: { scores: Record<string, number>; completedNodes: { component: number; focusArea: string }[] }[];
}

export interface CurriculumNode {
  component: number;
  focusArea: string;
  focusDescription: string;
  questionIds: string[];
  estimatedMinutes: number;
}

export interface CurriculumPhase {
  phase: number;
  nodes: CurriculumNode[];
}

export interface CurriculumOutput {
  phases: CurriculumPhase[];
  totalNodes: number;
}

export function buildCurriculumPrompt(input: CurriculumInput): string {
  const { scores, daysRemaining, availableQuestionIds, recentQuestionTexts, previousCheckpoints } = input;
  const recommendedNodes = Math.max(8, Math.min(60, Math.round(daysRemaining * 1.5)));
  const phase4Min = Math.max(2, Math.round(recommendedNodes * 0.25));

  const scoreLines = Object.entries(scores)
    .map(([key, val]) => `  ${key.toUpperCase()}: ${val}/100`)
    .join("\n");

  const questionIdLines = Object.entries(availableQuestionIds)
    .map(([comp, ids]) => `  Component ${comp}: ${ids.length} questions available`)
    .join("\n");

  let historyBlock = "";
  if (previousCheckpoints?.length) {
    historyBlock = "\n\nPREVIOUS CHECKPOINTS:\n" + previousCheckpoints
      .map((cp, i) => `Checkpoint ${i + 1}: ${JSON.stringify(cp.scores)}`)
      .join("\n");
  }

  let recentBlock = "";
  if (recentQuestionTexts.length > 0) {
    recentBlock = `\n\nRECENTLY PRACTICED (avoid these):\n${recentQuestionTexts.slice(0, 50).join(", ")}`;
  }

  return `You are a PSC (Putonghua Proficiency Test) exam tutor creating a personalized study plan.

STUDENT SKILL PROFILE:
${scoreLines}

DAYS REMAINING UNTIL EXAM: ${daysRemaining}

AVAILABLE QUESTION BANK:
${questionIdLines}

TARGET: Generate a ${recommendedNodes}-node curriculum split into 4 phases with 3 checkpoints between them.
Phase 4 must have at least ${phase4Min} nodes, ALL with node_type "mock_exam".
${historyBlock}${recentBlock}

RULES:
- Prioritize weakest components (lowest scores) with more nodes
- Don't ignore strong components entirely — include at least 1-2 nodes each
- Phase 1: Focus heavily on weakest areas
- Phase 2-3: Gradually broaden, mix weak and moderate areas
- Phase 4: Mock exam focus only (node_type: "mock_exam", no questionIds needed)
- Each drill node: select 10-15 questionIds from the available bank for that component
- focusArea: short label like "Tone 2-3 pairs", "Measure words", "Passage fluency"
- focusDescription: 1-sentence description of what this drill targets
- estimatedMinutes: 5-10 for drills, 15-20 for mock exams

Respond with ONLY valid JSON matching this schema:
{
  "phases": [
    {
      "phase": 1,
      "nodes": [
        {
          "component": 1,
          "nodeType": "drill",
          "focusArea": "...",
          "focusDescription": "...",
          "questionIds": ["uuid1", "uuid2"],
          "estimatedMinutes": 8
        }
      ]
    }
  ]
}`;
}

export function buildCheckpointFeedbackPrompt(input: {
  currentScores: Record<string, number>;
  previousScores: Record<string, number>;
  checkpointNumber: number;
  completedNodes: { component: number; focusArea: string }[];
}): string {
  const { currentScores, previousScores, checkpointNumber, completedNodes } = input;
  const deltas = Object.fromEntries(
    Object.keys(currentScores).map((k) => [k, (currentScores[k] ?? 0) - (previousScores[k] ?? 0)])
  );
  const deltaLines = Object.entries(deltas)
    .map(([k, d]) => `  ${k.toUpperCase()}: ${currentScores[k]}/100 (${d >= 0 ? "+" : ""}${d})`)
    .join("\n");
  const nodeLines = completedNodes
    .map((n) => `  C${n.component}: ${n.focusArea}`)
    .join("\n");

  return `You are a PSC exam tutor. The student just completed checkpoint ${checkpointNumber} of 3.

SCORE COMPARISON:
${deltaLines}

COMPLETED PRACTICE NODES SINCE LAST CHECKPOINT:
${nodeLines}

Write a personalized feedback report in Mandarin Chinese (简体中文), 2-3 paragraphs:
1. What improved and acknowledge their effort
2. What still needs work, with specific advice
3. Strategy recommendation for the next study phase

Keep it encouraging but honest. Use PSC-specific terminology.`;
}

export async function generateCurriculum(input: CurriculumInput): Promise<CurriculumOutput> {
  const prompt = buildCurriculumPrompt(input);
  return retryWithBackoff(async () => {
    const raw = await chatCompletion(
      "You are a PSC exam curriculum planner. Respond with ONLY valid JSON, no markdown fences.",
      prompt
    );
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON found in curriculum response");
    const parsed = JSON.parse(match[0]);
    if (!parsed.phases || !Array.isArray(parsed.phases)) throw new Error("Invalid curriculum structure");
    const totalNodes = parsed.phases.reduce(
      (sum: number, p: CurriculumPhase) => sum + p.nodes.length, 0
    );
    return { phases: parsed.phases, totalNodes };
  });
}

export async function generateCheckpointFeedback(input: {
  currentScores: Record<string, number>;
  previousScores: Record<string, number>;
  checkpointNumber: number;
  completedNodes: { component: number; focusArea: string }[];
}): Promise<string> {
  const prompt = buildCheckpointFeedbackPrompt(input);
  return retryWithBackoff(async () => {
    return chatCompletion(
      "You are a supportive PSC exam tutor providing feedback in Chinese.",
      prompt
    );
  }).catch(() => "评估完成。请继续努力练习，加油！");
}
```

Note: `chatCompletion` and `retryWithBackoff` are existing private functions in this file. You may need to verify they are accessible within the module scope.

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/gemini/__tests__/learning-prompts.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/gemini/client.ts src/lib/gemini/__tests__/learning-prompts.test.ts
git commit -m "feat(ai): add curriculum generation and checkpoint feedback functions"
```

---

### Task 4: API Route — Generate Plan

**Files:**
- Create: `src/app/api/learning/generate-plan/route.ts`

**Step 1: Create the route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateCurriculum } from "@/lib/gemini/client";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { scores, examDate } = await req.json();

  // Validate inputs
  if (!scores || !examDate) {
    return NextResponse.json({ error: "Missing scores or examDate" }, { status: 400 });
  }

  const daysRemaining = Math.max(1, Math.ceil(
    (new Date(examDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  ));

  // Abandon any existing active plan
  await supabase
    .from("learning_plans")
    .update({ status: "abandoned" })
    .eq("user_id", user.id)
    .eq("status", "active");

  // Fetch available question IDs per component
  const questionPromises = [1, 2, 3, 4, 5, 6, 7].map((comp) =>
    supabase.from("question_banks").select("id").eq("component", comp)
  );
  const questionResults = await Promise.all(questionPromises);
  const availableQuestionIds: Record<number, string[]> = {};
  questionResults.forEach((res, i) => {
    availableQuestionIds[i + 1] = (res.data ?? []).map((q) => q.id);
  });

  // Fetch recent practice to avoid repeats
  const { data: recentPractice } = await supabase
    .from("practice_details")
    .select("question_text")
    .eq("session_id", user.id)
    .order("id", { ascending: false })
    .limit(100);
  const recentQuestionTexts = (recentPractice ?? []).map((p) => p.question_text);

  // Generate curriculum via LLM
  const curriculum = await generateCurriculum({
    scores,
    daysRemaining,
    availableQuestionIds,
    recentQuestionTexts,
  });

  // Create plan
  const { data: plan, error: planError } = await supabase
    .from("learning_plans")
    .insert({
      user_id: user.id,
      exam_date: examDate,
      initial_scores: scores,
      total_nodes: curriculum.totalNodes,
    })
    .select("id")
    .single();

  if (planError || !plan) {
    return NextResponse.json({ error: "Failed to create plan" }, { status: 500 });
  }

  // Insert all nodes
  const nodeRows = curriculum.phases.flatMap((phase) =>
    phase.nodes.map((node, i) => ({
      plan_id: plan.id,
      phase: phase.phase,
      component: node.component,
      node_type: node.nodeType ?? node.focusArea === "mock_exam" ? "mock_exam" : "drill",
      focus_area: node.focusArea,
      question_ids: node.questionIds ?? [],
      sort_order: i,
      status: phase.phase === 1 ? "available" : "locked",
    }))
  );

  const { error: nodesError } = await supabase
    .from("learning_nodes")
    .insert(nodeRows);

  if (nodesError) {
    return NextResponse.json({ error: "Failed to create nodes" }, { status: 500 });
  }

  // Fetch all created nodes for response
  const { data: nodes } = await supabase
    .from("learning_nodes")
    .select("*")
    .eq("plan_id", plan.id)
    .order("phase")
    .order("sort_order");

  return NextResponse.json({
    planId: plan.id,
    phases: curriculum.phases,
    totalNodes: curriculum.totalNodes,
    nodes,
  });
}
```

**Step 2: Verify route compiles**

Run: `npx tsc --noEmit 2>&1 | grep "learning" | head -10`
Expected: No errors in the new file.

**Step 3: Commit**

```bash
git add src/app/api/learning/generate-plan/route.ts
git commit -m "feat(api): add POST /api/learning/generate-plan route"
```

---

### Task 5: API Route — Get Plan

**Files:**
- Create: `src/app/api/learning/plan/route.ts`

**Step 1: Create the route**

```typescript
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Get active plan
  const { data: plan } = await supabase
    .from("learning_plans")
    .select("*")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!plan) {
    return NextResponse.json({ plan: null });
  }

  // Fetch nodes and checkpoints in parallel
  const [{ data: nodes }, { data: checkpoints }] = await Promise.all([
    supabase
      .from("learning_nodes")
      .select("*")
      .eq("plan_id", plan.id)
      .order("phase")
      .order("sort_order"),
    supabase
      .from("learning_checkpoints")
      .select("*")
      .eq("plan_id", plan.id)
      .order("checkpoint_number"),
  ]);

  const daysRemaining = Math.max(0, Math.ceil(
    (new Date(plan.exam_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  ));

  const completedNodes = (nodes ?? []).filter((n) => n.status === "completed").length;
  const totalNodes = nodes?.length ?? 0;
  const progressPercent = totalNodes > 0 ? Math.round((completedNodes / totalNodes) * 100) : 0;

  return NextResponse.json({
    plan,
    nodes: nodes ?? [],
    checkpoints: checkpoints ?? [],
    daysRemaining,
    progressPercent,
  });
}
```

**Step 2: Commit**

```bash
git add src/app/api/learning/plan/route.ts
git commit -m "feat(api): add GET /api/learning/plan route"
```

---

### Task 6: API Route — Node Start

**Files:**
- Create: `src/app/api/learning/node/start/route.ts`

**Step 1: Create the route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { nodeId } = await req.json();

  // Fetch node with plan ownership check
  const { data: node } = await supabase
    .from("learning_nodes")
    .select("*, learning_plans!inner(user_id)")
    .eq("id", nodeId)
    .single();

  if (!node || node.learning_plans.user_id !== user.id) {
    return NextResponse.json({ error: "Node not found" }, { status: 404 });
  }

  if (node.status !== "available") {
    return NextResponse.json({ error: "Node not available" }, { status: 400 });
  }

  if (node.node_type === "mock_exam") {
    // Mock exam nodes don't need pre-selected questions
    return NextResponse.json({ nodeType: "mock_exam", questions: [] });
  }

  // Fetch questions by IDs
  const { data: questions } = await supabase
    .from("question_banks")
    .select("id, component, content, pinyin, metadata")
    .in("id", node.question_ids);

  return NextResponse.json({
    nodeType: node.node_type,
    component: node.component,
    focusArea: node.focus_area,
    questions: questions ?? [],
  });
}
```

**Step 2: Commit**

```bash
git add src/app/api/learning/node/start/route.ts
git commit -m "feat(api): add POST /api/learning/node/start route"
```

---

### Task 7: API Route — Node Complete

**Files:**
- Create: `src/app/api/learning/node/complete/route.ts`

**Step 1: Create the route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkAndUnlockAchievements } from "@/lib/achievements/check";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { nodeId, score, xpEarned, durationSeconds } = await req.json();

  // Fetch node with plan
  const { data: node } = await supabase
    .from("learning_nodes")
    .select("*, learning_plans!inner(id, user_id, current_phase)")
    .eq("id", nodeId)
    .single();

  if (!node || node.learning_plans.user_id !== user.id) {
    return NextResponse.json({ error: "Node not found" }, { status: 404 });
  }

  // Update node
  await supabase
    .from("learning_nodes")
    .update({
      status: "completed",
      score,
      xp_earned: xpEarned ?? 0,
      completed_at: new Date().toISOString(),
    })
    .eq("id", nodeId);

  // Check phase completion
  const { data: phaseNodes } = await supabase
    .from("learning_nodes")
    .select("status")
    .eq("plan_id", node.plan_id)
    .eq("phase", node.phase);

  const allPhaseComplete = (phaseNodes ?? []).every((n) => n.status === "completed");
  const completedInPhase = (phaseNodes ?? []).filter((n) => n.status === "completed").length;
  const totalInPhase = phaseNodes?.length ?? 0;

  // Check if checkpoint is ready (all drill nodes in phase complete)
  const isCheckpointReady = allPhaseComplete && node.phase < 4;

  return NextResponse.json({
    xpEarned: xpEarned ?? 0,
    phaseProgress: { completed: completedInPhase, total: totalInPhase },
    isCheckpointReady,
    isLastPhase: node.phase === 4,
    allPhaseComplete,
  });
}
```

**Step 2: Commit**

```bash
git add src/app/api/learning/node/complete/route.ts
git commit -m "feat(api): add POST /api/learning/node/complete route"
```

---

### Task 8: API Route — Checkpoint Complete

**Files:**
- Create: `src/app/api/learning/checkpoint/complete/route.ts`

**Step 1: Create the route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateCheckpointFeedback, generateCurriculum } from "@/lib/gemini/client";
import { checkAndUnlockAchievements } from "@/lib/achievements/check";

function getPSCGrade(score: number): string {
  if (score >= 97) return "一级甲等";
  if (score >= 92) return "一级乙等";
  if (score >= 87) return "二级甲等";
  if (score >= 80) return "二级乙等";
  if (score >= 70) return "三级甲等";
  if (score >= 60) return "三级乙等";
  return "不达标";
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { planId, checkpointNumber, scores } = await req.json();

  // Fetch plan
  const { data: plan } = await supabase
    .from("learning_plans")
    .select("*")
    .eq("id", planId)
    .eq("user_id", user.id)
    .single();

  if (!plan) return NextResponse.json({ error: "Plan not found" }, { status: 404 });

  // Get previous scores (from last checkpoint or initial)
  const { data: prevCheckpoints } = await supabase
    .from("learning_checkpoints")
    .select("scores")
    .eq("plan_id", planId)
    .order("checkpoint_number", { ascending: false })
    .limit(1);

  const previousScores = prevCheckpoints?.[0]?.scores ?? plan.initial_scores;

  // Calculate deltas
  const scoreDeltas: Record<string, number> = {};
  for (const key of Object.keys(scores)) {
    scoreDeltas[key] = (scores[key] ?? 0) - (previousScores[key as keyof typeof previousScores] ?? 0);
  }

  // Get completed nodes for feedback context
  const { data: completedNodes } = await supabase
    .from("learning_nodes")
    .select("component, focus_area")
    .eq("plan_id", planId)
    .eq("status", "completed");

  // Calculate weighted PSC grade
  const weights: Record<string, number> = { c1: 0.10, c2: 0.20, c3: 0.10, c4: 0.30, c5: 0.30 };
  const weightedScore = Object.entries(scores).reduce(
    (sum, [k, v]) => sum + (v as number) * (weights[k] ?? 0), 0
  );
  const predictedGrade = getPSCGrade(weightedScore);

  // Generate LLM feedback
  const llmFeedback = await generateCheckpointFeedback({
    currentScores: scores,
    previousScores: previousScores as Record<string, number>,
    checkpointNumber,
    completedNodes: (completedNodes ?? []).map((n) => ({
      component: n.component,
      focusArea: n.focus_area,
    })),
  });

  // Save checkpoint
  await supabase.from("learning_checkpoints").insert({
    plan_id: planId,
    checkpoint_number: checkpointNumber,
    scores,
    score_deltas: scoreDeltas,
    llm_feedback: llmFeedback,
    predicted_grade: predictedGrade,
  });

  // Advance phase
  const nextPhase = checkpointNumber + 1;
  await supabase
    .from("learning_plans")
    .update({ current_phase: nextPhase })
    .eq("id", planId);

  // Delete uncompleted nodes in remaining phases
  await supabase
    .from("learning_nodes")
    .delete()
    .eq("plan_id", planId)
    .in("status", ["locked", "available"])
    .gt("phase", checkpointNumber);

  // Regenerate remaining phases via LLM
  const daysRemaining = Math.max(1, Math.ceil(
    (new Date(plan.exam_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  ));

  const questionPromises = [1, 2, 3, 4, 5, 6, 7].map((comp) =>
    supabase.from("question_banks").select("id").eq("component", comp)
  );
  const questionResults = await Promise.all(questionPromises);
  const availableQuestionIds: Record<number, string[]> = {};
  questionResults.forEach((res, i) => {
    availableQuestionIds[i + 1] = (res.data ?? []).map((q) => q.id);
  });

  const newCurriculum = await generateCurriculum({
    scores,
    daysRemaining,
    availableQuestionIds,
    recentQuestionTexts: [],
    previousCheckpoints: [{ scores, completedNodes: (completedNodes ?? []).map((n) => ({ component: n.component, focusArea: n.focus_area })) }],
  });

  // Insert only phases after current checkpoint
  const remainingPhases = newCurriculum.phases.filter((p) => p.phase > checkpointNumber);
  const newNodeRows = remainingPhases.flatMap((phase) =>
    phase.nodes.map((node, i) => ({
      plan_id: planId,
      phase: phase.phase,
      component: node.component,
      node_type: node.nodeType ?? "drill",
      focus_area: node.focusArea,
      question_ids: node.questionIds ?? [],
      sort_order: i,
      status: phase.phase === nextPhase ? "available" : "locked",
    }))
  );

  if (newNodeRows.length > 0) {
    await supabase.from("learning_nodes").insert(newNodeRows);
  }

  // Update total_nodes count
  const { count } = await supabase
    .from("learning_nodes")
    .select("id", { count: "exact", head: true })
    .eq("plan_id", planId);

  await supabase
    .from("learning_plans")
    .update({ total_nodes: count ?? 0 })
    .eq("id", planId);

  // Check achievements
  const achievementContext = checkpointNumber === 1
    ? "learning_checkpoint_1"
    : checkpointNumber === 3
    ? "learning_all_checkpoints"
    : null;

  const newAchievements = await checkAndUnlockAchievements(
    supabase, user.id,
    { type: "learning_checkpoint" as never, checkpointNumber }
  );

  // Fetch updated nodes
  const { data: updatedNodes } = await supabase
    .from("learning_nodes")
    .select("*")
    .eq("plan_id", planId)
    .order("phase")
    .order("sort_order");

  return NextResponse.json({
    feedback: llmFeedback,
    predictedGrade,
    scoreDeltas,
    updatedNodes: updatedNodes ?? [],
    newAchievements,
  });
}
```

**Step 2: Commit**

```bash
git add src/app/api/learning/checkpoint/complete/route.ts
git commit -m "feat(api): add POST /api/learning/checkpoint/complete route"
```

---

### Task 9: API Route — Report

**Files:**
- Create: `src/app/api/learning/report/route.ts`

**Step 1: Create the route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const planId = searchParams.get("planId");
  const checkpointId = searchParams.get("checkpointId");

  if (checkpointId) {
    // Single checkpoint report
    const { data: checkpoint } = await supabase
      .from("learning_checkpoints")
      .select("*, learning_plans!inner(user_id, initial_scores)")
      .eq("id", checkpointId)
      .single();

    if (!checkpoint || checkpoint.learning_plans.user_id !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ checkpoint });
  }

  if (planId) {
    // Full plan report
    const { data: plan } = await supabase
      .from("learning_plans")
      .select("*")
      .eq("id", planId)
      .eq("user_id", user.id)
      .single();

    if (!plan) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const [{ data: checkpoints }, { data: nodes }] = await Promise.all([
      supabase
        .from("learning_checkpoints")
        .select("*")
        .eq("plan_id", planId)
        .order("checkpoint_number"),
      supabase
        .from("learning_nodes")
        .select("*")
        .eq("plan_id", planId)
        .eq("status", "completed")
        .order("completed_at"),
    ]);

    const totalStudyMinutes = (nodes ?? []).reduce((sum, n) => {
      // Estimate based on node type
      return sum + (n.node_type === "mock_exam" ? 15 : 8);
    }, 0);

    return NextResponse.json({
      plan,
      checkpoints: checkpoints ?? [],
      completedNodes: nodes ?? [],
      totalStudyMinutes,
    });
  }

  return NextResponse.json({ error: "Missing planId or checkpointId" }, { status: 400 });
}
```

**Step 2: Commit**

```bash
git add src/app/api/learning/report/route.ts
git commit -m "feat(api): add GET /api/learning/report route"
```

---

### Task 10: Achievement Definitions — 4 New Achievements

**Files:**
- Modify: `src/lib/achievements/definitions.ts` — add 4 new achievement entries
- Modify: `src/lib/achievements/types.ts` — add `learning_checkpoint` context type
- Modify: `src/lib/achievements/check.ts` — add candidate key logic for learning path

**Step 1: Add context type**

In `src/lib/achievements/types.ts`, add to the `AchievementContext` union:

```typescript
| { type: 'learning_checkpoint'; checkpointNumber: number }
| { type: 'learning_complete' }
```

**Step 2: Add achievement definitions**

In `src/lib/achievements/definitions.ts`, add to the `ACHIEVEMENTS` array:

```typescript
// Learning Path
{ key: "learning_first_step",  name: "First Step (学习启程)",    description: "Complete the initial learning path assessment",    emoji: "📋", tier: "common",   sortOrder: 41 },
{ key: "learning_on_track",    name: "On Track (按部就班)",      description: "Complete the first mid-checkpoint",               emoji: "📊", tier: "uncommon", sortOrder: 42 },
{ key: "learning_adapting",    name: "Adapting (因材施教)",       description: "Complete all 3 mid-checkpoints",                  emoji: "🎯", tier: "rare",     sortOrder: 43 },
{ key: "learning_exam_ready",  name: "Exam Ready (胸有成竹)",    description: "Complete an entire learning plan",                emoji: "🎓", tier: "epic",     sortOrder: 44 },
```

Update `TOTAL_ACHIEVEMENTS` to `40` (was 36, +4).

**Step 3: Add check logic**

In `src/lib/achievements/check.ts`, add to `getCandidateKeys()`:

```typescript
case "learning_checkpoint": {
  const keys = ["learning_on_track"];
  if (context.checkpointNumber >= 3) keys.push("learning_adapting");
  return keys;
}
case "learning_complete":
  return ["learning_exam_ready"];
```

The `learning_first_step` achievement should be triggered separately when the initial assessment is completed (from the client or a dedicated API endpoint).

**Step 4: Add verification conditions**

In `verifyConditions()` within `check.ts`, add:

```typescript
if (key === "learning_adapting") {
  const { count } = await supabase
    .from("learning_checkpoints")
    .select("id", { count: "exact", head: true })
    .eq("plan_id", /* need plan_id from context */);
  // Simplification: check total checkpoints across all plans
  const { data: plans } = await supabase
    .from("learning_plans")
    .select("id")
    .eq("user_id", userId);
  const planIds = (plans ?? []).map(p => p.id);
  if (planIds.length > 0) {
    const { count: cpCount } = await supabase
      .from("learning_checkpoints")
      .select("id", { count: "exact", head: true })
      .in("plan_id", planIds);
    if ((cpCount ?? 0) < 3) return false;
  }
  return true;
}
```

**Step 5: Apply migration to seed new achievements**

Use Supabase MCP `apply_migration` with name `add_learning_path_achievements`:

```sql
INSERT INTO achievements (key, name, description, emoji, tier, sort_order) VALUES
  ('learning_first_step', 'First Step (学习启程)', 'Complete the initial learning path assessment', '📋', 'common', 41),
  ('learning_on_track', 'On Track (按部就班)', 'Complete the first mid-checkpoint', '📊', 'uncommon', 42),
  ('learning_adapting', 'Adapting (因材施教)', 'Complete all 3 mid-checkpoints', '🎯', 'rare', 43),
  ('learning_exam_ready', 'Exam Ready (胸有成竹)', 'Complete an entire learning plan', '🎓', 'epic', 44);
```

**Step 6: Run tests**

Run: `npx vitest run src/lib/achievements/`
Expected: existing achievement tests still pass.

**Step 7: Commit**

```bash
git add src/lib/achievements/ && git commit -m "feat(achievements): add 4 learning path achievements"
```

---

### Task 11: Dashboard Tile

**Files:**
- Modify: `src/app/(main)/dashboard/dashboard-client.tsx` — add Learning Path to `MENU_ITEMS`

**Step 1: Add the tile**

In `dashboard-client.tsx`, import `GraduationCap` from `lucide-react` and add to `MENU_ITEMS` array (insert as the 3rd item, after Mock Exam):

```typescript
{ href: "/learning-path", icon: GraduationCap, label: "Learning Path", description: "Personalized PSC study plan with adaptive curriculum" },
```

**Step 2: Verify visually**

Run: `npm run dev` and navigate to `/dashboard`. Confirm the new tile appears.

**Step 3: Commit**

```bash
git add src/app/(main)/dashboard/dashboard-client.tsx
git commit -m "feat(dashboard): add learning path tile"
```

---

### Task 12: Page Server Component + Loading Skeleton

**Files:**
- Create: `src/app/(main)/learning-path/page.tsx`
- Create: `src/app/(main)/learning-path/loading.tsx`

**Step 1: Create loading skeleton**

Create `src/app/(main)/learning-path/loading.tsx`:

```tsx
import { Skeleton } from "@/components/ui/skeleton";

export default function LearningPathLoading() {
  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-72" />
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-24 shrink-0 rounded-full" />
        ))}
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
```

**Step 2: Create server page**

Create `src/app/(main)/learning-path/page.tsx`:

```tsx
import dynamic from "next/dynamic";
import { createClient } from "@/lib/supabase/server";
import { loadSelectedCharacter } from "@/lib/characters";

const LearningPathClient = dynamic(
  () => import("./learning-path-client"),
  { ssr: false }
);

export default async function LearningPathPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user!.id;

  // Fetch in parallel: active plan, character, question counts, quest progress
  const [
    character,
    { data: activePlan },
    { data: c1Questions },
    { data: c2Questions },
    { data: c3Questions },
    { data: c4Passages },
    { data: c5Topics },
  ] = await Promise.all([
    loadSelectedCharacter(supabase, userId),
    supabase
      .from("learning_plans")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // Fetch questions for assessment (30% of mock exam counts)
    supabase.from("question_banks").select("content").eq("component", 1).limit(100),
    supabase.from("question_banks").select("content").eq("component", 2).limit(100),
    supabase.from("question_banks").select("id, content, metadata").eq("component", 3).limit(500),
    supabase.from("question_banks").select("id, content, metadata").eq("component", 4).limit(50),
    supabase.from("question_banks").select("content").eq("component", 5).limit(150),
  ]);

  // Prepare assessment questions (30% of full mock exam)
  const shuffle = <T,>(arr: T[]): T[] => [...arr].sort(() => Math.random() - 0.5);

  const assessmentCharacters = shuffle((c1Questions ?? []).map((q) => q.content)).slice(0, 10);
  const assessmentWords = shuffle((c2Questions ?? []).map((q) => q.content)).slice(0, 10);

  // Parse C3 quiz questions
  const allQuiz = (c3Questions ?? []).map((q) => {
    const meta = q.metadata as { type?: string; options?: string[]; correctIndex?: number; explanation?: string };
    return { id: q.id, type: meta?.type ?? "", prompt: q.content, options: meta?.options ?? [], correctIndex: meta?.correctIndex ?? 0, explanation: meta?.explanation ?? "" };
  });
  const assessmentQuiz = [
    ...shuffle(allQuiz.filter((q) => q.type === "word-choice")).slice(0, 3),
    ...shuffle(allQuiz.filter((q) => q.type === "measure-word")).slice(0, 3),
    ...shuffle(allQuiz.filter((q) => q.type === "sentence-order")).slice(0, 2),
  ];

  // C4: 1 passage
  const allPassages = (c4Passages ?? []).map((q) => {
    const meta = q.metadata as { title?: string; passage_number?: number };
    return { id: q.id, title: meta?.title ?? "", content: q.content, passageNumber: meta?.passage_number ?? null };
  });
  const assessmentPassage = shuffle(allPassages)[0] ?? null;

  // C5: 1 topic from pool of 6
  const assessmentTopics = shuffle((c5Topics ?? []).map((q) => q.content)).slice(0, 6);

  // Fetch nodes and checkpoints if plan exists
  let nodes = null;
  let checkpoints = null;
  if (activePlan) {
    const [{ data: n }, { data: c }] = await Promise.all([
      supabase.from("learning_nodes").select("*").eq("plan_id", activePlan.id).order("phase").order("sort_order"),
      supabase.from("learning_checkpoints").select("*").eq("plan_id", activePlan.id).order("checkpoint_number"),
    ]);
    nodes = n;
    checkpoints = c;
  }

  return (
    <LearningPathClient
      character={{ ...character, id: character.id ?? "" }}
      activePlan={activePlan}
      nodes={nodes}
      checkpoints={checkpoints}
      assessmentData={{
        characters: assessmentCharacters,
        words: assessmentWords,
        quizQuestions: assessmentQuiz,
        passage: assessmentPassage,
        topics: assessmentTopics,
      }}
    />
  );
}
```

**Step 3: Commit**

```bash
git add src/app/(main)/learning-path/
git commit -m "feat(learning-path): add server page and loading skeleton"
```

---

### Task 13: Client Component — State Machine & All Views

This is the largest task. The client component manages the entire feature UI.

**Files:**
- Create: `src/app/(main)/learning-path/learning-path-client.tsx`

**Step 1: Create the client component**

This is a large file (~800-1000 lines). Build it with these internal sections:

1. **Props interface and types**
2. **State machine** (`welcome | assessment | time_input | generating | roadmap | node_session | checkpoint | checkpoint_report | final_report`)
3. **WelcomeScreen** — intro card with "Start Assessment" button
4. **AssessmentRunner** — inline mini-exam running C1→C2→C3→C4→C5 sequentially at 30% counts. Reuse the sub-component patterns from `exam-runner.tsx` (PronunciationComponent, QuizComponent, PassageComponent, SpeakingComponent) but with reduced item counts. After all 5, collect scores and transition to `time_input`.
5. **ExamDateInput** — date picker + days remaining display + "Generate My Plan" button
6. **CurriculumRoadmap** — horizontally scrollable div with phase sections, node circles, checkpoint diamonds. Each node shows component icon + focus area label. Tappable if status is `available`.
7. **NodeSession** — wrapper that fetches questions via `/api/learning/node/start`, then renders the appropriate existing practice component (`PracticeSession` / `QuizSession` / `ReadingSession` / `SpeakingSession`) with the curated questions. On completion, calls `/api/learning/node/complete`.
8. **CheckpointRunner** — same assessment format as initial (30% mock exam). On completion, calls `/api/learning/checkpoint/complete`.
9. **CheckpointReport** — score table with delta badges, radar chart placeholder (can use a simple bar comparison initially), LLM feedback, predicted grade.
10. **FinalReport** — growth trajectory, total stats, completion celebration.

Key implementation notes:
- Import existing sub-components from `../mock-exam/exam-runner` if they are exported, OR replicate the pattern inline (recording → deferred assessment).
- For the roadmap visualization, use a flex row with `overflow-x-auto` and CSS for the connecting line, node circles, and checkpoint diamonds.
- Use `fetchWithRetry` from `@/lib/fetch` for all API calls.
- Use `pixel-border`, `chinese-corner`, `font-pixel`, `font-chinese` throughout.
- Call `/api/progress/update` from node completion to integrate with XP/streak system.

**The exact component code should be written during implementation** — this task is large enough that the implementer should reference:
- `src/app/(main)/mock-exam/exam-runner.tsx` for assessment UI patterns
- `src/app/(main)/dashboard/dashboard-client.tsx` for theming patterns
- `src/app/(main)/component-{1-5}/` for practice session prop patterns

**Step 2: Verify it renders**

Run: `npm run dev` and navigate to `/learning-path`. Confirm the welcome screen appears.

**Step 3: Commit**

```bash
git add src/app/(main)/learning-path/learning-path-client.tsx
git commit -m "feat(learning-path): add client component with full state machine UI"
```

---

### Task 14: Integration Testing & Polish

**Files:**
- All learning-path files from previous tasks

**Step 1: End-to-end manual test flow**

1. Navigate to `/dashboard`, click "Learning Path" tile
2. See welcome screen, click "Start Assessment"
3. Complete mini-exam (C1-C5 at 30% counts)
4. See scores, enter exam date, click "Generate My Plan"
5. See roadmap with nodes populate
6. Click a Phase 1 node, complete the drill
7. Complete all Phase 1 nodes
8. Run Checkpoint 1 (30% exam)
9. See feedback report with deltas and LLM analysis
10. Verify remaining phases regenerated

**Step 2: Fix any issues found during testing**

Address bugs, UI glitches, or API errors.

**Step 3: Run lint and type checks**

Run: `npm run lint && npx tsc --noEmit`
Expected: No errors.

**Step 4: Commit any fixes**

```bash
git add -A && git commit -m "fix(learning-path): polish and integration fixes"
```

---

### Task 15: Plan Completion & Final Achievement

**Files:**
- Modify: `src/app/(main)/learning-path/learning-path-client.tsx` — handle plan completion
- Modify: API checkpoint/node routes as needed

**Step 1: Handle Phase 4 completion**

When the last node in Phase 4 is completed:
1. Update `learning_plans.status` to `"completed"`
2. Trigger `learning_complete` achievement check
3. Transition to `final_report` view

**Step 2: Build final report view**

The final report shows:
- Initial scores vs final checkpoint scores (all 4 measurement points)
- Per-component improvement percentages
- Total nodes completed, estimated study hours
- Final predicted PSC grade
- Celebration animation (confetti or similar, pixel-art style)

**Step 3: Commit**

```bash
git add -A && git commit -m "feat(learning-path): add plan completion and final report"
```

---

## Summary of Tasks

| # | Task | Estimated Effort |
|---|------|-----------------|
| 1 | Database migration (3 tables + RLS) | Small |
| 2 | TypeScript types | Small |
| 3 | LLM curriculum generation functions | Medium |
| 4 | API: generate-plan | Medium |
| 5 | API: get plan | Small |
| 6 | API: node start | Small |
| 7 | API: node complete | Small |
| 8 | API: checkpoint complete | Large |
| 9 | API: report | Small |
| 10 | Achievement definitions + check logic | Medium |
| 11 | Dashboard tile | Small |
| 12 | Server page + loading skeleton | Medium |
| 13 | Client component (state machine + all views) | Large |
| 14 | Integration testing & polish | Medium |
| 15 | Plan completion & final achievement | Medium |

Tasks 1-2 must be done first. Tasks 3-10 can be done in any order after that. Tasks 11-12 depend on types (Task 2). Task 13 depends on all API routes (Tasks 4-9) and the page (Task 12). Tasks 14-15 depend on Task 13.
