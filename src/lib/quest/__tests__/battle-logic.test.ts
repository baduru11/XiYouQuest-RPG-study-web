// src/lib/quest/__tests__/battle-logic.test.ts

import { describe, it, expect } from "vitest";
import {
  createBattleState,
  processMCQAnswer,
  processRecordingComplete,
  advanceBattle,
  calculateBossDamage,
  calculateScaledDamage,
  calculateQuestXP,
  getUnlockedCharacters,
  setupMCQBatch,
  calculatePlayerMaxHP,
  splitRecordingGroups,
} from "../battle-logic";
import type { RecordingGroup } from "../types";

/** Wukong + 1 companion = HP 7 */
const WITH_ONE_COMPANION = ["Son Wukong", "Sam Jang"];
/** Wukong only = HP 5 */
const WUKONG_ONLY = ["Son Wukong"];

describe("calculatePlayerMaxHP", () => {
  it("returns 5 for Wukong only", () => {
    expect(calculatePlayerMaxHP(WUKONG_ONLY)).toBe(5);
  });

  it("returns 7 for Wukong + 1 companion", () => {
    expect(calculatePlayerMaxHP(WITH_ONE_COMPANION)).toBe(7);
  });

  it("returns 11 for all 4 characters", () => {
    expect(
      calculatePlayerMaxHP(["Son Wukong", "Sam Jang", "Sha Wujing", "Zhu Baijie"])
    ).toBe(11);
  });
});

describe("createBattleState", () => {
  it("initializes with correct HP and recordings for stage 1", () => {
    const state = createBattleState(1, false, WITH_ONE_COMPANION);

    expect(state.playerHP).toBe(7); // 5 base + 1 companion * 2
    expect(state.playerMaxHP).toBe(7);
    expect(state.bossHP).toBe(100);
    expect(state.currentRecordingIndex).toBe(0);
    expect(state.currentMCQInBatch).toBe(0);
    expect(state.mcqBatchIndices).toEqual([]);
    expect(state.mcqCursor).toBe(0);
    expect(state.recordingsCompleted).toBe(0);
    // Stage 1: 20 mono / 5 = 4 sub-groups
    expect(state.totalRecordings).toBe(4);
    expect(state.phase).toBe("player_menu");
    expect(state.isRetry).toBe(false);
    expect(state.results.mcqCorrect).toBe(0);
    expect(state.results.mcqTotal).toBe(0);
    expect(state.results.avgPronunciationScore).toBe(0);
    expect(state.results.pronunciationScores).toEqual([]);
  });

  it("marks retry flag", () => {
    const state = createBattleState(1, true, WITH_ONE_COMPANION);
    expect(state.isRetry).toBe(true);
  });

  it("initializes with correct HP for Wukong only", () => {
    const state = createBattleState(5, false, WUKONG_ONLY);
    expect(state.playerHP).toBe(5); // 5 base + 0 companions
  });

  it("stores recording groups and MCQ questions from stage data", () => {
    const state = createBattleState(2, false, WUKONG_ONLY);
    // Stage 2: 15 mono/5 + 15 multi/5 = 6 sub-groups
    expect(state.recordingGroups).toHaveLength(6);
    expect(state.totalRecordings).toBe(6);
    expect(state.mcqQuestions.length).toBeGreaterThan(0);
  });

  it("includes stage config in state", () => {
    const state = createBattleState(3, false, WUKONG_ONLY);
    expect(state.stage.stage).toBe(3);
    expect(state.stage.name).toBe("Desert of Illusion");
    expect(state.stage.bossName).toBe("Lady of Bleached Bones");
  });
});

