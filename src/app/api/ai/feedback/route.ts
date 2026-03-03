import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateFeedback } from "@/lib/gemini/client";
import { buildPlayerMemory } from "@/lib/gemini/player-memory";
import { aiFeedbackSchema } from "@/lib/validations";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown> | undefined;
  try {
    body = await request.json();
    const parsed = aiFeedbackSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const { characterId, ...feedbackParams } = parsed.data;

    // Look up character prompt server-side (never trust client)
    const { data: character } = await supabase
      .from("characters")
      .select("personality_prompt")
      .eq("id", characterId)
      .single();

    if (!character) {
      return NextResponse.json({ error: "Character not found" }, { status: 404 });
    }

    // Build player memory server-side
    const playerMemory = await buildPlayerMemory(supabase, user.id, characterId);

    const feedback = await generateFeedback({
      ...feedbackParams,
      characterPrompt: character.personality_prompt,
      playerMemory,
    });

    return NextResponse.json({ feedback });
  } catch (error) {
    console.error("AI feedback error:", error);
    const fallback = body?.isCorrect
      ? "做得好！继续加油！ Nice work, keep it up!"
      : "再试一次吧！Practice makes perfect!";
    return NextResponse.json({ feedback: fallback, fallback: true });
  }
}
