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

// --- Profile API Schemas ---

export const profileSettingsSchema = z
  .object({
    display_name: z.string().trim().min(1).max(15).optional(),
    audio_volume: z.number().min(0).max(1).optional(),
    tts_volume: z.number().min(0).max(1).optional(),
    audio_muted: z.boolean().optional(),
  })
  .refine(
    (v) => Object.values(v).some((field) => field !== undefined),
    { message: "At least one field is required" },
  );

// --- Progress API Schemas ---

export const progressUpdateSchema = z.object({
  characterId: uuid,
  attemptId: uuid.optional(),
  component: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6), z.literal(7)]),
  score: z.number().min(0).max(100),
  // The route caps awarded XP at MAX_XP_PER_SESSION; this only rejects absurd input.
  xpEarned: z.number().min(0).max(10_000),
  durationSeconds: z.number().min(0).max(86_400).optional().default(0),
  questionsAttempted: z.number().int().min(0).max(500).optional().default(0),
  questionsCorrect: z.number().int().min(0).max(500).optional().default(0),
  bestStreak: z.number().int().min(0).max(500).optional().default(0),
}).strict().transform((progress) => ({
  ...progress,
  // Accuracy is shown on the leaderboard under the student's real name, so a
  // session can never record more correct answers than it attempted.
  questionsCorrect: Math.min(progress.questionsCorrect, progress.questionsAttempted),
}));

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
  // Bound the voice id to the iFlytek id shape (e.g. `x_xiaoyan`,
  // `x4_lingfeizhe_assist`) and a sane length instead of accepting an arbitrary
  // string. Companion voices are a broader set than ttsSpeak's fixed allowlist,
  // so we constrain the format rather than pin an exact list.
  voiceId: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-z0-9_]+$/i, { message: "Invalid voice ID" }),
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
}).strict();

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