describe("setupMCQBatch", () => {
  it("draws 3 MCQ indices from pool", () => {
    const { batchIndices, newCursor } = setupMCQBatch(0, 10);
    expect(batchIndices).toEqual([0, 1, 2]);
    expect(newCursor).toBe(3);
  });

  it("cycles when cursor exceeds pool size", () => {
    const { batchIndices, newCursor } = setupMCQBatch(9, 10);
    expect(batchIndices).toEqual([9, 0, 1]);
    expect(newCursor).toBe(12);
  });

  it("handles pool smaller than batch size", () => {
    const { batchIndices, newCursor } = setupMCQBatch(0, 2);
    expect(batchIndices).toEqual([0, 1]);
    expect(newCursor).toBe(2);
  });

  it("advances cursor correctly across multiple calls", () => {
    const { newCursor: cursor1 } = setupMCQBatch(0, 10);
    const { batchIndices, newCursor: cursor2 } = setupMCQBatch(cursor1, 10);
    expect(batchIndices).toEqual([3, 4, 5]);
    expect(cursor2).toBe(6);
  });
});

describe("processMCQAnswer", () => {
  it("does not reduce HP on correct answer", () => {
    const state = createBattleState(1, false, WITH_ONE_COMPANION);
    const newState = processMCQAnswer(state, true);

    expect(newState.playerHP).toBe(state.playerHP);
    expect(newState.results.mcqCorrect).toBe(1);
    expect(newState.results.mcqTotal).toBe(1);
  });

  it("reduces HP by 1 on wrong answer", () => {
    const state = createBattleState(1, false, WITH_ONE_COMPANION);
    const newState = processMCQAnswer(state, false);

    expect(newState.playerHP).toBe(state.playerHP - 1);
    expect(newState.results.mcqCorrect).toBe(0);
    expect(newState.results.mcqTotal).toBe(1);
  });

  it("does not reduce HP below 0", () => {
    let state = createBattleState(1, false, WITH_ONE_COMPANION);
    for (let i = 0; i < 10; i++) {
      state = processMCQAnswer(state, false);
    }
    expect(state.playerHP).toBe(0);
  });

  it("tracks multiple answers correctly", () => {
    let state = createBattleState(1, false, WITH_ONE_COMPANION);
    state = processMCQAnswer(state, true);
    state = processMCQAnswer(state, false);
    state = processMCQAnswer(state, true);

    expect(state.results.mcqCorrect).toBe(2);
    expect(state.results.mcqTotal).toBe(3);
    expect(state.playerHP).toBe(6); // 7 - 1 = 6
  });
});

describe("calculateBossDamage", () => {
  it("divides boss HP evenly across recordings", () => {
    expect(calculateBossDamage(100, 4)).toBe(25);
  });

  it("uses ceiling for uneven division", () => {
    expect(calculateBossDamage(100, 3)).toBe(34);
  });

  it("returns full HP for single recording", () => {
    expect(calculateBossDamage(100, 1)).toBe(100);
  });
});

describe("calculateScaledDamage", () => {
  it("returns full damage for score >= 80", () => {
    expect(calculateScaledDamage(25, 80)).toEqual({ damage: 25, outcome: "hit" });
    expect(calculateScaledDamage(25, 95)).toEqual({ damage: 25, outcome: "hit" });
  });

  it("returns 0 damage for score < 80", () => {
    expect(calculateScaledDamage(25, 79)).toEqual({ damage: 0, outcome: "miss" });
    expect(calculateScaledDamage(25, 50)).toEqual({ damage: 0, outcome: "miss" });
  });
});

