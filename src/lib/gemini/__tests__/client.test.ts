import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock env before importing the module
vi.mock("@/lib/env", () => ({
  GEMINI_API_KEY: "test-api-key",
}));

// Mock the Google Generative AI module
const mockGenerateContent = vi.fn();

vi.mock("@google/generative-ai", () => {
  return {
    GoogleGenerativeAI: class {
      getGenerativeModel() {
        return { generateContent: mockGenerateContent };
      }
    },
  };
});

import { generateFeedback } from "../client";

describe("generateFeedback", () => {
  const baseParams = {
    characterPrompt: "You are a cheerful anime character.",
    component: 1,
    questionText: "你好",
    userAnswer: "你好",
    isCorrect: true,
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns generated feedback on success", async () => {
    mockGenerateContent.mockResolvedValueOnce({
      response: { text: () => "Great pronunciation!" },
    });

    const result = await generateFeedback(baseParams);
    expect(result).toBe("Great pronunciation!");
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
  });

  it("retries on failure and eventually succeeds", async () => {
    mockGenerateContent
      .mockRejectedValueOnce(new Error("API error"))
      .mockResolvedValueOnce({
        response: { text: () => "Recovered feedback" },
      });

    const promise = generateFeedback(baseParams);
    // Advance past the first retry delay
    await vi.advanceTimersByTimeAsync(5000);
    const result = await promise;
    expect(result).toBe("Recovered feedback");
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
  });

  it("returns fallback message after all retries fail (correct)", async () => {
    mockGenerateContent.mockRejectedValue(new Error("API error"));

    const promise = generateFeedback({ ...baseParams, isCorrect: true });
    // Advance past all retry delays
    await vi.advanceTimersByTimeAsync(20000);
    const result = await promise;
    expect(result).toContain("做得好");
    expect(mockGenerateContent).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
  });

  it("returns fallback message after all retries fail (incorrect)", async () => {
    mockGenerateContent.mockRejectedValue(new Error("API error"));

    const promise = generateFeedback({ ...baseParams, isCorrect: false });
    await vi.advanceTimersByTimeAsync(20000);
    const result = await promise;
    expect(result).toContain("再试一次");
    expect(mockGenerateContent).toHaveBeenCalledTimes(4);
  });

  it("includes pronunciation score in prompt when provided", async () => {
    mockGenerateContent.mockResolvedValueOnce({
      response: { text: () => "Score feedback" },
    });

    await generateFeedback({ ...baseParams, pronunciationScore: 85 });

    const callArgs = mockGenerateContent.mock.calls[0][0];
    const userText = callArgs.contents[0].parts[0].text;
    expect(userText).toContain("85");
    expect(userText).toContain("pronunciation");
  });
});
