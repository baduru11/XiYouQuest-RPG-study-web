import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { createClient, getSessionUser } = vi.hoisted(() => ({
  createClient: vi.fn(),
  getSessionUser: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient, getSessionUser }));
// Rate limiting is covered by src/lib/rate-limit.test.ts; here it always allows.
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: vi.fn(async () => null) }));

vi.mock("@/lib/achievements/check", () => ({
  checkAndUnlockAchievements: vi.fn(),
}));

import { POST } from "./route";

const requestBody = {
  characterId: "7f00df0d-3790-4c5a-995e-68f63f3d7de8",
  attemptId: "6f00df0d-3790-4c5a-995e-68f63f3d7de8",
  component: 4,
  score: 80,
  xpEarned: 10,
  durationSeconds: 0,
  questionsAttempted: 1,
  questionsCorrect: 1,
  bestStreak: 1,
};

describe("progress update attempt idempotency", () => {
  it("delegates a keyed attempt to the atomic RPC and returns its idempotent result", async () => {
    const supabase = {
      from: vi.fn(),
      rpc: vi.fn().mockResolvedValue({
        data: [{ already_recorded: true }],
        error: null,
      }),
    };
    createClient.mockResolvedValue(supabase);
    getSessionUser.mockResolvedValue({ id: "verified-user", email: "learner@connect.ust.hk" });

    const response = await POST(new NextRequest("https://preview.example.test/api/progress/update", {
      method: "POST",
      body: JSON.stringify(requestBody),
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ alreadyRecorded: true, newAchievements: [] });
    expect(supabase.from).not.toHaveBeenCalled();
    expect(supabase.rpc).toHaveBeenCalledWith("record_practice_progress", {
      p_user_id: "verified-user",
      p_character_id: requestBody.characterId,
      p_client_attempt_id: requestBody.attemptId,
      p_component: requestBody.component,
      p_score: requestBody.score,
      p_xp_earned: requestBody.xpEarned,
      p_duration_seconds: requestBody.durationSeconds,
      p_questions_attempted: requestBody.questionsAttempted,
      p_questions_correct: requestBody.questionsCorrect,
      p_best_streak: requestBody.bestStreak,
      p_today: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      p_daily_bonus_base: 25,
    });
  });
});
