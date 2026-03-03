import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { chatStartSchema } from "@/lib/validations";
import { chatConversation } from "@/lib/gemini/client";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = chatStartSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
    const { characterId, scenarioId } = parsed.data;

    // Validate character is unlocked
    const { data: userChar } = await supabase
      .from("user_characters")
      .select("character_id")
      .eq("user_id", user.id)
      .eq("character_id", characterId)
      .single();

    if (!userChar) {
      return NextResponse.json({ error: "Character not unlocked" }, { status: 403 });
    }

    // Fetch character details + scenario
    const [{ data: character }, { data: scenario }] = await Promise.all([
      supabase.from("characters").select("name, personality_prompt, voice_id").eq("id", characterId).single(),
      supabase.from("chat_scenarios").select("*").eq("id", scenarioId).single(),
    ]);

    if (!character || !scenario) {
      return NextResponse.json({ error: "Character or scenario not found" }, { status: 404 });
    }

    // Validate scenario stage is cleared (Stage 1 always open)
    if (scenario.stage_number > 1) {
      const { data: stageProgress } = await supabase
        .from("quest_progress")
        .select("is_cleared")
        .eq("user_id", user.id)
        .eq("stage", scenario.stage_number)
        .eq("is_cleared", true)
        .single();

      if (!stageProgress) {
        return NextResponse.json({ error: "Scenario stage not cleared" }, { status: 403 });
      }
    }

    // Create session
    const { data: session, error: sessionError } = await supabase
      .from("chat_sessions")
      .insert({
        user_id: user.id,
        character_id: characterId,
        scenario_id: scenarioId,
      })
      .select("id")
      .single();

    if (sessionError || !session) {
      console.error("[Chat] Session creation error:", sessionError);
      return NextResponse.json({ error: "Failed to create session" }, { status: 500 });
    }

    // Generate opening message
    const systemPrompt = `You ARE ${character.name}. Stay fully in character at all times.

${character.personality_prompt}

SCENE: ${scenario.system_prompt}

RULES:
- Respond in Mandarin Chinese (简体中文) only
- Keep responses 1-3 sentences, natural conversational length
- Stay in the Journey to the West scenario context
- Be engaging — ask a question to start the conversation
- Use vocabulary appropriate for PSC intermediate level`;

    const openingMessage = await chatConversation([
      { role: "system", content: systemPrompt },
      { role: "user", content: "（场景开始，请你先开口说话，用1-2句话开始对话）" },
    ]);

    // Save opening message
    await supabase.from("chat_messages").insert({
      session_id: session.id,
      role: "companion",
      content: openingMessage,
    });

    return NextResponse.json({
      sessionId: session.id,
      openingMessage,
      characterVoiceId: character.voice_id,
      characterName: character.name,
    });
  } catch (error) {
    console.error("[Chat] Start error:", error);
    return NextResponse.json({ error: "Failed to start chat" }, { status: 500 });
  }
}
