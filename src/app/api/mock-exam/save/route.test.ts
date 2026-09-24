import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { createClient, getSessionUser } = vi.hoisted(() => ({
  createClient: vi.fn(),
  getSessionUser: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient, getSessionUser }));
// Rate limiting is covered by src/lib/rate-limit.test.ts; here it always allows.
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: vi.fn(async () => null) }));

import { POST } from "./route";

const currentComponentScores = [
  { componentNumber: 1, score: 100, points: 0, scoreVersion: "psc-2021-v2" },
  { componentNumber: 2, score: 80, points: 0, scoreVersion: "psc-2021-v2" },
  { componentNumber: 3, score: 60, points: 0, scoreVersion: "psc-2021-v2" },
  { componentNumber: 4, score: 40, points: 0, scoreVersion: "psc-2021-v2" },
  { componentNumber: 5, score: 20, points: 0, scoreVersion: "psc-2021-v2" },
];

function request(body: object) {
  return new NextRequest("https://preview.example.test/api/mock-exam/save", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("mock exam result persistence", () => {
  it("rejects an incomplete formal result before it reaches Supabase", async () => {
    const insert = vi.fn();
    createClient.mockResolvedValue({ from: vi.fn(() => ({ insert })) });
    getSessionUser.mockResolvedValue({ id: "verified-user" });

    const response = await POST(request({
      totalScore: 50,
      practiceBand: "Mastery",
      scoreVersion: "psc-2021-v2",
      componentScores: currentComponentScores.filter((score) => score.componentNumber !== 4),
      durationSeconds: 600,
      totalXp: 10,
    }));

    expect(response.status).toBe(400);
    expect(insert).not.toHaveBeenCalled();
  });

  it("rejects a result whose component version conflicts with the declared PSC version", async () => {
    const insert = vi.fn();
    createClient.mockResolvedValue({ from: vi.fn(() => ({ insert })) });
    getSessionUser.mockResolvedValue({ id: "verified-user" });

    const response = await POST(request({
      totalScore: 50,
      practiceBand: "Foundation",
      scoreVersion: "psc-2021-v2",
      componentScores: currentComponentScores.map((score) => (
        score.componentNumber === 3
          ? { ...score, scoreVersion: "legacy-five-component-v1" }
          : score
      )),
      durationSeconds: 600,
      totalXp: 10,
    }));

    expect(response.status).toBe(400);
    expect(insert).not.toHaveBeenCalled();
  });

  it.each(["psc-2021-v1", "legacy-five-component-v1"])(
    "rejects a new result using the historical %s score contract before it reaches Supabase",
    async (scoreVersion) => {
      const insert = vi.fn();
      createClient.mockResolvedValue({ from: vi.fn(() => ({ insert })) });
      getSessionUser.mockResolvedValue({ id: "verified-user" });

      const response = await POST(request({
        totalScore: 50,
        practiceBand: "Foundation",
        scoreVersion,
        componentScores: currentComponentScores.map((score) => ({ ...score, scoreVersion })),
        durationSeconds: 600,
        totalXp: 10,
      }));

      expect(response.status).toBe(400);
      expect(insert).not.toHaveBeenCalled();
    },
  );

  it("rejects a totalXp above what the normalized scores can award before it reaches Supabase", async () => {
    const insert = vi.fn();
    createClient.mockResolvedValue({ from: vi.fn(() => ({ insert })) });
    getSessionUser.mockResolvedValue({ id: "verified-user" });

    // Fixture scores derive an XP ceiling of 29 (10 + 5 + 10 + 2 + 2).
    const response = await POST(request({
      totalScore: 50,
      practiceBand: "Mastery",
      scoreVersion: "psc-2021-v2",
      componentScores: currentComponentScores,
      durationSeconds: 600,
      totalXp: 30,
    }));

    expect(response.status).toBe(400);
    expect(insert).not.toHaveBeenCalled();
  });

  it("persists a totalXp at the derived ceiling", async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: "saved-result" }, error: null });
    const select = vi.fn(() => ({ single }));
    const insert = vi.fn(() => ({ select }));
    createClient.mockResolvedValue({ from: vi.fn(() => ({ insert })) });
    getSessionUser.mockResolvedValue({ id: "verified-user" });

    const response = await POST(request({
      totalScore: 50,
      practiceBand: "Mastery",
      scoreVersion: "psc-2021-v2",
      componentScores: currentComponentScores,
      durationSeconds: 600,
      totalXp: 29,
    }));

    expect(response.status).toBe(200);
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ total_xp: 29 }));
  });

  it("derives persisted points, total, and practice band from the selected PSC contract", async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: "saved-result" }, error: null });
    const select = vi.fn(() => ({ single }));
    const insert = vi.fn(() => ({ select }));
    createClient.mockResolvedValue({ from: vi.fn(() => ({ insert })) });
    getSessionUser.mockResolvedValue({ id: "verified-user" });

    const response = await POST(request({
      totalScore: 50,
      practiceBand: "Mastery",
      scoreVersion: "psc-2021-v2",
      componentScores: currentComponentScores,
      durationSeconds: 600,
      totalXp: 10,
    }));

    expect(response.status).toBe(200);
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      total_score: 50,
      grade: "Starting point",
      component_scores: [
        { componentNumber: 1, score: 100, points: 10, scoreVersion: "psc-2021-v2" },
        { componentNumber: 2, score: 80, points: 16, scoreVersion: "psc-2021-v2" },
        { componentNumber: 3, score: 60, points: 6, scoreVersion: "psc-2021-v2" },
        { componentNumber: 4, score: 40, points: 12, scoreVersion: "psc-2021-v2" },
        { componentNumber: 5, score: 20, points: 6, scoreVersion: "psc-2021-v2" },
      ],
    }));
  });
});
