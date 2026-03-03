# Personalized Learning Path Design

Date: 2026-03-03

## Overview

Adaptive, LLM-curated study plan for PSC exam preparation. Users take an initial skill assessment, enter their exam date, and receive a personalized curriculum as a horizontal roadmap with 4 phases separated by 3 mid-assessment checkpoints. The LLM selects questions from the existing database to target weaknesses. At each checkpoint, skills are re-assessed and the remaining curriculum dynamically adjusts. The final phase focuses on mock exams. Full gamification integration with XP, streaks, and achievements.

## User Flow

State machine: `welcome → initial_assessment → time_input → curriculum_view → (node_session | checkpoint) → summary`

1. **Welcome Screen** — intro explaining the feature. "Take a short assessment, tell us your exam date, and we'll build your personalized study plan." Button: "Start Assessment".
2. **Initial Assessment** — 30% mock exam covering all 5 PSC components (~10 C1 chars, ~10 C2 words, ~8 C3 MCQs, 1 C4 passage, 1 C5 topic). Uses a trimmed version of the existing ExamRunner. ~10-15 min.
3. **Results Screen** — per-component scores displayed, weak areas highlighted in vermilion.
4. **Exam Date Input** — free date picker input. Days remaining calculated and displayed.
5. **Curriculum Generation** — LLM called with skill profile + days remaining. Loading screen while plan generates.
6. **Curriculum Roadmap** — the home base. Horizontally scrollable timeline with nodes and checkpoints. User picks any available node within the current phase.
7. **Return Visits** — go straight to the roadmap, pick up where left off.

## Route Structure

```
src/app/(main)/learning-path/
├── page.tsx                      # Server: fetch active plan, checkpoints, progress
├── loading.tsx                   # Skeleton
├── learning-path-client.tsx      # Client: state machine, roadmap, all views
```

Dashboard tile: icon `GraduationCap`, label "Learning Path / 学习计划", href `/learning-path`.

## Database Schema

### `learning_plans`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `user_id` | uuid FK → profiles | RLS: own rows only |
| `exam_date` | date | User's target PSC exam date |
| `initial_scores` | jsonb | `{ c1: 82, c2: 75, c3: 90, c4: 68, c5: 71 }` |
| `current_phase` | int | 1-4 |
| `total_nodes` | int | LLM-decided count |
| `status` | text | `active`, `completed`, `abandoned` |
| `created_at` | timestamptz | |

### `learning_nodes`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `plan_id` | uuid FK → learning_plans | |
| `phase` | int | 1-4 |
| `component` | int | 1-7 |
| `node_type` | text | `drill` or `mock_exam` |
| `focus_area` | text | LLM description, e.g. "Tone 2-3 confusion" |
| `question_ids` | uuid[] | Pre-selected from `question_banks` |
| `sort_order` | int | Display order within phase |
| `status` | text | `locked`, `available`, `completed` |
| `score` | float | Null until completed |
| `xp_earned` | int | |
| `completed_at` | timestamptz | |

### `learning_checkpoints`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `plan_id` | uuid FK → learning_plans | |
| `checkpoint_number` | int | 1-3 |
| `scores` | jsonb | Same shape as `initial_scores` |
| `score_deltas` | jsonb | `{ c1: +8, c2: -3, ... }` |
| `llm_feedback` | text | LLM-generated analysis text |
| `predicted_grade` | text | e.g. "二级甲等" |
| `completed_at` | timestamptz | |

No new columns on existing tables. XP flows through the existing `practice_sessions` table — each node completion creates a `practice_sessions` row as usual.

## Curriculum Roadmap

### Visualization

Horizontally scrollable timeline divided into 4 phases, separated by 3 checkpoint diamonds. Each phase contains practice nodes as circles/cards along a connecting path line.

- **Completed nodes**: filled/solid
- **Available nodes**: outlined, tappable
- **Locked nodes**: dimmed (future phases or past uncompleted checkpoint)

**Top bar**: overall progress %, days remaining countdown, current skill level estimate.

### Phase Rules

