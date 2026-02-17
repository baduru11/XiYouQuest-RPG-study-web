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

export async function unlockCharacter(characterId: string) {
  if (!UUID_REGEX.test(characterId)) return { error: "Invalid character ID" };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // Get character cost
  const { data: character } = await supabase
    .from("characters")
    .select("unlock_cost_xp")
    .eq("id", characterId)
    .single();

  if (!character) return { error: "Character not found" };

  // Get user XP
  const { data: profile } = await supabase
    .from("profiles")
    .select("total_xp")
    .eq("id", user.id)
    .single();

  if (!profile || profile.total_xp < character.unlock_cost_xp) {
    return { error: "Not enough XP" };
  }

  // Deduct XP and unlock character
  await supabase
    .from("profiles")
    .update({ total_xp: profile.total_xp - character.unlock_cost_xp })
    .eq("id", user.id);

  await supabase
    .from("user_characters")
    .insert({ user_id: user.id, character_id: characterId, is_selected: false });

  revalidatePath("/characters");
  revalidatePath("/dashboard");
}
