import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { aiInsightsSchema, progressUpdateSchema } from "@/lib/validations";

const read = (p: string) => readFileSync(p, "utf8");

describe("aiInsightsSchema (prompt minimisation)", () => {
  const realPayload = {
    progress: [
      {
        id: "0b8f0f0e-5d0e-4b8e-9f3c-7e1d2a3b4c5d",
        user_id: "3f2a1b0c-9d8e-4f7a-8b6c-5d4e3f2a1b0c",
        component: 1,
        questions_attempted: 120,
        questions_correct: 96,
        best_streak: 14,
        total_practice_time_seconds: 3600,
        last_practiced_at: "2026-09-24T08:15:30.123456+00:00",
      },
    ],
    recentSessions: [
      {
        id: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
        component: 2,
        score: 81.5,
        xp_earned: 40,
        duration_seconds: 300,
        created_at: "2026-09-24T08:15:30.123456+00:00",
        characters: { name: "Sun Wukong" },
      },
    ],
    questProgress: [
      { stage: 1, is_cleared: true, attempts: 2, best_score: 320, cleared_at: null },
    ],
  };

  it("accepts the real practice-history payload and strips ids and joined objects", () => {
    const parsed = aiInsightsSchema.parse(realPayload);
    const serialised = JSON.stringify(parsed);
    expect(serialised).not.toContain(realPayload.progress[0].user_id);
    expect(serialised).not.toContain(realPayload.progress[0].id);
    expect(serialised).not.toContain("Sun Wukong");
    expect(parsed.progress).toEqual([
      expect.objectContaining({ component: 1, questions_correct: 96 }),
    ]);
  });

  it("rejects an oversized timestamp string", () => {
    const bloated = structuredClone(realPayload);
    bloated.recentSessions[0].created_at = "x".repeat(41);
    expect(aiInsightsSchema.safeParse(bloated).success).toBe(false);
  });

  it("caps the number of keys in the record form", () => {
    const record = Object.fromEntries(Array.from({ length: 17 }, (_, i) => [`k${i}`, 50]));
    expect(aiInsightsSchema.safeParse({ progress: record }).success).toBe(false);
  });

  it("is identical in the edge runtime", () => {
    const block = (source: string) =>
      source
        .slice(source.indexOf("// BEGIN aiInsightsSchema"), source.indexOf("// END aiInsightsSchema"))
        .replace(/\s+/g, "");
    const next = block(read("src/lib/validations.ts"));
    expect(next.length).toBeGreaterThan(200);
    expect(block(read("supabase/functions/_shared/validations.ts"))).toBe(next);
  });
});

describe("progressUpdateSchema (leaderboard integrity)", () => {
  const base = {
    characterId: "3f2a1b0c-9d8e-4f7a-8b6c-5d4e3f2a1b0c",
    component: 3,
    score: 80,
    xpEarned: 30,
    questionsAttempted: 10,
    questionsCorrect: 8,
    bestStreak: 5,
  };

  it("clamps correct answers to attempted questions", () => {
    const parsed = progressUpdateSchema.parse({ ...base, questionsCorrect: 400 });
    expect(parsed.questionsCorrect).toBe(10);
  });

  it("leaves a legitimate session untouched", () => {
    expect(progressUpdateSchema.parse(base)).toMatchObject({ questionsAttempted: 10, questionsCorrect: 8 });
  });

  it.each([
    ["questionsAttempted", 501],
    ["bestStreak", 501],
    ["durationSeconds", 86_401],
    ["xpEarned", 10_001],
  ])("rejects %s = %d", (field, value) => {
    expect(progressUpdateSchema.safeParse({ ...base, [field]: value }).success).toBe(false);
  });
});

describe("prompt-bound twins", () => {
  it.each([
    "src/app/api/ai/mock-exam-feedback/route.ts",
    "supabase/functions/ai-mock-exam-feedback/index.ts",
  ])("%s bounds every free-text field that reaches the prompt", (file) => {
    const source = read(file);
    for (const field of ["word", "question", "sentence"]) {
      expect(source, `${field} bounded`).toMatch(new RegExp(`${field}: z\\.string\\(\\)\\.max\\(`));
    }
    expect(source.match(/notes: z\.string\(\)\.max\(/g)).toHaveLength(3);
  });

  it("bounds the edge tts-companion voice id like the Next twin", () => {
    expect(read("supabase/functions/tts-companion/index.ts")).toContain(
      "voiceId: z.string().min(1).max(50).regex(/^[a-z0-9_]+$/i)",
    );
  });

  it("restricts checkpoint score keys to component ids", () => {
    expect(read("src/app/api/learning/checkpoint/complete/route.ts")).toContain(
      "scores: z.record(z.string().regex(/^c[1-7]$/i)",
    );
  });
});