- Nodes within a phase can be completed in **any order** (not strictly sequential)
- The checkpoint at the end of a phase **must** be completed before the next phase unlocks
- Phase 4 (final) is mostly `mock_exam` type nodes rather than targeted drills

### Node Structure

Each node stores:
- Target component (C1-C7)
- Focus area description from LLM (e.g., "Tone 2-3 pairs", "Measure word drills")
- Curated question IDs from `question_banks` (pre-selected by LLM)
- Estimated duration (~5-10 min)
- Completion status and score

### Node Count Scaling

LLM decides total node count based on days remaining. Rough heuristic in the prompt: ~1-2 nodes per available study day. Distribution: Phase 1 heaviest on weak areas, Phase 4 at least 25% of total nodes as mock exams.

## Node Sessions

When a user taps a node and starts it:

- **Drill nodes**: Targeted mini-session with 10-15 questions from the database, pre-selected by the LLM to focus on specific weaknesses. Renders using the existing practice UI for that component (`PracticeSession` for C1/C2/C6, `QuizSession` for C3/C7, `ReadingSession` for C4, `SpeakingSession` for C5).
- **Mock exam nodes**: Full mock exam using the existing `ExamRunner`.

No new practice UI needed — nodes launch existing components with a curated question set.

## LLM Curriculum Generation

### When Called

4 times total:
1. After initial assessment — generates full 4-phase plan
2-4. After each mid-checkpoint — regenerates remaining phases only

### Input to LLM (DeepSeek via OpenRouter)

- Per-component scores (C1-C5, plus sub-scores like tone accuracy, fluency, grammar)
- Days remaining until exam
- Available question IDs from `question_banks` per component
- For regeneration: previous checkpoint scores with deltas, completed node history
- Recent `practice_details` question texts (to avoid repeating questions)

### LLM Output (Structured JSON)

```json
{
  "phases": [
    {
      "phase": 1,
      "nodes": [
        {
          "component": 1,
          "focusArea": "Tone 2-3 confusion",
          "focusDescription": "Practice distinguishing second and third tone characters",
          "questionIds": ["uuid1", "uuid2", "..."],
          "estimatedMinutes": 8
        }
      ]
    }
  ]
}
```

### Prompt Strategy

System prompt instructs DeepSeek to act as a PSC exam tutor. Key rules:
- Prioritize weakest components but don't ignore strong ones entirely
- Scale total node count to ~1-2 per available study day
- Phase 4 must be at least 25% of total nodes, all mock exam format
- Select question IDs that the user hasn't recently practiced
- Keep each node to 10-15 questions max

### Fallback

If LLM fails after retries, generate a rule-based curriculum using score percentages to weight component distribution. No LLM narrative — just proportional allocation.

## Mid-Assessment Checkpoints

### Format

All 3 checkpoints use the same 30% mock exam format as the initial assessment (~10 C1, ~10 C2, ~8 C3, 1 C4, 1 C5). Consistent measurement for meaningful progress comparison. Weak areas emphasized/highlighted in results.

### Feedback Report

After each checkpoint, a report screen shows:

1. **Score breakdown table** — each component's score with delta badge vs. previous checkpoint (+8 green, -3 red, = grey). Weak areas highlighted with vermilion background.

2. **Radar chart** — 5-axis chart (C1-C5) with overlaid outlines for initial assessment vs. current checkpoint. Visual growth comparison.

3. **LLM-written analysis** — 2-3 paragraphs in Chinese with English translation toggle. Covers: what improved, what still needs work, specific advice for the next phase.

4. **Predicted PSC grade** — estimated grade band (一级甲等 through 三级乙等) based on current scores with confidence indicator.

### Post-Report Curriculum Update

After the report, LLM regenerates remaining phases. Updated roadmap appears with changes visually highlighted (new/removed/reordered nodes get "Updated" badge). User can compare old vs. new plan.

## Final Summary

After completing Phase 4, a comprehensive final report shows:
- Growth trajectory across all checkpoints (initial → CP1 → CP2 → CP3 → final)
- Total study hours and nodes completed
- Per-component improvement percentages
- Final predicted PSC grade
- LLM-generated comprehensive feedback

