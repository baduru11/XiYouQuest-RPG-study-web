import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { unlockCharacterSchema } from "@/lib/validations";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = unlockCharacterSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input: characterId must be a valid UUID" }, { status: 400 });
    }
    const { characterId } = parsed.data;

    // Check if character is already unlocked
    const { data: existingUnlock } = await supabase
      .from("user_characters")
      .select("character_id")
      .eq("user_id", user.id)
      .eq("character_id", characterId)
      .single();

    if (existingUnlock) {
      return NextResponse.json({ error: "Character already unlocked" }, { status: 400 });
    }

    // Get character's unlock_cost_xp
    const { data: character } = await supabase
      .from("characters")
      .select("unlock_cost_xp")
      .eq("id", characterId)
      .single();

    if (!character) {
      return NextResponse.json({ error: "Character not found" }, { status: 404 });
    }

    // Atomically deduct XP — only succeeds if user has enough
    const { data: remainingXP, error: deductError } = await supabase
      .rpc("deduct_xp_if_sufficient", {
        p_user_id: user.id,
        p_cost: character.unlock_cost_xp,
      });

    if (deductError) {
      console.error("XP deduction error:", deductError);
      return NextResponse.json({ error: "Failed to deduct XP" }, { status: 500 });
    }

    if (remainingXP === -1) {
      return NextResponse.json(
        {
          error: "Not enough XP",
          required: character.unlock_cost_xp,
        },
        { status: 400 }
      );
    }

    // Insert into user_characters
    const { error: unlockError } = await supabase
      .from("user_characters")
      .insert({
        user_id: user.id,
        character_id: characterId,
        is_selected: false,
        affection_xp: 0,
        affection_level: 1,
      });

    if (unlockError) {
      console.error("Unlock error:", unlockError);
      // Refund the XP atomically
      await supabase.rpc("deduct_xp_if_sufficient", {
        p_user_id: user.id,
        p_cost: -character.unlock_cost_xp,
      });
      return NextResponse.json({ error: "Failed to unlock character" }, { status: 500 });
    }

    return NextResponse.json({ success: true, remainingXP });
  } catch (error) {
    console.error("Unlock character error:", error);
    return NextResponse.json({ error: "Unlock failed" }, { status: 500 });
  }
}
