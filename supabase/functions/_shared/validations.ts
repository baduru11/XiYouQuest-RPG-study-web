import { z } from "npm:zod@3.25.76";

// Reusable UUID validator
const uuid = z.string().uuid();

// --- AI API Schemas ---

export const aiFeedbackSchema = z.object({
  characterId: uuid,
  component: z.number().int().min(1).max(7),
  questionText: z.string().min(1).max(500),
  userAnswer: z.string().max(1000),
  pronunciationScore: z.number().min(0).max(100).optional(),
  isCorrect: z.boolean(),
});

// --- AI Insights Schema ---

// BEGIN aiInsightsSchema (mirrored in both runtimes; parity-tested)
// Only the fields the analysis needs reach the LLM prompt. Unknown keys (row
// ids, the student's user_id, joined objects such as characters(name)) are
// stripped, and every string and array is bounded so a request cannot inflate
// the prompt that is sent to the model provider.
const insightTimestamp = z.string().max(40);
const insightCount = z.number().min(0).max(10_000_000);

export const aiInsightsSchema = z.object({
  progress: z
    .union([
      z
        .record(z.string().max(20), z.number().min(0).max(100))
        .refine((scores) => Object.keys(scores).length <= 16, {
          message: "Too many progress entries",
        }),
      z
        .array(
          z.object({
            component: z.number().int().min(1).max(7),
            questions_attempted: insightCount.optional(),
            questions_correct: insightCount.optional(),
            best_streak: insightCount.optional(),
            total_practice_time_seconds: insightCount.optional(),
            last_practiced_at: insightTimestamp.nullable().optional(),
          }),
        )
        .max(7),
    ])
    .optional(),
  recentSessions: z
    .array(
      z.object({
        component: z.number().int().min(1).max(7),
        score: z.number().min(0).max(100),
        created_at: insightTimestamp,
        xp_earned: insightCount.nullable().optional(),
        duration_seconds: insightCount.nullable().optional(),
      }),
    )
    .max(20)
    .optional(),
  questProgress: z
    .array(
      z.object({
        stage: z.number().int().min(1).max(7),
        is_cleared: z.boolean(),
        best_score: z.number().min(0).max(500),
        attempts: insightCount.nullable().optional(),
        cleared_at: insightTimestamp.nullable().optional(),
      }),
    )
    .max(7)
    .optional(),
});
// END aiInsightsSchema

// --- Learning API Schemas ---

export const generatePlanSchema = z.object({
  scores: z.record(
    z.string().regex(/^c[1-7]$/i),
    z.number().min(0).max(100),
  ),
  examDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((s) => !isNaN(new Date(s).getTime()), {
      message: "Invalid date",
    }),
});

// --- Chat API Schemas ---

export const chatStartSchema = z.object({
  characterId: uuid,
  scenarioId: uuid,
});

export const chatGenerateImageSchema = z.object({
  sessionId: uuid,
}).strict();

// --- Helpers ---

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isValidUUID(value: string): boolean {
  return UUID_REGEX.test(value);
}
