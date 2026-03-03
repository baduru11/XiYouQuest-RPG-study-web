import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { chatStartSchema } from "@/lib/validations";
import { chatConversation } from "@/lib/gemini/client";
import { buildChatSystemPrompt } from "@/lib/chat/build-system-prompt";
import { synthesizeAcademic } from "@/lib/voice/client";

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

    // Parallelize all initial DB queries
    const [{ data: userChar }, { data: character }, { data: scenario }] = await Promise.all([
      supabase.from("user_characters").select("character_id").eq("user_id", user.id).eq("character_id", characterId).single(),
      supabase.from("characters").select("name, personality_prompt, voice_id").eq("id", characterId).single(),
      supabase.from("chat_scenarios").select("*").eq("id", scenarioId).single(),
    ]);

    if (!userChar) {
      return NextResponse.json({ error: "Character not unlocked" }, { status: 403 });
    }
    if (!character || !scenario) {
      return NextResponse.json({ error: "Character or scenario not found" }, { status: 404 });
    }

    // Validate scenario stage is cleared (stage 0-1 always open)
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

    // Create session + generate opening message in parallel
    // (session creation doesn't depend on LLM output)
    const systemPrompt = buildChatSystemPrompt({
      characterName: character.name,
      personalityPrompt: character.personality_prompt,
      scenarioPrompt: scenario.system_prompt,
      category: scenario.category as 'jttw' | 'modern_daily' | 'psc_exam',
    });

    const [{ data: session, error: sessionError }, openingEnvelope] = await Promise.all([
      supabase.from("chat_sessions").insert({
        user_id: user.id,
        character_id: characterId,
        scenario_id: scenarioId,
      }).select("id").single(),
      chatConversation([
        { role: "system", content: systemPrompt },
        { role: "user", content: "（场景开始，请你先开口说话，用1-2句话开始对话）" },
      ]),
    ]);

    if (sessionError || !session) {
      console.error("[Chat] Session creation error:", sessionError);
      return NextResponse.json({ error: "Failed to create session" }, { status: 500 });
    }

    const openingMessage = openingEnvelope.content;

    // Save message + generate TTS in parallel
    let ttsBase64: string | null = null;
    const [, ttsResult] = await Promise.all([
      // Fire-and-forget DB save (don't block response on it)
      supabase.from("chat_messages").insert({
        session_id: session.id,
        role: "companion",
        content: openingMessage,
      }),
      // Generate TTS audio
      synthesizeAcademic({ voiceId: character.voice_id, text: openingMessage })
        .then(buf => Buffer.from(buf).toString("base64"))
        .catch(err => { console.error("[Chat] TTS in start failed:", err); return null; }),
    ]);
    ttsBase64 = ttsResult;

    return NextResponse.json({
      sessionId: session.id,
      openingMessage,
      characterVoiceId: character.voice_id,
      characterName: character.name,
      ttsAudio: ttsBase64,
    });
  } catch (error) {
    console.error("[Chat] Start error:", error);
    return NextResponse.json({ error: "Failed to start chat" }, { status: 500 });
  }
}
