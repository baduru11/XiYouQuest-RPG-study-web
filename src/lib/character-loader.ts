import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExpressionName } from "@/types/character";
import { getCharacterImageFallback } from "@/lib/character-images";

export interface LoadedCharacter {
  id: string | undefined;
  name: string;
  personalityPrompt: string;
  voiceId: string;
  expressions: Record<string, string>;
}

/**
 * Load the user's selected character with expressions from Supabase.
 * Shared across all component pages to avoid duplication.
 */
export async function loadSelectedCharacter(
  supabase: SupabaseClient,
  userId: string
): Promise<LoadedCharacter> {
  const { data: userCharacter } = await supabase
    .from("user_characters")
    .select(`
      *,
      characters (
        *,
        character_expressions (*)
      )
    `)
    .eq("user_id", userId)
    .eq("is_selected", true)
    .single();

  const characterData = userCharacter?.characters;
  const expressions: Record<string, string> = {};

  if (characterData?.character_expressions) {
    for (const expr of characterData.character_expressions as Array<{
      expression_name: ExpressionName;
      image_url: string;
    }>) {
      expressions[expr.expression_name] = expr.image_url;
    }
  }

  const characterName = characterData?.name ?? "Study Buddy";

  return {
    id: characterData?.id,
    name: characterName,
    personalityPrompt:
      characterData?.personality_prompt ??
      "You are a friendly and encouraging study companion.",
    voiceId: characterData?.voice_id ?? "",
    expressions: getCharacterImageFallback(characterName, expressions),
  };
}
