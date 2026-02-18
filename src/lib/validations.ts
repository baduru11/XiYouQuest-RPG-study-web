import { z } from "zod";

// Reusable UUID validator
const uuid = z.string().uuid();

// --- Social API Schemas ---

export const friendRequestSchema = z.object({
  addressee_id: uuid,
});

export const friendRespondSchema = z.object({
  friendship_id: uuid,
  action: z.enum(["accept", "reject"]),
});

// --- Progress API Schemas ---

export const progressUpdateSchema = z.object({
  characterId: uuid,
  component: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6), z.literal(7)]),
  score: z.number().min(0).max(100),
  xpEarned: z.number().min(0),
  durationSeconds: z.number().min(0).optional().default(0),
  questionsAttempted: z.number().int().min(0).optional().default(0),
  questionsCorrect: z.number().int().min(0).optional().default(0),
  bestStreak: z.number().int().min(0).optional().default(0),
});

// --- AI API Schemas ---

export const aiFeedbackSchema = z.object({
  characterPrompt: z.string().min(1),
  component: z.number().int().min(1).max(7),
  questionText: z.string().min(1),
  userAnswer: z.string(),
  pronunciationScore: z.number().min(0).max(100).optional(),
  isCorrect: z.boolean(),
});

// --- TTS API Schemas ---

export const ttsSpeakSchema = z.object({
  voiceId: z.string().min(1),
  text: z.string().min(1),
});

export const ttsCompanionSchema = z.object({
  voiceId: z.string().min(1),
  text: z.string().min(1),
});

// --- Leaderboard API Schemas ---

export const leaderboardQuerySchema = z.object({
  tab: z.enum(["xp", "accuracy", "streak"]),
  scope: z.enum(["global", "friends"]),
});

// --- Helpers ---

/** Validate UUID format (for query params and array values) */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isValidUUID(value: string): boolean {
  return UUID_REGEX.test(value);
}
