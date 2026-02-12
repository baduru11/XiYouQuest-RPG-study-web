import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { characterId } = (await request.json()) as { characterId: string };

    if (!characterId) {
      return NextResponse.json({ error: "Missing characterId" }, { status: 400 });
    }

    // Verify the user has this character unlocked
    const { data: userCharacter } = await supabase
      .from("user_characters")
      .select("character_id")
      .eq("user_id", user.id)
      .eq("character_id", characterId)
      .single();

    if (!userCharacter) {
      return NextResponse.json({ error: "Character not unlocked" }, { status: 400 });
    }

    // Set all user_characters.is_selected = false for this user
    const { error: deselectError } = await supabase
      .from("user_characters")
      .update({ is_selected: false })
      .eq("user_id", user.id);

    if (deselectError) {
      console.error("Deselect error:", deselectError);
      return NextResponse.json({ error: "Failed to deselect characters" }, { status: 500 });
    }

    // Set the specified character's is_selected = true
    const { error: selectError } = await supabase
      .from("user_characters")
      .update({ is_selected: true })
      .eq("user_id", user.id)
      .eq("character_id", characterId);

    if (selectError) {
      console.error("Select error:", selectError);
      return NextResponse.json({ error: "Failed to select character" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Select character error:", error);
    return NextResponse.json({ error: "Selection failed" }, { status: 500 });
  }
}
