import { describe, it, expect, vi } from "vitest";

// Mock env before importing the module
vi.mock("@/lib/env", () => ({
  OPENROUTER_API_KEY: "test-api-key",
}));

import {
  buildCurriculumPrompt,
  buildCheckpointFeedbackPrompt,
  type CurriculumInput,
  type CheckpointFeedbackInput,
} from "../client";

describe("buildCurriculumPrompt", () => {
  const baseInput: CurriculumInput = {
    scores: { tone_accuracy: 65, reading_fluency: 80, vocabulary: 45 },
    daysRemaining: 14,
    availableQuestionIds: {
      1: ["q1a", "q1b", "q1c"],
      2: ["q2a", "q2b"],
      3: ["q3a", "q3b", "q3c", "q3d"],
    },
    recentQuestionTexts: ["你好", "再见"],
  };

  it("includes all component scores in the prompt", () => {
    const prompt = buildCurriculumPrompt(baseInput);
    expect(prompt).toContain("tone_accuracy: 65/100");
    expect(prompt).toContain("reading_fluency: 80/100");
    expect(prompt).toContain("vocabulary: 45/100");
  });

  it("includes days remaining in the prompt", () => {
    const prompt = buildCurriculumPrompt(baseInput);
    expect(prompt).toContain("Days remaining until test: 14");
  });

  it("includes recommended node count (~1.5 * daysRemaining)", () => {
    const prompt = buildCurriculumPrompt(baseInput);
    // 14 * 1.5 = 21
    expect(prompt).toContain("Recommended total nodes: 21");
  });

  it("clamps recommended nodes to minimum of 8", () => {
    const prompt = buildCurriculumPrompt({ ...baseInput, daysRemaining: 2 });
    // 2 * 1.5 = 3, clamped to 8
    expect(prompt).toContain("Recommended total nodes: 8");
  });

  it("clamps recommended nodes to maximum of 60", () => {
    const prompt = buildCurriculumPrompt({ ...baseInput, daysRemaining: 100 });
    // 100 * 1.5 = 150, clamped to 60
    expect(prompt).toContain("Recommended total nodes: 60");
  });

  it("includes available question counts per component", () => {
    const prompt = buildCurriculumPrompt(baseInput);
    expect(prompt).toContain("Component 1");
    expect(prompt).toContain("3 questions available");
    expect(prompt).toContain("Component 2");
    expect(prompt).toContain("2 questions available");
    expect(prompt).toContain("Component 3");
    expect(prompt).toContain("4 questions available");
  });

  it("includes recent question texts to avoid", () => {
    const prompt = buildCurriculumPrompt(baseInput);
    expect(prompt).toContain("你好");
    expect(prompt).toContain("再见");
    expect(prompt).toContain("avoid repeating");
  });

  it("omits recent section when no recent questions", () => {
    const prompt = buildCurriculumPrompt({
      ...baseInput,
      recentQuestionTexts: [],
    });
    expect(prompt).not.toContain("avoid repeating");
  });

  it("includes previous checkpoint history when provided", () => {
    const prompt = buildCurriculumPrompt({
      ...baseInput,
      previousCheckpoints: [
        {
          scores: { tone_accuracy: 70, vocabulary: 50 },
          completedNodes: [
            { component: 1, focusArea: "tone_pairs" },
            { component: 3, focusArea: "fluency" },
          ],
        },
      ],
    });
    expect(prompt).toContain("Previous checkpoint history");
    expect(prompt).toContain("Phase 1");
    expect(prompt).toContain("tone_accuracy: 70");
    expect(prompt).toContain("C1/tone_pairs");
  });
});

describe("buildCheckpointFeedbackPrompt", () => {
  const baseInput: CheckpointFeedbackInput = {
    originalScores: { tone_accuracy: 65, reading_fluency: 80, vocabulary: 45 },
    currentScores: { tone_accuracy: 75, reading_fluency: 82, vocabulary: 50 },
    completedNodes: [
      { component: 1, focusArea: "tone_pairs" },
      { component: 3, focusArea: "passage_fluency" },
    ],
    phaseNumber: 1,
  };

  it("includes score deltas with correct signs", () => {
    const prompt = buildCheckpointFeedbackPrompt(baseInput);
    // tone_accuracy: 65 → 75 (+10)
    expect(prompt).toContain("65 → 75 (+10)");
    // reading_fluency: 80 → 82 (+2)
    expect(prompt).toContain("80 → 82 (+2)");
    // vocabulary: 45 → 50 (+5)
    expect(prompt).toContain("45 → 50 (+5)");
  });

  it("handles negative deltas", () => {
    const prompt = buildCheckpointFeedbackPrompt({
      ...baseInput,
      currentScores: { ...baseInput.currentScores, reading_fluency: 75 },
    });
    // reading_fluency: 80 → 75 (-5)
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
      currentScores: { ...baseInput.currentScores, reading_fluency: 80 },
    });
    expect(prompt).toContain("80 → 80 (+0)");
  });

  it("handles missing original score gracefully", () => {
    const prompt = buildCheckpointFeedbackPrompt({
      ...baseInput,
      currentScores: { ...baseInput.currentScores, new_metric: 60 },
      originalScores: { ...baseInput.originalScores },
    });
    // new_metric: 0 → 60 (+60) since original defaults to 0
    expect(prompt).toContain("0 → 60 (+60)");
  });
});
