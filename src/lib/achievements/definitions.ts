import type { AchievementDef } from './types';

export const ACHIEVEMENTS: AchievementDef[] = [
  { key: 'account_created', name: 'First Steps', description: 'Create an account and begin your journey', emoji: '🎒', tier: 'common', sortOrder: 1 },
  { key: 'stage_failed', name: 'Honorable Defeat', description: 'Fall in battle during a quest stage', emoji: '💀', tier: 'common', sortOrder: 2 },
  { key: 'friend_added', name: 'Fellow Traveler', description: 'Add a friend to your companions list', emoji: '👥', tier: 'common', sortOrder: 3 },
  { key: 'mock_exam_complete', name: 'Trial by Fire', description: 'Complete a full mock exam', emoji: '📝', tier: 'common', sortOrder: 4 },
  { key: 'stage_1_cleared', name: 'Stage 1 Cleared', description: 'Clear Stage 1: Prologue', emoji: '⚔️', tier: 'uncommon', sortOrder: 5 },
  { key: 'stage_2_cleared', name: 'Stage 2 Cleared', description: 'Clear Stage 2: River of Shattered Tone', emoji: '⚔️', tier: 'uncommon', sortOrder: 6 },
  { key: 'stage_3_cleared', name: 'Stage 3 Cleared', description: 'Clear Stage 3: Desert of Illusion', emoji: '⚔️', tier: 'uncommon', sortOrder: 7 },
  { key: 'stage_4_cleared', name: 'Stage 4 Cleared', description: 'Clear Stage 4: Moonlit Mountain', emoji: '⚔️', tier: 'uncommon', sortOrder: 8 },
  { key: 'stage_5_cleared', name: 'Stage 5 Cleared', description: 'Clear Stage 5: Misty Bamboo Forest', emoji: '⚔️', tier: 'uncommon', sortOrder: 9 },
  { key: 'stage_6_cleared', name: 'Stage 6 Cleared', description: 'Clear Stage 6: Plains of Fading Echoes', emoji: '⚔️', tier: 'uncommon', sortOrder: 10 },
  { key: 'stage_7_cleared', name: 'Stage 7 Cleared', description: 'Clear Stage 7: Western Palace', emoji: '⚔️', tier: 'uncommon', sortOrder: 11 },
  { key: 'sessions_5_wukong', name: 'Wukong Apprentice', description: 'Complete 5 practice sessions with Sun Wukong', emoji: '🤝', tier: 'uncommon', sortOrder: 12 },
  { key: 'sessions_5_sanzang', name: 'Sanzang Apprentice', description: 'Complete 5 practice sessions with Tang Sanzang', emoji: '🤝', tier: 'uncommon', sortOrder: 13 },
  { key: 'sessions_5_wujing', name: 'Wujing Apprentice', description: 'Complete 5 practice sessions with Sha Wujing', emoji: '🤝', tier: 'uncommon', sortOrder: 14 },
  { key: 'sessions_5_bajie', name: 'Bajie Apprentice', description: 'Complete 5 practice sessions with Zhu Bajie', emoji: '🤝', tier: 'uncommon', sortOrder: 15 },
  { key: 'no_hit_stage_1', name: 'Stage 1 Flawless', description: 'Clear Stage 1 without taking any damage', emoji: '🛡️', tier: 'rare', sortOrder: 16 },
  { key: 'no_hit_stage_2', name: 'Stage 2 Flawless', description: 'Clear Stage 2 without taking any damage', emoji: '🛡️', tier: 'rare', sortOrder: 17 },
  { key: 'no_hit_stage_3', name: 'Stage 3 Flawless', description: 'Clear Stage 3 without taking any damage', emoji: '🛡️', tier: 'rare', sortOrder: 18 },
  { key: 'no_hit_stage_4', name: 'Stage 4 Flawless', description: 'Clear Stage 4 without taking any damage', emoji: '🛡️', tier: 'rare', sortOrder: 19 },
  { key: 'no_hit_stage_5', name: 'Stage 5 Flawless', description: 'Clear Stage 5 without taking any damage', emoji: '🛡️', tier: 'rare', sortOrder: 20 },
  { key: 'no_hit_stage_6', name: 'Stage 6 Flawless', description: 'Clear Stage 6 without taking any damage', emoji: '🛡️', tier: 'rare', sortOrder: 21 },
  { key: 'no_hit_stage_7', name: 'Stage 7 Flawless', description: 'Clear Stage 7 without taking any damage', emoji: '🛡️', tier: 'rare', sortOrder: 22 },
  { key: 'sessions_10_wukong', name: 'Wukong Adept', description: 'Complete 10 practice sessions with Sun Wukong', emoji: '💪', tier: 'rare', sortOrder: 23 },
  { key: 'sessions_10_sanzang', name: 'Sanzang Adept', description: 'Complete 10 practice sessions with Tang Sanzang', emoji: '💪', tier: 'rare', sortOrder: 24 },
  { key: 'sessions_10_wujing', name: 'Wujing Adept', description: 'Complete 10 practice sessions with Sha Wujing', emoji: '💪', tier: 'rare', sortOrder: 25 },
  { key: 'sessions_10_bajie', name: 'Bajie Adept', description: 'Complete 10 practice sessions with Zhu Bajie', emoji: '💪', tier: 'rare', sortOrder: 26 },
  { key: 'clutch_clear', name: 'Last Stand', description: 'Clear a quest stage with only 1 HP remaining', emoji: '❤️‍🔥', tier: 'epic', sortOrder: 27 },
  { key: 'all_stages_cleared', name: 'Journey Complete', description: 'Clear all 7 stages of the Main Quest', emoji: '🏆', tier: 'epic', sortOrder: 28 },
  { key: 'sessions_20_wukong', name: 'Wukong Master', description: 'Complete 20 practice sessions with Sun Wukong', emoji: '⭐', tier: 'epic', sortOrder: 29 },
  { key: 'sessions_20_sanzang', name: 'Sanzang Master', description: 'Complete 20 practice sessions with Tang Sanzang', emoji: '⭐', tier: 'epic', sortOrder: 30 },
  { key: 'sessions_20_wujing', name: 'Wujing Master', description: 'Complete 20 practice sessions with Sha Wujing', emoji: '⭐', tier: 'epic', sortOrder: 31 },
  { key: 'sessions_20_bajie', name: 'Bajie Master', description: 'Complete 20 practice sessions with Zhu Bajie', emoji: '⭐', tier: 'epic', sortOrder: 32 },
];

export const ACHIEVEMENT_MAP = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.key, a]));
export const TOTAL_ACHIEVEMENTS = ACHIEVEMENTS.length;
