export type AchievementTier = 'common' | 'uncommon' | 'rare' | 'epic';

export interface AchievementDef {
  key: string;
  name: string;
  description: string;
  emoji: string;
  tier: AchievementTier;
  sortOrder: number;
}

export type AchievementContext =
  | { type: 'quest_clear'; stage: number; damageTaken: number; remainingHP: number }
  | { type: 'quest_fail' }
  | { type: 'session_complete'; characterName: string }
  | { type: 'friend_added' }
  | { type: 'mock_exam_complete' }
  | { type: 'account_created' };

export interface UnlockedAchievement {
  key: string;
  name: string;
  emoji: string;
  tier: AchievementTier;
}

export const TIER_COLORS: Record<AchievementTier, string> = {
  common: '#CD7F32',
  uncommon: '#C0C0C0',
  rare: '#FFD700',
  epic: '#9B59B6',
};
