export type ExpressionName =
  | "neutral"
  | "happy"
  | "proud"
  | "excited"
  | "thinking"
  | "encouraging"
  | "teasing"
  | "surprised"
  | "listening"
  | "disappointed";

export interface CharacterState {
  characterId: string;
  currentExpression: ExpressionName;
  dialogue: string;
  isAnimating: boolean;
}

export interface CharacterWithDetails {
  id: string;
  name: string;
  personality_description: string;
  personality_prompt: string;
  voice_id: string;
  image_url: string;
  unlock_cost_xp: number;
  is_default: boolean;
  expressions: Record<ExpressionName, string>;
  skins: Array<{
    id: string;
    skin_name: string;
    image_url: string;
    required_affection_level: number;
  }>;
}
