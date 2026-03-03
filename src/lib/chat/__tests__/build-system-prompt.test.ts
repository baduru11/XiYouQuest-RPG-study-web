import { describe, it, expect } from "vitest";
import { buildChatSystemPrompt } from "../build-system-prompt";

const BASE_PARAMS = {
  characterName: "孙悟空",
  personalityPrompt: "You are the Monkey King, bold and mischievous.",
  scenarioPrompt: "A test scenario.",
};

describe("buildChatSystemPrompt", () => {
  describe("jttw category", () => {
    it("includes Tang Dynasty and Journey to the West references", () => {
      const prompt = buildChatSystemPrompt({ ...BASE_PARAMS, category: "jttw" });
      expect(prompt).toContain("Tang Dynasty");
      expect(prompt).toContain("Journey to the West");
    });

    it("restricts modern knowledge", () => {
      const prompt = buildChatSystemPrompt({ ...BASE_PARAMS, category: "jttw" });
      expect(prompt).toContain("no knowledge of anything after the Tang Dynasty");
    });

    it("uses jttw category by default when not specified", () => {
      const prompt = buildChatSystemPrompt(BASE_PARAMS);
      expect(prompt).toContain("Tang Dynasty");
      expect(prompt).toContain("no knowledge of anything after the Tang Dynasty");
    });
  });

  describe("modern_daily category", () => {
    it("includes modern China context", () => {
      const prompt = buildChatSystemPrompt({ ...BASE_PARAMS, category: "modern_daily" });
      expect(prompt).toContain("modern");
      expect(prompt).toContain("transported to modern");
    });

    it("does not restrict Tang Dynasty knowledge", () => {
      const prompt = buildChatSystemPrompt({ ...BASE_PARAMS, category: "modern_daily" });
      expect(prompt).not.toContain("no knowledge of anything after the Tang Dynasty");
    });

    it("allows engagement with modern topics", () => {
      const prompt = buildChatSystemPrompt({ ...BASE_PARAMS, category: "modern_daily" });
      expect(prompt).toContain("modern topics");
    });
  });

  describe("psc_exam category", () => {
    it("includes PSC coaching focus", () => {
      const prompt = buildChatSystemPrompt({ ...BASE_PARAMS, category: "psc_exam" });
      expect(prompt).toContain("pronunciation");
      expect(prompt).toContain("standard Mandarin");
    });

    it("uses modern identity rules", () => {
      const prompt = buildChatSystemPrompt({ ...BASE_PARAMS, category: "psc_exam" });
      expect(prompt).toContain("transported to modern");
      expect(prompt).not.toContain("no knowledge of anything after the Tang Dynasty");
    });
  });

  describe("turnCount soft hint", () => {
    it("includes wrap-up hint when turnCount >= 18", () => {
      const prompt = buildChatSystemPrompt({ ...BASE_PARAMS, turnCount: 18 });
      expect(prompt).toContain("WRAP-UP HINT");
      expect(prompt).toContain("wrapping up");
    });

    it("includes wrap-up hint at turnCount 20", () => {
      const prompt = buildChatSystemPrompt({ ...BASE_PARAMS, turnCount: 20 });
      expect(prompt).toContain("WRAP-UP HINT");
    });

    it("does not include wrap-up hint when turnCount < 18", () => {
      const prompt = buildChatSystemPrompt({ ...BASE_PARAMS, turnCount: 17 });
      expect(prompt).not.toContain("WRAP-UP HINT");
    });

    it("does not include wrap-up hint when turnCount is undefined", () => {
      const prompt = buildChatSystemPrompt(BASE_PARAMS);
      expect(prompt).not.toContain("WRAP-UP HINT");
    });
  });

  describe("JSON format instruction", () => {
    it("includes JSON format in all categories", () => {
      for (const category of ["jttw", "modern_daily", "psc_exam"] as const) {
        const prompt = buildChatSystemPrompt({ ...BASE_PARAMS, category });
        expect(prompt).toContain("RESPONSE FORMAT");
        expect(prompt).toContain('"type": "reply"');
        expect(prompt).toContain('"type": "redirect"');
      }
    });
  });

  describe("score note", () => {
    it("includes score when provided", () => {
      const prompt = buildChatSystemPrompt({ ...BASE_PARAMS, overallScore: 85 });
      expect(prompt).toContain("85/100");
    });

    it("includes encouragement for low scores", () => {
      const prompt = buildChatSystemPrompt({ ...BASE_PARAMS, overallScore: 50 });
      expect(prompt).toContain("keep practicing");
    });

    it("does not include encouragement for high scores", () => {
      const prompt = buildChatSystemPrompt({ ...BASE_PARAMS, overallScore: 85 });
      expect(prompt).not.toContain("keep practicing");
    });
  });
});
