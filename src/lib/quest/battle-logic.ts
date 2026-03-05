// src/lib/quest/battle-logic.ts

import type { BattleState, RecordingGroup, StageNumber } from "./types";
import { getStageConfig } from "./stage-config";
import { STAGE_QUESTIONS } from "./stage-questions";

/** Base HP for Wukong alone */
const BASE_PLAYER_HP = 3;
/** Extra HP per unlocked companion */
const HP_PER_COMPANION = 2;

/** Number of MCQs per failure batch */
export const MCQ_BATCH_SIZE = 3;

/** Pronunciation score threshold — attack only succeeds above this */
export const ATTACK_THRESHOLD = 80;

/** Maximum words per recording sub-group */
export const MAX_WORDS_PER_GROUP = 5;

/**
 * Splits recording groups with more than maxSize words into sub-groups.
 * Passage groups are left untouched.
 * Labels get " (Part X/Y)" suffix when split.
 */
export function splitRecordingGroups(
  groups: RecordingGroup[],
  maxSize: number = MAX_WORDS_PER_GROUP
): RecordingGroup[] {
  const result: RecordingGroup[] = [];

  for (const group of groups) {
    if (group.type === "passage" || group.words.length <= maxSize) {
      result.push(group);
      continue;
    }

    const totalParts = Math.ceil(group.words.length / maxSize);

    for (let part = 0; part < totalParts; part++) {
      const start = part * maxSize;
      const end = Math.min(start + maxSize, group.words.length);

      result.push({
        label: `${group.label} (Part ${part + 1}/${totalParts})`,
        type: group.type,
        words: group.words.slice(start, end),
        category: group.category,
        pinyin: group.pinyin?.slice(start, end),
      });
    }
  }

  return result;
}

/** Fisher-Yates shuffle (in-place, returns same array) */
function shuffleArray<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Calculates player max HP based on unlocked characters.
 * Wukong alone = 3 HP, each companion adds 2 HP.
 */
export function calculatePlayerMaxHP(unlockedCharacters: string[]): number {
  const companions = unlockedCharacters.filter((n) => n !== "Son Wukong").length;
  return BASE_PLAYER_HP + companions * HP_PER_COMPANION;
}

/**
 * Creates initial battle state.
 * Recording groups are split into max-5-word sub-groups.
 * Player HP = 3 base + 2 per unlocked companion.
 */
export function createBattleState(
  stage: StageNumber,
  isRetry: boolean,
  unlockedCharacters: string[]
): BattleState {
  const config = getStageConfig(stage);
  const questions = STAGE_QUESTIONS[stage];
  const recordingGroups = splitRecordingGroups(questions.recordingGroups);
  const totalRecordings = recordingGroups.length;
  const playerMaxHP = calculatePlayerMaxHP(unlockedCharacters);

  return {
    stage: config,
    recordingGroups,
    mcqQuestions: shuffleArray([...questions.mcqQuestions]),
    currentRecordingIndex: 0,
    phase: "player_menu",
    currentMCQInBatch: 0,
    mcqBatchIndices: [],
    mcqCursor: 0,
    playerHP: playerMaxHP,
    playerMaxHP,
    bossHP: config.bossMaxHP,
    recordingsCompleted: 0,
    totalRecordings,
    isRetry,
    results: {
      mcqCorrect: 0,
      mcqTotal: 0,
      avgPronunciationScore: 0,
      pronunciationScores: [],
    },
  };
}

/**
 * Returns ceil(bossMaxHP / totalRecordings).
 * This is the damage dealt per recording completion (on pass).
 */
export function calculateBossDamage(
  bossMaxHP: number,
  totalRecordings: number
): number {
  return Math.ceil(bossMaxHP / totalRecordings);
}

/**
 * Calculates actual damage based on pronunciation score.
 * >= 80: full damage (attack succeeds)
 * < 80: 0 damage (miss)
 */
export function calculateScaledDamage(
  baseDamage: number,
  pronunciationScore: number
): { damage: number; outcome: "hit" | "miss" } {
  if (pronunciationScore >= ATTACK_THRESHOLD) {
    return { damage: baseDamage, outcome: "hit" };
  }
  return { damage: 0, outcome: "miss" };
}

/**
 * Draws the next MCQ_BATCH_SIZE MCQ indices from the pool (cycling).
 * Returns { batchIndices, newCursor }.
 */
export function setupMCQBatch(
  mcqCursor: number,
  totalMCQs: number
): { batchIndices: number[]; newCursor: number } {
  const batchIndices: number[] = [];
  let cursor = mcqCursor;
  const batchSize = Math.min(MCQ_BATCH_SIZE, totalMCQs);

  for (let i = 0; i < batchSize; i++) {
    batchIndices.push(cursor % totalMCQs);
    cursor++;
  }

  return { batchIndices, newCursor: cursor };
}

/**
 * Processes an MCQ answer.
 * Correct: increment mcqCorrect.
 * Wrong: decrement playerHP by 1 (min 0).
 * Always increment mcqTotal.
 */
export function processMCQAnswer(
  state: BattleState,
  isCorrect: boolean
): BattleState {
  return {
    ...state,
    playerHP: isCorrect ? state.playerHP : Math.max(0, state.playerHP - 1),
    results: {
      ...state.results,
      mcqCorrect: isCorrect
        ? state.results.mcqCorrect + 1
        : state.results.mcqCorrect,
      mcqTotal: state.results.mcqTotal + 1,
    },
  };
}

