// src/lib/quest/battle-logic.ts

import type { BattleRound, BattleState, RecordingGroup, StageNumber } from "./types";
import { getStageConfig } from "./stage-config";
import { STAGE_QUESTIONS } from "./stage-questions";

/** Max words per recording sub-group (passages are never split) */
const MAX_WORDS_PER_GROUP = 5;

/** Base HP for Wukong alone */
const BASE_PLAYER_HP = 3;
/** Extra HP per unlocked companion */
const HP_PER_COMPANION = 2;

/**
 * Calculates player max HP based on unlocked characters.
 * Wukong alone = 3 HP, each companion adds 2 HP.
 */
export function calculatePlayerMaxHP(unlockedCharacters: string[]): number {
  const companions = unlockedCharacters.filter((n) => n !== "Son Wukong").length;
  return BASE_PLAYER_HP + companions * HP_PER_COMPANION;
}

/** Pronunciation score threshold — attack only succeeds above this */
const ATTACK_THRESHOLD = 80;

/**
 * Splits recording groups so each word-based group has at most MAX_WORDS_PER_GROUP words.
 * Passage groups are kept intact.
 */
export function splitRecordingGroups(groups: RecordingGroup[]): RecordingGroup[] {
  const result: RecordingGroup[] = [];

  for (const group of groups) {
    // Passages are never split
    if (group.type === "passage" || group.words.length <= MAX_WORDS_PER_GROUP) {
      result.push(group);
      continue;
    }

    // Split into chunks of MAX_WORDS_PER_GROUP
    const totalChunks = Math.ceil(group.words.length / MAX_WORDS_PER_GROUP);
    for (let c = 0; c < totalChunks; c++) {
      const start = c * MAX_WORDS_PER_GROUP;
      const end = start + MAX_WORDS_PER_GROUP;
      const chunkWords = group.words.slice(start, end);
      const chunkPinyin = group.pinyin?.slice(start, end);

      result.push({
        label: totalChunks > 1 ? `${group.label} (${c + 1}/${totalChunks})` : group.label,
        type: group.type,
        words: chunkWords,
        category: group.category,
        ...(chunkPinyin ? { pinyin: chunkPinyin } : {}),
      });
    }
  }

  return result;
}

/**
 * Distributes MCQ questions evenly across recording groups.
 * Pattern: each round = [MCQ block] + [Recording group]
 * MCQ per round = ceil(totalMCQ / numRecordingGroups)
 */
export function generateBattleRounds(stage: StageNumber, splitGroups: RecordingGroup[]): BattleRound[] {
  const questions = STAGE_QUESTIONS[stage];
  const numRecordingGroups = splitGroups.length;
  const totalMCQ = questions.mcqQuestions.length;
  const mcqPerRound = Math.ceil(totalMCQ / numRecordingGroups);

  const rounds: BattleRound[] = [];
  let mcqIndex = 0;

  for (let i = 0; i < numRecordingGroups; i++) {
    const mcqIndices: number[] = [];
    for (let j = 0; j < mcqPerRound && mcqIndex < totalMCQ; j++) {
      mcqIndices.push(mcqIndex);
      mcqIndex++;
    }

    rounds.push({
      mcqIndices,
      recordingGroupIndex: i,
    });
  }

  return rounds;
}

/**
 * Creates initial battle state with correct HP, rounds, phase.
 * Recording groups are split into sub-groups of max 5 words.
 * Player HP = 3 base + 2 per unlocked companion.
 */
export function createBattleState(
  stage: StageNumber,
  isRetry: boolean,
  unlockedCharacters: string[]
): BattleState {
  const config = getStageConfig(stage);
  const questions = STAGE_QUESTIONS[stage];
  const splitGroups = splitRecordingGroups(questions.recordingGroups);
  const rounds = generateBattleRounds(stage, splitGroups);
  const totalRecordings = splitGroups.length;
  const playerMaxHP = calculatePlayerMaxHP(unlockedCharacters);

  return {
    stage: config,
    rounds,
    recordingGroups: splitGroups,
    currentRound: 0,
    phase: "player_menu",
    currentMCQInRound: 0,
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
 * This is the maximum damage dealt per recording completion.
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
 * Adds the score to pronunciationScores, recalculates average.
 * Damage: >= 80 = full damage (hit), < 80 = 0 damage (miss).
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

  return {
    ...state,
    bossHP: Math.max(0, state.bossHP - damage),
    recordingsCompleted: state.recordingsCompleted + 1,
    results: {
      ...state.results,
      avgPronunciationScore: avgScore,
      pronunciationScores: newScores,
    },
  };
}

/**
 * Advances the battle state to the next phase/round.
 * Returns the new state and an outcome: "continue", "victory", or "defeat".
 *
 * - If playerHP <= 0: defeat
 * - If in boss_attack: advance to next MCQ in round, or to player_attack if done
 * - If in player_attack: if bossHP <= 0 or all rounds done -> victory, else advance to next round
 */
export function advanceBattle(state: BattleState): {
  state: BattleState;
  outcome: "continue" | "victory" | "defeat";
} {
  // Check for defeat
  if (state.playerHP <= 0) {
    return { state, outcome: "defeat" };
  }

  const currentRound = state.rounds[state.currentRound];

  // RPG turn order: player_menu → player_attack → boss_attack → next round

  if (state.phase === "player_attack") {
    // Player just attacked — boss defeated?
    if (state.bossHP <= 0) {
      return { state, outcome: "victory" };
    }
    // Move to boss counter-attack (MCQ phase)
    if (currentRound.mcqIndices.length > 0) {
      return {
        state: { ...state, phase: "boss_attack", currentMCQInRound: 0 },
        outcome: "continue",
      };
    }
    // No MCQs this round — skip to next round or end
    if (state.currentRound >= state.rounds.length - 1) {
      return { state, outcome: state.bossHP <= 0 ? "victory" : "defeat" };
    }
    return {
      state: { ...state, currentRound: state.currentRound + 1, phase: "player_menu", currentMCQInRound: 0 },
      outcome: "continue",
    };
  }

  if (state.phase === "boss_attack") {
    // Check if there are more MCQs in this round
    const nextMCQIndex = state.currentMCQInRound + 1;
    if (nextMCQIndex < currentRound.mcqIndices.length) {
      return {
        state: { ...state, currentMCQInRound: nextMCQIndex },
        outcome: "continue",
      };
    }
    // All MCQs done — check if player survived, then advance to next round
    if (state.playerHP <= 0) {
      return { state, outcome: "defeat" };
    }
    // All rounds done?
    if (state.currentRound >= state.rounds.length - 1) {
      return { state, outcome: state.bossHP <= 0 ? "victory" : "defeat" };
    }
    // Next round — back to player menu
    return {
      state: { ...state, currentRound: state.currentRound + 1, phase: "player_menu", currentMCQInRound: 0 },
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