describe("processRecordingComplete", () => {
  it("reduces boss HP on pass (score >= 80)", () => {
    const state = createBattleState(2, false, WUKONG_ONLY);
    // Stage 2: 6 sub-groups, boss HP 100
    // damage = ceil(100/6) = 17
    const newState = processRecordingComplete(state, 85);

    expect(newState.bossHP).toBe(83); // 100 - 17
    expect(newState.recordingsCompleted).toBe(1);
  });

  it("does not advance recordingsCompleted on fail (score < 80)", () => {
    const state = createBattleState(2, false, WUKONG_ONLY);
    const newState = processRecordingComplete(state, 70);

    expect(newState.bossHP).toBe(100); // No damage
    expect(newState.recordingsCompleted).toBe(0); // Not advanced
    expect(newState.results.pronunciationScores).toEqual([70]);
  });

  it("calculates average pronunciation score", () => {
    let state = createBattleState(2, false, WUKONG_ONLY);
    state = processRecordingComplete(state, 80);
    state = processRecordingComplete(state, 90);

    expect(state.results.pronunciationScores).toEqual([80, 90]);
    expect(state.results.avgPronunciationScore).toBe(85);
  });

  it("does not reduce boss HP below 0", () => {
    let state = createBattleState(1, false, WUKONG_ONLY);
    state = { ...state, bossHP: 10 };
    const newState = processRecordingComplete(state, 90);

    expect(newState.bossHP).toBe(0);
  });
});

describe("advanceBattle", () => {
  it("returns defeat when playerHP is 0", () => {
    let state = createBattleState(1, false, WITH_ONE_COMPANION);
    const initialHP = state.playerHP; // 5
    for (let i = 0; i < initialHP; i++) {
      state = processMCQAnswer(state, false);
    }
    expect(state.playerHP).toBe(0);

    const result = advanceBattle(state);
    expect(result.outcome).toBe("defeat");
  });

  it("does nothing from player_menu phase", () => {
    const state = createBattleState(1, false, WITH_ONE_COMPANION);
    expect(state.phase).toBe("player_menu");

    const result = advanceBattle(state);
    expect(result.outcome).toBe("continue");
    expect(result.state.phase).toBe("player_menu");
  });

  it("advances to next recording on pass from player_attack", () => {
    let state = createBattleState(2, false, WUKONG_ONLY);
    // Simulate a passed recording (score >= 80)
    state = processRecordingComplete(state, 85);
    state = { ...state, phase: "player_attack" };

    const result = advanceBattle(state);
    expect(result.outcome).toBe("continue");
    expect(result.state.currentRecordingIndex).toBe(1);
    expect(result.state.phase).toBe("player_menu");
  });

  it("sets up MCQ batch on fail from player_attack", () => {
    let state = createBattleState(2, false, WUKONG_ONLY);
    // Simulate a failed recording (score < 80)
    state = processRecordingComplete(state, 60);
    state = { ...state, phase: "player_attack" };

    const result = advanceBattle(state);
    expect(result.outcome).toBe("continue");
    expect(result.state.phase).toBe("boss_attack");
    expect(result.state.mcqBatchIndices).toHaveLength(3);
    expect(result.state.currentMCQInBatch).toBe(0);
    expect(result.state.isRetry).toBe(true);
  });

  it("advances to next MCQ within boss_attack batch", () => {
    let state = createBattleState(2, false, WUKONG_ONLY);
    state = {
      ...state,
      phase: "boss_attack",
      mcqBatchIndices: [0, 1, 2],
      currentMCQInBatch: 0,
    };

    const result = advanceBattle(state);
    expect(result.outcome).toBe("continue");
    expect(result.state.currentMCQInBatch).toBe(1);
    expect(result.state.phase).toBe("boss_attack");
  });

  it("returns to player_menu after MCQ batch completes", () => {
    let state = createBattleState(2, false, WUKONG_ONLY);
    state = {
      ...state,
      phase: "boss_attack",
      mcqBatchIndices: [0, 1, 2],
      currentMCQInBatch: 2, // last MCQ in batch
    };

    const result = advanceBattle(state);
    expect(result.outcome).toBe("continue");
    expect(result.state.phase).toBe("player_menu");
  });

  it("returns victory when all recordings are completed", () => {
    let state = createBattleState(1, false, WUKONG_ONLY);
    // Stage 1: 4 sub-groups after splitting
    // Simulate completing all 4 recordings
    state = processRecordingComplete(state, 90);
    state = processRecordingComplete(state, 90);
    state = processRecordingComplete(state, 90);
    state = processRecordingComplete(state, 90);
    state = { ...state, phase: "player_attack" };

    const result = advanceBattle(state);
    expect(result.outcome).toBe("victory");
  });

  it("returns victory when boss HP reaches 0", () => {
    let state = createBattleState(2, false, WUKONG_ONLY);
    state = processRecordingComplete(state, 90);
    state = { ...state, phase: "player_attack", bossHP: 0 };

    const result = advanceBattle(state);
    expect(result.outcome).toBe("victory");
  });

  it("returns defeat after MCQ batch if HP is 0", () => {
    let state = createBattleState(2, false, WUKONG_ONLY);
    state = {
      ...state,
      phase: "boss_attack",
      mcqBatchIndices: [0, 1, 2],
      currentMCQInBatch: 2,
      playerHP: 0,
    };

    const result = advanceBattle(state);
    expect(result.outcome).toBe("defeat");
  });

  it("handles no MCQ questions gracefully on fail", () => {
    let state = createBattleState(1, false, WUKONG_ONLY);
    // Clear MCQ questions to simulate no MCQs available
    state = {
      ...state,
      mcqQuestions: [],
      phase: "player_attack",
      results: {
        ...state.results,
        pronunciationScores: [50], // Failed score
      },
    };

    const result = advanceBattle(state);
    expect(result.outcome).toBe("continue");
    expect(result.state.phase).toBe("player_menu");
    expect(result.state.isRetry).toBe(true);
  });
});

