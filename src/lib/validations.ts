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
  component: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  score: z.number().min(0).max(100),
  xpEarned: z.number().min(0),
  durationSeconds: z.number().min(0).optional().default(0),
  questionsAttempted: z.number().int().min(0).optional().default(0),
  questionsCorrect: z.number().int().min(0).optional().default(0),
  bestStreak: z.number().int().min(0).optional().default(0),
});

export const selectCharacterSchema = z.object({
  characterId: uuid,
});

export const unlockCharacterSchema = z.object({
  characterId: uuid,
});

// --- AI API Schemas ---

export const aiFeedbackSchema = z.object({
  characterPrompt: z.string().min(1),
  component: z.number().int().min(1).max(5),
  questionText: z.string().min(1),
  userAnswer: z.string(),
  pronunciationScore: z.number().min(0).max(100).optional(),
  isCorrect: z.boolean(),
});

export const aiGenerateSchema = z.object({
  component: z.number().int().min(1).max(5),
  count: z.number().int().min(1).max(50).optional().default(10),
  difficulty: z.string().optional(),
});

// --- TTS API Schemas ---

export const ttsSpeakSchema = z.object({
  voiceId: z.string().min(1),
  text: z.string().min(1).optional(),
  words: z.array(z.string().min(1)).min(1).optional(),
  pauseMs: z.number().int().min(0).max(5000).optional(),
}).refine((data) => data.text || data.words, {
  message: "Either text or words must be provided",
});

export const ttsCompanionSchema = z.object({
  voiceId: z.string().min(1),
  text: z.string().min(1),
});

// --- Helpers ---

/** Validate UUID format (for query params and array values) */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isValidUUID(value: string): boolean {
  return UUID_REGEX.test(value);
}
