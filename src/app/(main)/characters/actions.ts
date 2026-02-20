"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function selectCharacter(characterId: string) {
  if (!UUID_REGEX.test(characterId)) return { error: "Invalid character ID" };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // Deselect all characters first
  await supabase
    .from("user_characters")
    .update({ is_selected: false })
    .eq("user_id", user.id);

  // Select the new one
  await supabase
    .from("user_characters")
    .update({ is_selected: true })
    .eq("user_id", user.id)
    .eq("character_id", characterId);

  revalidatePath("/characters");
  revalidatePath("/dashboard");
}

/** Unlock a character that the user has earned through quest progression */
export async function unlockCharacterByQuest(characterId: string) {
  if (!UUID_REGEX.test(characterId)) return { error: "Invalid character ID" };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // Get character's unlock_stage requirement
  const { data: character } = await supabase
    .from("characters")
    .select("id, unlock_stage")
    .eq("id", characterId)
    .single();

  if (!character) return { error: "Character not found" };

  // Verify quest stage is cleared (if unlock_stage is set)
  if (character.unlock_stage) {
    const { data: progress } = await supabase
      .from("quest_progress")
      .select("is_cleared")
      .eq("user_id", user.id)
      .eq("stage", character.unlock_stage)
      .single();

    if (!progress?.is_cleared) {
      return { error: "Quest stage not cleared yet" };
    }
  }

  // Unlock character (upsert to handle race conditions)
  await supabase
    .from("user_characters")
    .upsert(
      { user_id: user.id, character_id: characterId, is_selected: false },
      { onConflict: "user_id,character_id", ignoreDuplicates: true }
    );

  revalidatePath("/characters");
  revalidatePath("/dashboard");
}
