import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { getSessionUser, quickCompletion } = vi.hoisted(() => ({
  getSessionUser: vi.fn(),
  quickCompletion: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ getSessionUser }));
vi.mock("@/lib/gemini/client", () => ({ quickCompletion }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: vi.fn().mockResolvedValue(null) }));

import { POST } from "./route";

const currentComponentResults = [
  { componentNumber: 1, score: 100, scoreVersion: "psc-2021-v2" },
  { componentNumber: 2, score: 80, scoreVersion: "psc-2021-v2" },
  { componentNumber: 3, score: 60, scoreVersion: "psc-2021-v2" },
  { componentNumber: 4, score: 40, scoreVersion: "psc-2021-v2" },
  { componentNumber: 5, score: 20, scoreVersion: "psc-2021-v2" },
];

function request(body: object) {
  return new NextRequest("https://preview.example.test/api/ai/mock-exam-feedback", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("mock exam feedback contract", () => {
  it("rejects an incomplete formal PSC payload", async () => {
    getSessionUser.mockResolvedValue({ id: "verified-user" });

    const response = await POST(request({
      componentResults: currentComponentResults.filter((result) => result.componentNumber !== 4),
      totalScore: 50,
      practiceBand: "Mastery",
      scoreVersion: "psc-2021-v2",
    }));

    expect(response.status).toBe(400);
    expect(quickCompletion).not.toHaveBeenCalled();
  });

  it("rejects mixed component score versions before generating feedback", async () => {
    getSessionUser.mockResolvedValue({ id: "verified-user" });

    const response = await POST(request({
      componentResults: currentComponentResults.map((result) => (
        result.componentNumber === 3
          ? { ...result, scoreVersion: "legacy-five-component-v1" }
          : result
      )),
      totalScore: 50,
      practiceBand: "Foundation",
      scoreVersion: "psc-2021-v2",
    }));

    expect(response.status).toBe(400);
    expect(quickCompletion).not.toHaveBeenCalled();
  });

  it("uses the contract-derived total and XiYouQuest practice band in feedback", async () => {
    getSessionUser.mockResolvedValue({ id: "verified-user" });
    quickCompletion.mockResolvedValue("feedback");

    const response = await POST(request({
      componentResults: currentComponentResults,
      totalScore: 50,
      practiceBand: "Mastery",
      scoreVersion: "psc-2021-v2",
    }));

    expect(response.status).toBe(200);
    expect(quickCompletion).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining("Total: 50/100, Practice band: Starting point"),
      500,
    );
  });
});
