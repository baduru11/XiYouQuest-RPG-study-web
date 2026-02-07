import { XP_VALUES, STREAK_MULTIPLIERS, AFFECTION_LEVELS, USER_LEVELS } from "@/types/gamification";

export function calculateXP(params: {
  pronunciationScore?: number;
  isCorrect: boolean;
  currentStreak: number;
}): { baseXP: number; multiplier: number; totalXP: number } {
  let baseXP: number;

  if (params.pronunciationScore !== undefined) {
    if (params.pronunciationScore >= 90) baseXP = XP_VALUES.question_perfect;
    else if (params.pronunciationScore >= 60) baseXP = XP_VALUES.question_good;
    else baseXP = XP_VALUES.question_attempted;
  } else {
    baseXP = params.isCorrect ? XP_VALUES.question_perfect : XP_VALUES.question_attempted;
  }

  let multiplier = 1;
  for (const [streakThreshold, mult] of Object.entries(STREAK_MULTIPLIERS)) {
    if (params.currentStreak >= Number(streakThreshold)) {
      multiplier = mult;
    }
  }

  return {
    baseXP,
    multiplier,
    totalXP: Math.floor(baseXP * multiplier),
  };
}

export function getUserLevel(totalXP: number): { level: number; name: string; xpToNext: number | null } {
  let currentLevel = 1;
  let currentName = USER_LEVELS[1].name;

  for (const [level, config] of Object.entries(USER_LEVELS)) {
    if (totalXP >= config.xpRequired) {
      currentLevel = Number(level);
      currentName = config.name;
    }
  }

  const nextLevel = USER_LEVELS[currentLevel + 1];
  return {
    level: currentLevel,
    name: currentName,
    xpToNext: nextLevel ? nextLevel.xpRequired - totalXP : null,
  };
}

export function getAffectionLevel(affectionXP: number): { level: number; name: string; xpToNext: number | null } {
  let currentLevel = 1;
  let currentName = AFFECTION_LEVELS[1].name;

  for (const [level, config] of Object.entries(AFFECTION_LEVELS)) {
    if (affectionXP >= config.xpRequired) {
      currentLevel = Number(level);
      currentName = config.name;
    }
  }

  const nextLevel = AFFECTION_LEVELS[currentLevel + 1];
  return {
    level: currentLevel,
    name: currentName,
    xpToNext: nextLevel ? nextLevel.xpRequired - affectionXP : null,
  };
}
