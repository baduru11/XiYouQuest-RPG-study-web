import {
  corsResponse,
  jsonResponse,
  errorResponse,
} from "../_shared/cors.ts";
import { createRequestClient } from "../_shared/supabase.ts";
import { verifyUser } from "../_shared/verify-jwt.ts";
import { transcribeAudio } from "../_shared/iflytek-asr.ts";
import {
  COMPANION_MAX_PCM_BYTES,
  COMPANION_TOLERANCE_PCM_BYTES,
  isCompanionAudioWithinLimit,
} from "../_shared/iflytek-asr-frames.ts";
import { assessPronunciation } from "../_shared/iflytek-ise.ts";
import {
  chatConversation,
  type ChatTurnMessage,
} from "../_shared/ai-client.ts";
import { buildChatSystemPrompt } from "../_shared/chat-prompt.ts";
import { isValidUUID } from "../_shared/validations.ts";
import { getAffectionLevel } from "../_shared/affection-levels.ts";

const AFFECTION_PER_TURN = 3;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return corsResponse();

  const user = await verifyUser(req);
  if (!user) return errorResponse("Unauthorized", 401);
  const supabase = createRequestClient(user);

  try {
    const formData = await req.formData();
    const sessionId = formData.get("sessionId") as string;
    const audio = formData.get("audio") as File;
    const filterOffTopic = formData.get("filterOffTopic") !== "false";

    if (!sessionId || !isValidUUID(sessionId) || !audio) {
      return errorResponse("Missing sessionId or audio", 400);
    }

    if (audio.size > COMPANION_MAX_PCM_BYTES + COMPANION_TOLERANCE_PCM_BYTES + 44) {
      return errorResponse(
        "Audio exceeds the 60-second Companion limit",
        400,
      );
    }

    // Verify session belongs to user
    const { data: session } = await supabase
      .from("chat_sessions")
      .select(
        "id, character_id, scenario_id, message_count, ended_at, xp_earned, affection_earned",
      )
      .eq("id", sessionId)
      .eq("user_id", user.id)
      .single();

    if (!session) {
      return errorResponse("Session not found", 404);
    }

    // Auto-reopen ended sessions
    if (session.ended_at) {
      await supabase
        .from("chat_sessions")
        .update({ ended_at: null })
        .eq("id", sessionId);
    }

    // Fetch character + scenario
    const [{ data: character }, { data: scenario }] = await Promise.all([
      supabase
        .from("characters")
        .select("name, personality_prompt, voice_id")
        .eq("id", session.character_id)
        .single(),
      supabase
        .from("chat_scenarios")
        .select("system_prompt, title, category")
        .eq("id", session.scenario_id)
        .single(),
    ]);

    if (!character || !scenario) {
      return errorResponse("Character or scenario not found", 500);
    }

    const audioData = new Uint8Array(await audio.arrayBuffer());
    if (!isCompanionAudioWithinLimit(audioData)) {
      return errorResponse(
        "Audio must contain no more than 60 seconds of speech",
        400,
      );
    }

    // Step 1: ASR transcription
    console.log("[chat-respond] Step 1: Transcribing audio...");
    let transcript: string;
    try {
      const asrResult = await transcribeAudio(audioData);
      transcript = asrResult.transcript.trim();
    } catch (err) {
      console.error("[chat-respond] ASR failed:", err);
      return errorResponse(
        "Speech recognition failed. Please try again.",
        422,
      );
    }

    if (!transcript) {
      return errorResponse(
        "No speech detected. Please speak clearly and try again.",
        422,
      );
    }

    // Step 2: ISE pronunciation scoring
    console.log("[chat-respond] Step 2: Scoring pronunciation...");
    let pronunciationScore = 0;
    let toneScore = 0;
    let fluencyScore = 0;

    try {
      const iseResult = await assessPronunciation(
        audioData,
        transcript,
        "zh-CN",
        "read_chapter",
      );
      pronunciationScore = iseResult.pronunciationScore;
      toneScore = iseResult.toneScore;
      fluencyScore = iseResult.fluencyScore;
    } catch (err) {
      console.error("[chat-respond] ISE scoring failed:", err);
      pronunciationScore = 70;
      toneScore = 70;
      fluencyScore = 70;
    }

    const overallScore = Math.round(
      (pronunciationScore + toneScore + fluencyScore) / 3,
    );

    // Step 3: Build conversation history for LLM
    const currentTurnCount = Math.floor((session.message_count ?? 0) / 2);

    const { data: history } = await supabase
      .from("chat_messages")
      .select("role, content")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });

    const systemPrompt = buildChatSystemPrompt({
      characterName: character.name,
      personalityPrompt: character.personality_prompt,
      scenarioPrompt: scenario.system_prompt,
      overallScore,
      category: scenario.category as "jttw" | "modern_daily" | "psc_exam",
      turnCount: currentTurnCount,
      filterOffTopic,
    });

    const messages: ChatTurnMessage[] = [
      { role: "system", content: systemPrompt },
      ...(history ?? []).map(
        (msg: { role: string; content: string }) => ({
          role: (msg.role === "companion" ? "assistant" : "user") as
            | "assistant"
            | "user",
          content: msg.content,
        }),
      ),
      { role: "user", content: transcript },
    ];

    // Step 4: Generate companion reply
    console.log("[chat-respond] Step 3: Generating companion reply...");
    const response = await chatConversation(messages);

    // Step 5: Conditional save
    if (response.type === "redirect") {
      return jsonResponse({
        userTranscript: transcript,
        scores: {
          pronunciation: pronunciationScore,
          tone: toneScore,
          fluency: fluencyScore,
          overall: overallScore,
        },
        companionReply: response.content,
        xpEarned: 0,
        affectionEarned: 0,
        turnNumber: currentTurnCount,
        isRedirect: true,
      });
    }

    // On-topic reply: save both messages
    await supabase.from("chat_messages").insert({
      session_id: sessionId,
      role: "user",
      content: transcript,
      transcript,
      pronunciation_score: pronunciationScore,
      tone_score: toneScore,
      fluency_score: fluencyScore,
    });

    await supabase.from("chat_messages").insert({
      session_id: sessionId,
      role: "companion",
      content: response.content,
    });

    // Calculate XP for this turn
    let xpEarned = 2;
    if (overallScore >= 90) xpEarned = 10;
    else if (overallScore >= 60) xpEarned = 5;

    // Award per-turn XP atomically via RPC. The daily bonus base (25, mirrors
    // XP_VALUES.daily_login in src/types/gamification.ts) rides along because
    // the first activity of a user's day can be a chat turn; the function's
    // same-day branch guarantees the bonus is granted at most once per day.
    // (The previous p_xp/p_streak arguments did not match the function
    // signature, so per-turn XP was silently never awarded.)
    const { error: xpError } = await supabase.rpc("update_profile_with_streak", {
      p_user_id: user.id,
      p_today: new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Hong_Kong" }),
      p_xp_to_add: xpEarned,
      p_daily_bonus_base: 25,
    });
    if (xpError) {
      console.error("[chat-respond] XP award failed:", xpError);
    }

    // Award affection
    const { data: userChar } = await supabase
      .from("user_characters")
      .select("affection_xp")
      .eq("user_id", user.id)
      .eq("character_id", session.character_id)
      .single();
    if (userChar) {
      const newXP = userChar.affection_xp + AFFECTION_PER_TURN;
      const { level } = getAffectionLevel(newXP);
      await supabase
        .from("user_characters")
        .update({ affection_xp: newXP, affection_level: level })
        .eq("user_id", user.id)
        .eq("character_id", session.character_id);
    }

    // Update session
    await supabase
      .from("chat_sessions")
      .update({
        message_count: (session.message_count ?? 0) + 2,
        xp_earned: (session.xp_earned ?? 0) + xpEarned,
        affection_earned:
          (session.affection_earned ?? 0) + AFFECTION_PER_TURN,
      })
      .eq("id", sessionId);

    const turnNumber = Math.floor(
      ((session.message_count ?? 0) + 2) / 2,
    );

    return jsonResponse({
      userTranscript: transcript,
      scores: {
        pronunciation: pronunciationScore,
        tone: toneScore,
        fluency: fluencyScore,
        overall: overallScore,
      },
      companionReply: response.content,
      xpEarned,
      affectionEarned: AFFECTION_PER_TURN,
      turnNumber,
      isRedirect: false,
    });
  } catch (error) {
    console.error("[chat-respond] Error:", error);
    return errorResponse("Failed to process response", 500);
  }
});
