// src/lib/quest/__tests__/battle-logic.test.ts

import { describe, it, expect } from "vitest";
import {
  generateBattleRounds,
  createBattleState,
  processMCQAnswer,
  processRecordingComplete,
  advanceBattle,
  calculateBossDamage,
  calculateQuestXP,
  getUnlockedCharacters,
} from "../battle-logic";

describe("generateBattleRounds", () => {
  it("generates correct rounds for stage 1 (1 recording, 5 MCQ)", () => {
    const rounds = generateBattleRounds(1);

    // Stage 1: 1 recording group, 5 MCQ questions
    // => 1 round with all 5 MCQs + 1 recording
    expect(rounds).toHaveLength(1);
    expect(rounds[0].mcqIndices).toEqual([0, 1, 2, 3, 4]);
    expect(rounds[0].recordingGroupIndex).toBe(0);
  });

  it("distributes MCQ evenly across recording groups for stage 2", () => {
    const rounds = generateBattleRounds(2);

    // Stage 2: 4 recording groups, 10 MCQ questions
    // MCQ per round = ceil(10 / 4) = 3
    // Round 0: MCQ [0,1,2], recording 0
    // Round 1: MCQ [3,4,5], recording 1
    // Round 2: MCQ [6,7,8], recording 2
    // Round 3: MCQ [9], recording 3 (only 1 remaining)
    expect(rounds).toHaveLength(4);
    expect(rounds[0].mcqIndices).toEqual([0, 1, 2]);
    expect(rounds[1].mcqIndices).toEqual([3, 4, 5]);
    expect(rounds[2].mcqIndices).toEqual([6, 7, 8]);
    expect(rounds[3].mcqIndices).toEqual([9]);

    expect(rounds[0].recordingGroupIndex).toBe(0);
    expect(rounds[1].recordingGroupIndex).toBe(1);
    expect(rounds[2].recordingGroupIndex).toBe(2);
    expect(rounds[3].recordingGroupIndex).toBe(3);
  });

  it("distributes MCQ across recording groups for stage 3", () => {
    const rounds = generateBattleRounds(3);

    // Stage 3: 3 recording groups, 10 MCQ questions
    // MCQ per round = ceil(10 / 3) = 4
    // Round 0: MCQ [0,1,2,3], recording 0
    // Round 1: MCQ [4,5,6,7], recording 1
    // Round 2: MCQ [8,9], recording 2 (only 2 remaining)
    expect(rounds).toHaveLength(3);
    expect(rounds[0].mcqIndices).toEqual([0, 1, 2, 3]);
    expect(rounds[1].mcqIndices).toEqual([4, 5, 6, 7]);
    expect(rounds[2].mcqIndices).toEqual([8, 9]);
  });

  it("distributes MCQ across recording groups for stage 6", () => {
    const rounds = generateBattleRounds(6);

    // Stage 6: 3 recording groups, 15 MCQ questions
    // MCQ per round = ceil(15 / 3) = 5
    // Round 0: MCQ [0,1,2,3,4], recording 0
    // Round 1: MCQ [5,6,7,8,9], recording 1
    // Round 2: MCQ [10,11,12,13,14], recording 2
    expect(rounds).toHaveLength(3);
    expect(rounds[0].mcqIndices).toEqual([0, 1, 2, 3, 4]);
    expect(rounds[1].mcqIndices).toEqual([5, 6, 7, 8, 9]);
    expect(rounds[2].mcqIndices).toEqual([10, 11, 12, 13, 14]);
  });
});

