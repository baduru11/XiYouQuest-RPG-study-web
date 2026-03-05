import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock env before importing the module
vi.mock("@/lib/env", () => ({
  OPENROUTER_API_KEY: () => "test-api-key",
}));

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { generateFeedback, chatConversation, parseChatResponse } from "../client";

function mockFetchResponse(text: string) {
  return {
    ok: true,
    json: async () => ({
      choices: [{ message: { content: text } }],
    }),
  };
}

function mockFetchError(status: number, body: string) {
  return {
    ok: false,
    status,
    text: async () => body,
  };
}

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
    mockFetch.mockResolvedValueOnce(mockFetchResponse("Great pronunciation!"));

    const result = await generateFeedback(baseParams);
    expect(result).toBe("Great pronunciation!");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("retries on failure and eventually succeeds", async () => {
    mockFetch
      .mockResolvedValueOnce(mockFetchError(500, "Server error"))
      .mockResolvedValueOnce(mockFetchResponse("Recovered feedback"));

    const promise = generateFeedback(baseParams);
    // Advance past the first retry delay
    await vi.advanceTimersByTimeAsync(5000);
    const result = await promise;
    expect(result).toBe("Recovered feedback");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("returns fallback message after all retries fail (correct)", async () => {
    mockFetch.mockResolvedValue(mockFetchError(500, "Server error"));

    const promise = generateFeedback({ ...baseParams, isCorrect: true });
    // Advance past all retry delays
    await vi.advanceTimersByTimeAsync(20000);
    const result = await promise;
    expect(result).toContain("做得好");
    expect(mockFetch).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
  });

  it("returns fallback message after all retries fail (incorrect)", async () => {
    mockFetch.mockResolvedValue(mockFetchError(500, "Server error"));

    const promise = generateFeedback({ ...baseParams, isCorrect: false });
    await vi.advanceTimersByTimeAsync(20000);
    const result = await promise;
    expect(result).toContain("再试一次");
    expect(mockFetch).toHaveBeenCalledTimes(4);
  });

  it("includes pronunciation score in prompt when provided", async () => {
    mockFetch.mockResolvedValueOnce(mockFetchResponse("Score feedback"));

    await generateFeedback({ ...baseParams, pronunciationScore: 85 });

    const callArgs = JSON.parse(mockFetch.mock.calls[0][1].body);
    const userText = callArgs.messages[1].content;
    expect(userText).toContain("85");
    expect(userText).toContain("pronunciation");
  });
});

describe("parseChatResponse", () => {
  it("parses valid JSON reply", () => {
    const result = parseChatResponse('{"type": "reply", "content": "你好！欢迎来到花果山。"}');
    expect(result).toEqual({ type: "reply", content: "你好！欢迎来到花果山。" });
  });

  it("parses valid JSON redirect", () => {
    const result = parseChatResponse('{"type": "redirect", "content": "施主，贫僧不知你在说什么。"}');
    expect(result).toEqual({ type: "redirect", content: "施主，贫僧不知你在说什么。" });
  });

  it("falls back to reply for plain text (no JSON)", () => {
    const result = parseChatResponse("你好！我是孙悟空。");
    expect(result).toEqual({ type: "reply", content: "你好！我是孙悟空。" });
  });

  it("falls back to reply for malformed JSON", () => {
    const raw = '{"type": "reply", "content": broken}';
    const result = parseChatResponse(raw);
    expect(result).toEqual({ type: "reply", content: raw });
  });

  it("falls back to reply when JSON has wrong fields", () => {
    const raw = '{"kind": "reply", "text": "hello"}';
    const result = parseChatResponse(raw);
    expect(result).toEqual({ type: "reply", content: raw });
  });
});

describe("chatConversation", () => {
  const baseMessages = [
    { role: "system" as const, content: "You are a character." },
    { role: "user" as const, content: "你好" },
  ];

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns parsed reply envelope on success", async () => {
    mockFetch.mockResolvedValueOnce(
      mockFetchResponse('{"type": "reply", "content": "你好！"}')
    );

    const result = await chatConversation(baseMessages);
    expect(result).toEqual({ type: "reply", content: "你好！" });
  });

  it("returns parsed redirect envelope on success", async () => {
    mockFetch.mockResolvedValueOnce(
      mockFetchResponse('{"type": "redirect", "content": "施主，何出此言？"}')
    );

    const result = await chatConversation(baseMessages);
    expect(result).toEqual({ type: "redirect", content: "施主，何出此言？" });
  });

  it("treats plain text response as reply", async () => {
    mockFetch.mockResolvedValueOnce(mockFetchResponse("你好呀！"));

    const result = await chatConversation(baseMessages);
    expect(result).toEqual({ type: "reply", content: "你好呀！" });
  });

  it("returns fallback envelope after all retries fail", async () => {
    mockFetch.mockResolvedValue(mockFetchError(500, "Server error"));

    const promise = chatConversation(baseMessages);
    await vi.advanceTimersByTimeAsync(20000);
    const result = await promise;

    expect(result.type).toBe("reply");
    expect(result.content).toContain("抱歉");
  });
});
