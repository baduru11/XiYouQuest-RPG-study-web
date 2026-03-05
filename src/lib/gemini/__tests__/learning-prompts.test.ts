import { describe, it, expect, vi } from "vitest";

// Mock env before importing the module
vi.mock("@/lib/env", () => ({
  OPENROUTER_API_KEY: () => "test-api-key",
}));

import {
  buildPhasePrompt,
  buildCheckpointFeedbackPrompt,
  calculateTotalCheckpoints,
  type PhaseGenerationInput,
} from "../client";

describe("calculateTotalCheckpoints", () => {
  it("returns 2 for short periods (≤21 days)", () => {
    expect(calculateTotalCheckpoints(7)).toBe(2);
    expect(calculateTotalCheckpoints(14)).toBe(2);
    expect(calculateTotalCheckpoints(21)).toBe(2);
  });

  it("returns 3 for longer periods (>21 days)", () => {
    expect(calculateTotalCheckpoints(22)).toBe(3);
    expect(calculateTotalCheckpoints(60)).toBe(3);
    expect(calculateTotalCheckpoints(100)).toBe(3);
  });
});

describe("buildPhasePrompt", () => {
  const baseInput: PhaseGenerationInput = {
    scores: { c1: 65, c2: 80, c3: 45 },
    daysRemaining: 14,
    phaseNumber: 1,
    totalCheckpoints: 2,
    availableQuestionCounts: {
      1: 100,
      2: 50,
      3: 30,
    },
  };

  it("includes all component scores in the prompt", () => {
    const prompt = buildPhasePrompt(baseInput);
    expect(prompt).toContain("c1: 65/100");
    expect(prompt).toContain("c2: 80/100");
    expect(prompt).toContain("c3: 45/100");
  });

  it("includes days remaining", () => {
    const prompt = buildPhasePrompt(baseInput);
    expect(prompt).toContain("Days remaining until test: 14");
  });

  it("identifies initial phase context", () => {
    const prompt = buildPhasePrompt(baseInput);
    expect(prompt).toContain("INITIAL phase");
    expect(prompt).toContain("identify weaknesses");
  });

  it("identifies subsequent phase context", () => {
    const prompt = buildPhasePrompt({ ...baseInput, phaseNumber: 2 });
    expect(prompt).toContain("Phase 2 of 3");
    expect(prompt).toContain("mid-assessment");
  });

  it("includes checkpoint count info", () => {
    const prompt = buildPhasePrompt(baseInput);
    expect(prompt).toContain("2 mid-assessments planned");
  });

  it("includes available question counts", () => {
    const prompt = buildPhasePrompt(baseInput);
    expect(prompt).toContain("100 questions available");
    expect(prompt).toContain("50 questions available");
    expect(prompt).toContain("30 questions available");
  });

  it("asks for analysis and nodes", () => {
    const prompt = buildPhasePrompt(baseInput);
    expect(prompt).toContain('"analysis"');
    expect(prompt).toContain('"nodes"');
  });

  it("includes previous phase history when provided", () => {
    const prompt = buildPhasePrompt({
      ...baseInput,
      phaseNumber: 2,
      previousPhases: [
        {
          phaseNumber: 1,
          scores: { c1: 70, c3: 50 },
          completedNodes: [
            { component: 1, focusArea: "tone_pairs" },
            { component: 3, focusArea: "fluency" },
          ],
        },
      ],
    });
    expect(prompt).toContain("Previous phase history");
    expect(prompt).toContain("Phase 1");
    expect(prompt).toContain("c1: 70");
    expect(prompt).toContain("C1/tone_pairs");
  });

  it("omits history when no previous phases", () => {
    const prompt = buildPhasePrompt(baseInput);
    expect(prompt).not.toContain("Previous phase history");
  });
});

describe("buildCheckpointFeedbackPrompt", () => {
  const baseInput = {
    originalScores: { c1: 65, c2: 80, c3: 45 },
    currentScores: { c1: 75, c2: 82, c3: 50 },
    completedNodes: [
      { component: 1, focusArea: "tone_pairs" },
      { component: 3, focusArea: "passage_fluency" },
    ],
    phaseNumber: 1,
  };

  it("includes score deltas with correct signs", () => {
    const prompt = buildCheckpointFeedbackPrompt(baseInput);
    expect(prompt).toContain("65 → 75 (+10)");
    expect(prompt).toContain("80 → 82 (+2)");
    expect(prompt).toContain("45 → 50 (+5)");
  });

  it("handles negative deltas", () => {
    const prompt = buildCheckpointFeedbackPrompt({
      ...baseInput,
      currentScores: { ...baseInput.currentScores, c2: 75 },
    });
    expect(prompt).toContain("80 → 75 (-5)");
  });

  it("includes phase number", () => {
    const prompt = buildCheckpointFeedbackPrompt(baseInput);
    expect(prompt).toContain("Phase 1");
  });

  it("includes completed node details", () => {
    const prompt = buildCheckpointFeedbackPrompt(baseInput);
    expect(prompt).toContain("Component 1");
    expect(prompt).toContain("tone_pairs");
    expect(prompt).toContain("Component 3");
    expect(prompt).toContain("passage_fluency");
  });

  it("handles zero delta", () => {
    const prompt = buildCheckpointFeedbackPrompt({
      ...baseInput,
      currentScores: { ...baseInput.currentScores, c2: 80 },
    });
    expect(prompt).toContain("80 → 80 (+0)");
  });

  it("handles missing original score gracefully", () => {
    const prompt = buildCheckpointFeedbackPrompt({
      ...baseInput,
      currentScores: { ...baseInput.currentScores, new_metric: 60 },
      originalScores: { ...baseInput.originalScores },
    });
    expect(prompt).toContain("0 → 60 (+60)");
  });
});