## API Routes

### `POST /api/learning/assess`
Runs the 30% mock exam assessment. Reuses existing scoring pipelines (ISE for C1/C2/C4, quiz logic for C3, ASR+DeepSeek for C5). Returns per-component scores.

### `POST /api/learning/generate-plan`
- Input: `{ scores, examDate }`
- Calls DeepSeek with score profile + days remaining + available question IDs
- Creates `learning_plans` row + all `learning_nodes` rows
- Returns: `{ planId, phases[], totalNodes }`

### `GET /api/learning/plan`
- Returns current active plan with all nodes and checkpoints
- Used by the roadmap UI on every visit

### `POST /api/learning/node/start`
- Input: `{ nodeId }`
- Returns: `{ questions[] }` — fetches pre-selected questions from `question_banks` by stored `question_ids`
- Client renders the appropriate practice UI based on `component`

### `POST /api/learning/node/complete`
- Input: `{ nodeId, score, details[] }`
- Updates node status, saves score, creates `practice_sessions` row for XP
- Returns: `{ xpEarned, phaseProgress, isCheckpointReady }`

### `POST /api/learning/checkpoint/complete`
- Input: `{ planId, checkpointNumber, scores }`
- Saves to `learning_checkpoints` with deltas calculated from previous
- Calls DeepSeek for feedback report + curriculum regeneration
- Deletes uncompleted nodes in remaining phases, inserts new ones
- Returns: `{ feedback, predictedGrade, updatedPhases[] }`

### `GET /api/learning/report`
- Query: `?planId=xxx` for final summary or `?checkpointId=xxx` for checkpoint report
- Returns all score history, deltas, LLM feedback, growth trajectory

## UI Components

All within `learning-path-client.tsx`:

- **WelcomeScreen** — intro text + "Start Assessment" button (first visit only)
- **AssessmentRunner** — trimmed ExamRunner (30% question counts), reuses existing practice UIs
- **ExamDateInput** — date picker with computed "days remaining" display
- **CurriculumRoadmap** — horizontally scrollable timeline with phase sections, node circles, checkpoint diamonds, connecting path line, progress bar overlay, days-remaining countdown
- **NodeCard** — shows component icon, focus area, estimated time, score (if completed). "Start" button to launch session.
- **NodeSession** — wraps existing PracticeSession / QuizSession / ReadingSession / SpeakingSession with pre-selected question set
- **CheckpointReport** — score table with delta badges, radar chart, LLM feedback block, predicted grade badge
- **FinalReport** — full growth trajectory across all checkpoints, total stats

### Theme Compliance

All components use: `pixel-border`, `chinese-corner`, `font-pixel` (labels), `font-chinese` (content text), warm cream + vermilion palette. Respects `prefers-reduced-motion`.

## Gamification

### XP Per Node

Same tiers as practice:
- Score >=95: 10 XP (perfect)
- Score >=80: 5 XP (good)
- Score <80: 2 XP (attempted)
- Session cap: 2000 XP (existing limit)

### Streaks

Completing a node or checkpoint counts as daily activity for login streak.

### Achievements (4 new)

| Name | Tier | Trigger |
|------|------|---------|
| First Step (学习启程) | Common | Complete initial assessment |
| On Track (按部就班) | Uncommon | Complete first mid-checkpoint |
| Adapting (因材施教) | Rare | Complete all 3 mid-checkpoints |
| Exam Ready (胸有成竹) | Epic | Complete entire learning plan |

Triggered via `learning_path` events in existing achievement system.

## Technical Notes

- Reuses existing `ExamRunner` component (trimmed for 30% counts)
- Reuses existing `PracticeSession`, `QuizSession`, `ReadingSession`, `SpeakingSession` components
- Reuses existing ISE, ASR, and AI scoring pipelines
- Reuses existing `fetchWithRetry()` wrapper for all API calls
- OpenRouter/DeepSeek client from `src/lib/gemini/client.ts`
- New function in gemini client for curriculum generation (structured JSON output)
- Types added to `src/types/database.ts`
- Only 1 active learning plan per user at a time (starting a new one abandons the old)