/**
 * Processes a recording completion.
 * Only applies damage and advances on PASS (score >= 80).
 * On FAIL (score < 80), records the score but does NOT advance.
 */
export function processRecordingComplete(
  state: BattleState,
  pronunciationScore: number
): BattleState {
  const newScores = [...state.results.pronunciationScores, pronunciationScore];
  const avgScore =
    newScores.reduce((sum, s) => sum + s, 0) / newScores.length;
  const baseDamage = calculateBossDamage(state.stage.bossMaxHP, state.totalRecordings);
  const { damage } = calculateScaledDamage(baseDamage, pronunciationScore);
  const passed = pronunciationScore >= ATTACK_THRESHOLD;

  return {
    ...state,
    bossHP: Math.max(0, state.bossHP - damage),
    recordingsCompleted: passed
      ? state.recordingsCompleted + 1
      : state.recordingsCompleted,
    results: {
      ...state.results,
      avgPronunciationScore: avgScore,
      pronunciationScores: newScores,
    },
  };
}

/**
 * Advances the battle state to the next phase.
 * Returns the new state and an outcome: "continue", "victory", or "defeat".
 *
 * New flow (recording-centric):
 * - player_menu → player_attack (UI handles)
 * - player_attack (after animation):
 *   - PASS (score >= 80): advance currentRecordingIndex, check victory
 *   - FAIL (score < 80): setup MCQ batch → boss_attack
 * - boss_attack:
 *   - More MCQs in batch: increment currentMCQInBatch
 *   - Batch done: go back to player_attack (retry same recording)
 *   - Check defeat after each MCQ
 */
export function advanceBattle(state: BattleState): {
  state: BattleState;
  outcome: "continue" | "victory" | "defeat";
} {
  // Check for defeat
  if (state.playerHP <= 0) {
    return { state, outcome: "defeat" };
  }

  if (state.phase === "player_attack") {
    // Player just recorded — check if they passed
    const lastScore = state.results.pronunciationScores[state.results.pronunciationScores.length - 1] ?? 0;
    const passed = lastScore >= ATTACK_THRESHOLD;

    if (passed) {
      // Recording passed — check victory
      if (state.bossHP <= 0 || state.recordingsCompleted >= state.totalRecordings) {
        return { state, outcome: "victory" };
      }
      // More recordings to go — back to player_menu
      return {
        state: {
          ...state,
          currentRecordingIndex: state.currentRecordingIndex + 1,
          phase: "player_menu",
        },
        outcome: "continue",
      };
    } else {
      // Recording failed — setup MCQ batch, go to boss_attack
      if (state.mcqQuestions.length === 0) {
        // No MCQs available — just retry recording directly
        return {
          state: { ...state, phase: "player_menu", isRetry: true },
          outcome: "continue",
        };
      }
      const { batchIndices, newCursor } = setupMCQBatch(
        state.mcqCursor,
        state.mcqQuestions.length
      );
      return {
        state: {
          ...state,
          phase: "boss_attack",
          mcqBatchIndices: batchIndices,
          currentMCQInBatch: 0,
          mcqCursor: newCursor,
          isRetry: true,
        },
        outcome: "continue",
      };
    }
  }

  if (state.phase === "boss_attack") {
    // Check if there are more MCQs in the batch
    const nextMCQIndex = state.currentMCQInBatch + 1;
    if (nextMCQIndex < state.mcqBatchIndices.length) {
      return {
        state: { ...state, currentMCQInBatch: nextMCQIndex },
        outcome: "continue",
      };
    }
    // Batch done — check defeat
    if (state.playerHP <= 0) {
      return { state, outcome: "defeat" };
    }
    // Back to player_attack to retry same recording
    return {
      state: { ...state, phase: "player_menu" },
      outcome: "continue",
    };
  }

  // player_menu, animating, or other phases — just continue
  return { state, outcome: "continue" };
}

/**
 * Calculates total XP earned from a battle.
 * mcqBonus = mcqCorrect * 5
 * pronBonus = round(avgPronunciationScore / 10) * totalRecordings
 * stageBonus = stage number * 10
 */
export function calculateQuestXP(state: BattleState): number {
  const mcqBonus = state.results.mcqCorrect * 5;
  const pronBonus =
    Math.round(state.results.avgPronunciationScore / 10) *
    state.totalRecordings;
  const stageBonus = state.stage.stage * 10;

  return mcqBonus + pronBonus + stageBonus;
}

/**
 * Returns the list of unlocked character names based on cleared stages.
 * Always includes "Son Wukong".
 * Stage 2 cleared -> add "Sam Jang"
 * Stage 3 cleared -> add "Sha Wujing"
 * Stage 6 cleared -> add "Zhu Baijie"
 */
export function getUnlockedCharacters(clearedStages: StageNumber[]): string[] {
  const characters = new Set<string>(["Son Wukong"]);

  const cleared = new Set(clearedStages);

  if (cleared.has(2)) {
    characters.add("Sam Jang");
  }
  if (cleared.has(3)) {
    characters.add("Sha Wujing");
  }
  if (cleared.has(6)) {
    characters.add("Zhu Baijie");
  }

  return Array.from(characters);
}