describe("createBattleState", () => {
  it("initializes with correct HP for stage 1", () => {
    const state = createBattleState(1, false);

    expect(state.playerHP).toBe(5); // Stage 1 playerMaxHP = 5
    expect(state.bossHP).toBe(100); // bossMaxHP = 100
    expect(state.currentRound).toBe(0);
    expect(state.currentMCQInRound).toBe(0);
    expect(state.recordingsCompleted).toBe(0);
    expect(state.totalRecordings).toBe(1);
    expect(state.isRetry).toBe(false);
    expect(state.results.mcqCorrect).toBe(0);
    expect(state.results.mcqTotal).toBe(0);
    expect(state.results.avgPronunciationScore).toBe(0);
    expect(state.results.pronunciationScores).toEqual([]);
  });

  it("marks retry flag", () => {
    const state = createBattleState(1, true);
    expect(state.isRetry).toBe(true);
  });

  it("initializes with correct HP for stage 5", () => {
    const state = createBattleState(5, false);
    expect(state.playerHP).toBe(3); // Stage 5 playerMaxHP = 3
    expect(state.totalRecordings).toBe(3); // Stage 5 has 3 recording groups
  });

  it("sets initial phase to boss_attack when first round has MCQs", () => {
    const state = createBattleState(1, false);
    // Stage 1 has 5 MCQs, so first round has MCQs
    expect(state.phase).toBe("boss_attack");
  });

  it("includes stage config in state", () => {
    const state = createBattleState(3, false);
    expect(state.stage.stage).toBe(3);
    expect(state.stage.name).toBe("Desert of Illusion");
    expect(state.stage.bossName).toBe("Lady of Bleached Bones");
  });
});

describe("processMCQAnswer", () => {
  it("does not reduce HP on correct answer", () => {
    const state = createBattleState(1, false);
    const newState = processMCQAnswer(state, true);

    expect(newState.playerHP).toBe(state.playerHP);
    expect(newState.results.mcqCorrect).toBe(1);
    expect(newState.results.mcqTotal).toBe(1);
  });

  it("reduces HP by 1 on wrong answer", () => {
    const state = createBattleState(1, false);
    const newState = processMCQAnswer(state, false);

    expect(newState.playerHP).toBe(state.playerHP - 1);
    expect(newState.results.mcqCorrect).toBe(0);
    expect(newState.results.mcqTotal).toBe(1);
  });

  it("does not reduce HP below 0", () => {
    let state = createBattleState(1, false);
    // Drain HP to 0
    for (let i = 0; i < 10; i++) {
      state = processMCQAnswer(state, false);
    }
    expect(state.playerHP).toBe(0);
  });

  it("tracks multiple answers correctly", () => {
    let state = createBattleState(1, false);
    state = processMCQAnswer(state, true);
    state = processMCQAnswer(state, false);
    state = processMCQAnswer(state, true);

    expect(state.results.mcqCorrect).toBe(2);
    expect(state.results.mcqTotal).toBe(3);
    expect(state.playerHP).toBe(4); // 5 - 1 = 4
  });
});

describe("calculateBossDamage", () => {
  it("divides boss HP evenly across recordings", () => {
    // 100 HP, 4 recordings => ceil(100/4) = 25
    expect(calculateBossDamage(100, 4)).toBe(25);
  });

  it("uses ceiling for uneven division", () => {
    // 100 HP, 3 recordings => ceil(100/3) = 34
    expect(calculateBossDamage(100, 3)).toBe(34);
  });

  it("returns full HP for single recording", () => {
    // 100 HP, 1 recording => 100
    expect(calculateBossDamage(100, 1)).toBe(100);
  });
});

describe("processRecordingComplete", () => {
  it("reduces boss HP by damage amount", () => {
    const state = createBattleState(2, false);
    // Stage 2 has 4 recording groups, boss HP 100
    // damage = ceil(100/4) = 25
    const newState = processRecordingComplete(state, 85);

    expect(newState.bossHP).toBe(75); // 100 - 25
    expect(newState.recordingsCompleted).toBe(1);
  });

  it("calculates average pronunciation score", () => {
    let state = createBattleState(2, false);
    state = processRecordingComplete(state, 80);
    state = processRecordingComplete(state, 90);

    expect(state.results.pronunciationScores).toEqual([80, 90]);
    expect(state.results.avgPronunciationScore).toBe(85);
  });

  it("does not reduce boss HP below 0", () => {
    const state = createBattleState(1, false);
    // Stage 1 has 1 recording group, damage = ceil(100/1) = 100
    const newState = processRecordingComplete(state, 90);

    expect(newState.bossHP).toBe(0);
  });
});

