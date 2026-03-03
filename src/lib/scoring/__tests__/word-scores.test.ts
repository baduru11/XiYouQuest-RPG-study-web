import { describe, it, expect } from "vitest";
import { matchWordScores } from "../word-scores";

describe("matchWordScores", () => {
  it("matches exact words in order", () => {
    const items = ["你", "好", "吗"];
    const words = [
      { word: "你", accuracyScore: 90, errorType: "None" },
      { word: "好", accuracyScore: 85, errorType: "None" },
      { word: "吗", accuracyScore: 92, errorType: "None" },
    ];

    const result = matchWordScores(items, words);
    expect(result).toEqual([
      { word: "你", score: 90 },
      { word: "好", score: 85 },
      { word: "吗", score: 92 },
    ]);
  });

  it("filters out Insertion and Omission errorTypes", () => {
    const items = ["你", "好"];
    const words = [
      { word: "嗯", accuracyScore: 0, errorType: "Insertion" },
      { word: "你", accuracyScore: 88, errorType: "None" },
      { word: "啊", accuracyScore: 0, errorType: "Omission" },
      { word: "好", accuracyScore: 91, errorType: "None" },
    ];

    const result = matchWordScores(items, words);
    expect(result).toEqual([
      { word: "你", score: 88 },
      { word: "好", score: 91 },
    ]);
  });

  it("aggregates character-level scores for multi-char words", () => {
    const items = ["中国"];
    const words = [
      { word: "中", accuracyScore: 80, errorType: "None" },
      { word: "国", accuracyScore: 90, errorType: "None" },
    ];

    const result = matchWordScores(items, words);
    expect(result).toEqual([
      { word: "中国", score: 85 }, // Math.round((80+90)/2)
    ]);
  });

  it("returns null score for unmatched items", () => {
    const items = ["你", "好", "世界"];
    const words = [
      { word: "你", accuracyScore: 90, errorType: "None" },
      { word: "好", accuracyScore: 85, errorType: "None" },
    ];

    const result = matchWordScores(items, words);
    expect(result).toEqual([
      { word: "你", score: 90 },
      { word: "好", score: 85 },
      { word: "世界", score: null },
    ]);
  });

  it("handles empty words array", () => {
    const items = ["你", "好"];
    const words: Array<{ word: string; accuracyScore: number; errorType: string }> = [];

    const result = matchWordScores(items, words);
    expect(result).toEqual([
      { word: "你", score: null },
      { word: "好", score: null },
    ]);
  });

  it("handles empty items array", () => {
    const items: string[] = [];
    const words = [
      { word: "你", accuracyScore: 90, errorType: "None" },
    ];

    const result = matchWordScores(items, words);
    expect(result).toEqual([]);
  });

  it("matches duplicate items to different word entries", () => {
    const items = ["的", "的"];
    const words = [
      { word: "的", accuracyScore: 95, errorType: "None" },
      { word: "的", accuracyScore: 80, errorType: "None" },
    ];

    const result = matchWordScores(items, words);
    expect(result).toEqual([
      { word: "的", score: 95 },
      { word: "的", score: 80 },
    ]);
  });

  it("uses fallback search when word appears out of order", () => {
    const items = ["好", "你"];
    const words = [
      { word: "你", accuracyScore: 88, errorType: "None" },
      { word: "好", accuracyScore: 92, errorType: "None" },
    ];

    const result = matchWordScores(items, words);
    // "好" forward search fails (你 comes first), fallback finds it at index 1
    // "你" is at index 0, still unused
    expect(result[0]).toEqual({ word: "好", score: 92 });
    expect(result[1]).toEqual({ word: "你", score: 88 });
  });

  it("mixes exact and char-level matching", () => {
    const items = ["你", "中国", "好"];
    const words = [
      { word: "你", accuracyScore: 90, errorType: "None" },
      { word: "中", accuracyScore: 80, errorType: "None" },
      { word: "国", accuracyScore: 70, errorType: "None" },
      { word: "好", accuracyScore: 85, errorType: "None" },
    ];

    const result = matchWordScores(items, words);
    expect(result).toEqual([
      { word: "你", score: 90 },
      { word: "中国", score: 75 }, // Math.round((80+70)/2)
      { word: "好", score: 85 },
    ]);
  });

  it("handles partial char-level matching", () => {
    // Only one character of a two-char word is found
    const items = ["中国"];
    const words = [
      { word: "中", accuracyScore: 80, errorType: "None" },
      // "国" is missing
    ];

    const result = matchWordScores(items, words);
    // Only one char matched, so score = 80 (average of [80])
    expect(result).toEqual([
      { word: "中国", score: 80 },
    ]);
  });
});
