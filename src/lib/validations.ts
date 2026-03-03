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
  characterId: uuid,
  component: z.number().int().min(1).max(7),
  questionText: z.string().min(1).max(500),
  userAnswer: z.string().max(1000),
  pronunciationScore: z.number().min(0).max(100).optional(),
  isCorrect: z.boolean(),
});

// --- AI Insights Schema ---

export const aiInsightsSchema = z.object({
  progress: z.record(z.string().max(20), z.number().min(0).max(100)).optional(),
  recentSessions: z.array(z.object({
    component: z.number().int().min(1).max(7),
    score: z.number().min(0).max(100),
    created_at: z.string(),
  })).max(20).optional(),
  questProgress: z.array(z.object({
    stage: z.number().int().min(1).max(7),
    is_cleared: z.boolean(),
    best_score: z.number().min(0).max(500),
  })).max(7).optional(),
});

// --- Learning API Schemas ---

export const generatePlanSchema = z.object({
  scores: z.record(
    z.string().regex(/^c[1-7]$/i),
    z.number().min(0).max(100)
  ),
  examDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(
    s => !isNaN(new Date(s).getTime()), { message: "Invalid date" }
  ),
});

export const nodeCompleteSchema = z.object({
  nodeId: uuid,
  score: z.number().min(0).max(100).optional(),
  xpEarned: z.number().int().min(0).max(200).optional(),
  durationSeconds: z.number().min(0).max(86400).optional(),
});

export const nodeStartSchema = z.object({
  nodeId: uuid,
});

// --- TTS API Schemas ---

const VALID_VOICE_IDS = new Set([
  "x_xiaoyan", "x_xiaoyuan", "x_xiaoxi", "x_xiaomei",
  "x_xiaofeng", "x_xiaoxue", "x_yifeng", "x_xiaoyang_story",
  "x_xiaolin", "x4_lingfeizhe_assist", "x4_lingfeichen_assist",
]);

export const ttsSpeakSchema = z.object({
  voiceId: z.string().min(1).max(50).refine(
    v => VALID_VOICE_IDS.has(v),
    { message: "Invalid voice ID" }
  ),
  text: z.string().min(1).max(500),
});

export const ttsCompanionSchema = z.object({
  voiceId: z.string().min(1),
  text: z.string().min(1).max(500),
});

// --- Leaderboard API Schemas ---

export const leaderboardQuerySchema = z.object({
  tab: z.enum(["xp", "accuracy", "streak"]),
  scope: z.enum(["global", "friends"]),
});

// --- Quest Progress API Schemas ---

export const questProgressSchema = z.object({
  stage: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6), z.literal(7)]),
  is_cleared: z.boolean(),
  score: z.number().min(0).max(500),
  damage_taken: z.number().int().min(0).max(9).optional(),
  remaining_hp: z.number().int().min(0).max(9).optional(),
});

// --- Chat API Schemas ---

export const chatStartSchema = z.object({
  characterId: uuid,
  scenarioId: uuid,
});

export const chatEndSchema = z.object({
  sessionId: uuid,
});

export const chatResumeSchema = z.object({
  sessionId: uuid,
});

export const chatGenerateImageSchema = z.object({
  sessionId: uuid,
  conversationSummary: z.string().min(1).max(2000),
  characterName: z.string().max(100).optional(),
  scenarioTitle: z.string().max(200).optional(),
});

export const chatHistoryQuerySchema = z.object({
  sessionId: uuid.optional(),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

// --- Helpers ---

/** Validate UUID format (for query params and array values) */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isValidUUID(value: string): boolean {
  return UUID_REGEX.test(value);
}
