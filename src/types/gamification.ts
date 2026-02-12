export interface XPEvent {
  type: "question_correct" | "question_good" | "question_attempted" | "daily_login" | "streak_bonus";
  baseXP: number;
  multiplier: number;
  totalXP: number;
}

export const XP_VALUES = {
  question_perfect: 10,
  question_good: 5,
  question_attempted: 2,
  daily_login: 25,
} as const;

export const STREAK_MULTIPLIERS: Record<number, number> = {
  5: 1.5,
  10: 2.0,
};

export const AFFECTION_LEVELS: Record<number, { name: string; xpRequired: number }> = {
  1: { name: "Acquaintance", xpRequired: 0 },
  2: { name: "Friend", xpRequired: 200 },
  3: { name: "Close Friend", xpRequired: 500 },
  4: { name: "Best Friend", xpRequired: 1000 },
  5: { name: "Soulmate", xpRequired: 2000 },
};

export const USER_LEVELS: Record<number, { name: string; xpRequired: number }> = {
  1: { name: "Beginner", xpRequired: 0 },
  2: { name: "Learner", xpRequired: 100 },
  3: { name: "Student", xpRequired: 300 },
  4: { name: "Practitioner", xpRequired: 600 },
  5: { name: "Scholar", xpRequired: 1000 },
  6: { name: "Expert", xpRequired: 1500 },
  7: { name: "Master", xpRequired: 2500 },
  8: { name: "Grandmaster", xpRequired: 4000 },
  9: { name: "Legend", xpRequired: 6000 },
  10: { name: "PSC God", xpRequired: 10000 },
};
