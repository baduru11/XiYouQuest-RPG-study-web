import {
  corsResponse,
  jsonResponse,
  errorResponse,
} from "../_shared/cors.ts";
import { createSupabaseClient } from "../_shared/supabase.ts";
import { chatConversation } from "../_shared/ai-client.ts";
import { buildChatSystemPrompt } from "../_shared/chat-prompt.ts";
import {
  synthesizeAcademic,
  uint8ArrayToBase64,
} from "../_shared/iflytek-tts.ts";
import { chatStartSchema } from "../_shared/validations.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return corsResponse();

  const supabase = createSupabaseClient(req);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return errorResponse("Unauthorized", 401);

  try {
    const body = await req.json();
    const parsed = chatStartSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse("Invalid input", 400);
    }
    const { characterId, scenarioId } = parsed.data;

    // Parallelize all initial DB queries
    const [{ data: userChar }, { data: character }, { data: scenario }] =
      await Promise.all([
        supabase
          .from("user_characters")
          .select("character_id")
          .eq("user_id", user.id)
          .eq("character_id", characterId)
          .single(),
        supabase
          .from("characters")
          .select("name, personality_prompt, voice_id")
          .eq("id", characterId)
          .single(),
        supabase
          .from("chat_scenarios")
          .select("*")
          .eq("id", scenarioId)
          .single(),
      ]);

    if (!userChar) {
      return errorResponse("Character not unlocked", 403);
    }
    if (!character || !scenario) {
      return errorResponse("Character or scenario not found", 404);
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
        return errorResponse("Scenario stage not cleared", 403);
      }
    }

    // Create session + generate opening message in parallel
    const systemPrompt = buildChatSystemPrompt({
      characterName: character.name,
      personalityPrompt: character.personality_prompt,
      scenarioPrompt: scenario.system_prompt,
      category: scenario.category as "jttw" | "modern_daily" | "psc_exam",
    });

    const [{ data: session, error: sessionError }, openingEnvelope] =
      await Promise.all([
        supabase
          .from("chat_sessions")
          .insert({
            user_id: user.id,
            character_id: characterId,
            scenario_id: scenarioId,
          })
          .select("id")
          .single(),
        chatConversation([
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: "（场景开始，请你先开口说话，用1-2句话开始对话）",
          },
        ]),
      ]);

    if (sessionError || !session) {
      console.error("[chat-start] Session creation error:", sessionError);
      return errorResponse("Failed to create session", 500);
    }

    const openingMessage = openingEnvelope.content;

    // Save message + generate TTS in parallel
    let ttsBase64: string | null = null;
    const [, ttsResult] = await Promise.all([
      supabase.from("chat_messages").insert({
        session_id: session.id,
        role: "companion",
        content: openingMessage,
      }),
      synthesizeAcademic({
        voiceId: character.voice_id,
        text: openingMessage,
      })
        .then((buf) => uint8ArrayToBase64(buf))
        .catch((err) => {
          console.error("[chat-start] TTS failed:", err);
          return null;
        }),
    ]);
    ttsBase64 = ttsResult;

    return jsonResponse({
      sessionId: session.id,
      openingMessage,
      characterVoiceId: character.voice_id,
      characterName: character.name,
      ttsAudio: ttsBase64,
    });
  } catch (error) {
    console.error("[chat-start] Error:", error);
    return errorResponse("Failed to start chat", 500);
  }
});
