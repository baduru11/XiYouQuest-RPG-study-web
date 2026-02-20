// src/lib/quest/battle-logic.ts

import type { BattleRound, BattleState, StageNumber } from "./types";
import { getStageConfig } from "./stage-config";
import { STAGE_QUESTIONS } from "./stage-questions";

/**
 * Distributes MCQ questions evenly across recording groups.
 * Pattern: each round = [MCQ block] + [Recording group]
 * MCQ per round = ceil(totalMCQ / numRecordingGroups)
 */
export function generateBattleRounds(stage: StageNumber): BattleRound[] {
  const questions = STAGE_QUESTIONS[stage];
  const numRecordingGroups = questions.recordingGroups.length;
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
 * Initial phase: "boss_attack" if first round has MCQs, else "player_attack".
 */
export function createBattleState(
  stage: StageNumber,
  isRetry: boolean
): BattleState {
  const config = getStageConfig(stage);
  const rounds = generateBattleRounds(stage);
  const questions = STAGE_QUESTIONS[stage];
  const totalRecordings = questions.recordingGroups.length;

  const firstRoundHasMCQ = rounds.length > 0 && rounds[0].mcqIndices.length > 0;

  return {
    stage: config,
    rounds,
    currentRound: 0,
    phase: firstRoundHasMCQ ? "boss_attack" : "player_attack",
    currentMCQInRound: 0,
    playerHP: config.playerMaxHP,
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
 * This is the amount of damage dealt per recording completion.
 */
export function calculateBossDamage(
  bossMaxHP: number,
  totalRecordings: number
): number {
  return Math.ceil(bossMaxHP / totalRecordings);
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
 * Subtracts boss damage from bossHP (min 0).
 * Increments recordingsCompleted.
 */
export function processRecordingComplete(
  state: BattleState,
  pronunciationScore: number
): BattleState {
  const newScores = [...state.results.pronunciationScores, pronunciationScore];
  const avgScore =
    newScores.reduce((sum, s) => sum + s, 0) / newScores.length;
  const damage = calculateBossDamage(state.stage.bossMaxHP, state.totalRecordings);

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

  if (state.phase === "boss_attack") {
    // Check if there are more MCQs in this round
    const nextMCQIndex = state.currentMCQInRound + 1;
    if (nextMCQIndex < currentRound.mcqIndices.length) {
      // Advance to next MCQ in the same round
      return {
        state: { ...state, currentMCQInRound: nextMCQIndex },
        outcome: "continue",
      };
    } else {
      // All MCQs in this round done, move to player_attack
      return {
        state: { ...state, phase: "player_attack", currentMCQInRound: 0 },
        outcome: "continue",
      };
    }
  }

  if (state.phase === "player_attack") {
    // Check for victory
    if (state.bossHP <= 0 || state.currentRound >= state.rounds.length - 1) {
      return { state, outcome: "victory" };
    }

    // Advance to next round
    const nextRound = state.currentRound + 1;
    const nextRoundData = state.rounds[nextRound];
    const nextPhase =
      nextRoundData.mcqIndices.length > 0 ? "boss_attack" : "player_attack";

    return {
      state: {
        ...state,
        currentRound: nextRound,
        phase: nextPhase,
        currentMCQInRound: 0,
      },
      outcome: "continue",
    };
  }

  // Animating or other phases - just continue
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
