import { NextRequest, NextResponse } from "next/server";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { generateFeedback } from "@/lib/gemini/client";
import { buildPlayerMemory } from "@/lib/gemini/player-memory";
import { aiFeedbackSchema } from "@/lib/validations";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = await enforceRateLimit(user.id, "ai-text");
  if (limited) return limited;

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
  } catch {
    console.error("AI feedback unavailable");
    const fallback = body?.isCorrect
      ? "做得好！继续加油！ Nice work, keep it up!"
      : "再试一次吧！Practice makes perfect!";
    return NextResponse.json({ feedback: fallback, fallback: true });
  }
}
