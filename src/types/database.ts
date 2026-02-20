export interface Profile {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  total_xp: number;
  current_level: number;
  last_login_date: string | null;
  login_streak: number;
  created_at: string;
  discord_id: string | null;
  friend_code: string | null;
}

export interface UserProgress {
  id: string;
  user_id: string;
  component: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  questions_attempted: number;
  questions_correct: number;
  best_streak: number;
  total_practice_time_seconds: number;
  last_practiced_at: string | null;
}

export interface Character {
  id: string;
  name: string;
  personality_description: string;
  personality_prompt: string;
  voice_id: string;
  image_url: string;
  unlock_cost_xp: number;
  /** Quest stage that must be cleared to unlock this character (null = always available) */
  unlock_stage: number | null;
  is_default: boolean;
}

export interface CharacterExpression {
  id: string;
  character_id: string;
  expression_name: string;
  image_url: string;
}

export interface CharacterSkin {
  id: string;
  character_id: string;
  skin_name: string;
  image_url: string;
  required_affection_level: number;
}

export interface UserCharacter {
  user_id: string;
  character_id: string;
  unlocked_at: string;
  affection_xp: number;
  affection_level: number;
  active_skin_id: string | null;
  is_selected: boolean;
}

export interface PracticeSession {
  id: string;
  user_id: string;
  character_id: string;
  component: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  score: number;
  xp_earned: number;
  duration_seconds: number;
  created_at: string;
}

export interface PracticeDetail {
  id: string;
  session_id: string;
  question_text: string;
  user_answer: string | null;
  is_correct: boolean;
  pronunciation_score: number | null;
  feedback: string | null;
}

export interface QuestionBank {
  id: string;
  component: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  set_number: number;
  content: string;
  pinyin: string | null;
  metadata: Record<string, unknown>;
}

export interface Friendship {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: 'pending' | 'accepted' | 'rejected';
  created_at: string;
  updated_at: string;
}

export interface Achievement {
  id: string;
  key: string;
  name: string;
  description: string;
  emoji: string;
  tier: 'common' | 'uncommon' | 'rare' | 'epic';
  sort_order: number;
}

export interface UserAchievement {
  id: string;
  user_id: string;
  achievement_id: string;
  unlocked_at: string;
}