describe("advanceBattle", () => {
  it("returns defeat when playerHP is 0", () => {
    let state = createBattleState(1, false);
    const initialHP = state.playerHP; // 5
    // Drain all HP
    for (let i = 0; i < initialHP; i++) {
      state = processMCQAnswer(state, false);
    }
    expect(state.playerHP).toBe(0);

    const result = advanceBattle(state);
    expect(result.outcome).toBe("defeat");
  });

  it("advances to next MCQ within a round", () => {
    const state = createBattleState(1, false);
    // Stage 1 round 0 has 5 MCQs, we are at MCQ 0
    expect(state.phase).toBe("boss_attack");
    expect(state.currentMCQInRound).toBe(0);

    const result = advanceBattle(state);
    expect(result.outcome).toBe("continue");
    expect(result.state.currentMCQInRound).toBe(1);
    expect(result.state.phase).toBe("boss_attack");
  });

  it("transitions to player_attack after all MCQs in a round", () => {
    let state = createBattleState(1, false);
    // Advance through all 5 MCQs (indices 0-4)
    for (let i = 0; i < 4; i++) {
      const result = advanceBattle(state);
      state = result.state;
    }
    // Now at MCQ index 4 (the last one)
    expect(state.currentMCQInRound).toBe(4);

    const result = advanceBattle(state);
    expect(result.outcome).toBe("continue");
    expect(result.state.phase).toBe("player_attack");
  });

  it("returns victory when all rounds are done", () => {
    let state = createBattleState(1, false);
    // Stage 1: 1 round. Advance through MCQs then player_attack.
    // Go through 5 MCQ advances
    for (let i = 0; i < 5; i++) {
      state = advanceBattle(state).state;
    }
    // Now in player_attack, last round (round 0 of 1 total)
    expect(state.phase).toBe("player_attack");

    const result = advanceBattle(state);
    expect(result.outcome).toBe("victory");
  });

  it("returns victory when boss HP reaches 0", () => {
    let state = createBattleState(2, false);
    // Set phase to player_attack and bossHP to 0
    state = { ...state, phase: "player_attack", bossHP: 0 };

    const result = advanceBattle(state);
    expect(result.outcome).toBe("victory");
  });

  it("advances to next round from player_attack phase", () => {
    let state = createBattleState(2, false);
    // Stage 2: 4 rounds. Put into player_attack of round 0.
    state = { ...state, phase: "player_attack", currentRound: 0 };

    const result = advanceBattle(state);
    expect(result.outcome).toBe("continue");
    expect(result.state.currentRound).toBe(1);
    expect(result.state.phase).toBe("boss_attack"); // Next round has MCQs
  });
});

describe("calculateQuestXP", () => {
  it("calculates XP for a complete battle", () => {
    let state = createBattleState(1, false);
    // Simulate: 3 correct MCQs, 1 recording at score 80
    state = processMCQAnswer(state, true);
    state = processMCQAnswer(state, true);
    state = processMCQAnswer(state, true);
    state = processRecordingComplete(state, 80);

    const xp = calculateQuestXP(state);
    // mcqBonus = 3 * 5 = 15
    // pronBonus = round(80 / 10) * 1 = 8 * 1 = 8
    // stageBonus = 1 * 10 = 10
    // total = 33
    expect(xp).toBe(33);
  });

  it("calculates XP with multiple recordings", () => {
    let state = createBattleState(2, false);
    // 4 correct MCQs, 2 recordings at avg 75
    state = processMCQAnswer(state, true);
    state = processMCQAnswer(state, true);
    state = processMCQAnswer(state, true);
    state = processMCQAnswer(state, true);
    state = processRecordingComplete(state, 70);
    state = processRecordingComplete(state, 80);

    const xp = calculateQuestXP(state);
    // mcqBonus = 4 * 5 = 20
    // avg = 75, pronBonus = round(75/10) * 4 = 8 * 4 = 32
    // stageBonus = 2 * 10 = 20
    // total = 72
    expect(xp).toBe(72);
  });

  it("gives 0 pronBonus when no recordings done", () => {
    const state = createBattleState(1, false);
    const xp = calculateQuestXP(state);
    // mcqBonus = 0
    // pronBonus = round(0/10) * 1 = 0
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