describe("calculateQuestXP", () => {
  it("calculates XP for a complete battle", () => {
    let state = createBattleState(1, false, WITH_ONE_COMPANION);
    // Stage 1: totalRecordings = 4 (20 mono / 5)
    state = processMCQAnswer(state, true);
    state = processMCQAnswer(state, true);
    state = processMCQAnswer(state, true);
    state = processRecordingComplete(state, 80);

    const xp = calculateQuestXP(state);
    // mcqBonus = 3 * 5 = 15
    // pronBonus = round(80 / 10) * 4 = 8 * 4 = 32
    // stageBonus = 1 * 10 = 10
    // total = 57
    expect(xp).toBe(57);
  });

  it("calculates XP with multiple recordings", () => {
    let state = createBattleState(2, false, WUKONG_ONLY);
    // Stage 2: totalRecordings = 6 (15/5 + 15/5)
    state = processMCQAnswer(state, true);
    state = processMCQAnswer(state, true);
    state = processMCQAnswer(state, true);
    state = processMCQAnswer(state, true);
    state = processRecordingComplete(state, 70);
    state = processRecordingComplete(state, 80);

    const xp = calculateQuestXP(state);
    // mcqBonus = 4 * 5 = 20
    // avg = 75, pronBonus = round(75/10) * 6 = 8 * 6 = 48
    // stageBonus = 2 * 10 = 20
    // total = 88
    expect(xp).toBe(88);
  });

  it("gives 0 pronBonus when no recordings done", () => {
    const state = createBattleState(1, false, WITH_ONE_COMPANION);
    const xp = calculateQuestXP(state);
    // mcqBonus = 0
    // pronBonus = round(0/10) * 4 = 0
    // stageBonus = 1 * 10 = 10
    expect(xp).toBe(10);
  });
});

