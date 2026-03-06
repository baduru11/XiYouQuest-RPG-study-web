import { z } from "npm:zod";

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

export const aiInsightsSchema = z.object({
  progress: z
    .union([
      z.record(z.string().max(20), z.number().min(0).max(100)),
      z
        .array(
          z
            .object({
              component: z.number().int().min(1).max(7),
            })
            .passthrough(),
        )
        .max(7),
    ])
    .optional(),
  recentSessions: z
    .array(
      z
        .object({
          component: z.number().int().min(1).max(7),
          score: z.number().min(0).max(100),
          created_at: z.string(),
        })
        .passthrough(),
    )
    .max(20)
    .optional(),
  questProgress: z
    .array(
      z
        .object({
          stage: z.number().int().min(1).max(7),
          is_cleared: z.boolean(),
          best_score: z.number().min(0).max(500),
        })
        .passthrough(),
    )
    .max(7)
    .optional(),
});

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
  conversationSummary: z.string().min(1).max(2000),
  characterName: z.string().max(100).optional(),
  scenarioTitle: z.string().max(200).optional(),
});

// --- Helpers ---

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isValidUUID(value: string): boolean {
  return UUID_REGEX.test(value);
}