describe("getUnlockedCharacters", () => {
  it("always includes Son Wukong", () => {
    const characters = getUnlockedCharacters([]);
    expect(characters).toContain("Son Wukong");
    expect(characters).toHaveLength(1);
  });

  it("unlocks Sam Jang after stage 2", () => {
    const characters = getUnlockedCharacters([1, 2]);
    expect(characters).toContain("Son Wukong");
    expect(characters).toContain("Sam Jang");
    expect(characters).toHaveLength(2);
  });

  it("unlocks Sha Wujing after stage 3", () => {
    const characters = getUnlockedCharacters([1, 2, 3]);
    expect(characters).toContain("Son Wukong");
    expect(characters).toContain("Sam Jang");
    expect(characters).toContain("Sha Wujing");
    expect(characters).toHaveLength(3);
  });

  it("unlocks all characters after stage 6", () => {
    const characters = getUnlockedCharacters([1, 2, 3, 4, 5, 6]);
    expect(characters).toContain("Son Wukong");
    expect(characters).toContain("Sam Jang");
    expect(characters).toContain("Sha Wujing");
    expect(characters).toContain("Zhu Baijie");
    expect(characters).toHaveLength(4);
  });

  it("deduplicates characters", () => {
    const characters = getUnlockedCharacters([2, 2, 2]);
    expect(characters).toContain("Son Wukong");
    expect(characters).toContain("Sam Jang");
    expect(characters).toHaveLength(2);
  });

  it("does not unlock extra characters from non-unlock stages", () => {
    const characters = getUnlockedCharacters([1, 4, 5, 7]);
    expect(characters).toContain("Son Wukong");
    expect(characters).toHaveLength(1);
  });
});

describe("splitRecordingGroups", () => {
  it("does not split groups with <= 5 words", () => {
    const groups: RecordingGroup[] = [{
      label: "Test", type: "monosyllabic", words: ["a", "b", "c"],
      category: "read_syllable", pinyin: ["ā", "b", "c"],
    }];
    const result = splitRecordingGroups(groups);
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe("Test");
    expect(result[0].words).toEqual(["a", "b", "c"]);
  });

  it("splits a group of 10 into 2 sub-groups of 5", () => {
    const words = Array.from({ length: 10 }, (_, i) => `w${i}`);
    const pinyin = Array.from({ length: 10 }, (_, i) => `p${i}`);
    const groups: RecordingGroup[] = [{
      label: "Words", type: "multisyllabic", words, category: "read_word", pinyin,
    }];
    const result = splitRecordingGroups(groups);
    expect(result).toHaveLength(2);
    expect(result[0].label).toBe("Words (Part 1/2)");
    expect(result[0].words).toHaveLength(5);
    expect(result[0].pinyin).toHaveLength(5);
    expect(result[1].label).toBe("Words (Part 2/2)");
    expect(result[1].words).toHaveLength(5);
  });

  it("handles uneven splits (remainder group)", () => {
    const words = Array.from({ length: 7 }, (_, i) => `w${i}`);
    const groups: RecordingGroup[] = [{
      label: "Test", type: "monosyllabic", words, category: "read_syllable",
    }];
    const result = splitRecordingGroups(groups);
    expect(result).toHaveLength(2);
    expect(result[0].words).toHaveLength(5);
    expect(result[1].words).toHaveLength(2);
    expect(result[1].label).toBe("Test (Part 2/2)");
  });

  it("does not split passage groups", () => {
    const groups: RecordingGroup[] = [{
      label: "Passage", type: "passage", words: [],
      passageText: "Long passage...", category: "read_chapter",
    }];
    const result = splitRecordingGroups(groups);
    expect(result).toHaveLength(1);
    expect(result[0].passageText).toBe("Long passage...");
  });

  it("handles undefined pinyin", () => {
    const words = Array.from({ length: 8 }, (_, i) => `w${i}`);
    const groups: RecordingGroup[] = [{
      label: "NoPinyin", type: "monosyllabic", words, category: "read_syllable",
    }];
    const result = splitRecordingGroups(groups);
    expect(result).toHaveLength(2);
    expect(result[0].pinyin).toBeUndefined();
    expect(result[1].pinyin).toBeUndefined();
  });

  it("preserves type and category across sub-groups", () => {
    const words = Array.from({ length: 12 }, (_, i) => `w${i}`);
    const groups: RecordingGroup[] = [{
      label: "Test", type: "multisyllabic", words, category: "read_word",
    }];
    const result = splitRecordingGroups(groups);
    expect(result).toHaveLength(3);
    result.forEach(g => {
      expect(g.type).toBe("multisyllabic");
      expect(g.category).toBe("read_word");
    });
  });
});
