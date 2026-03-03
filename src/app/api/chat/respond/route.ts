import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { transcribeAudio } from "@/lib/iflytek-speech/asr-client";
import { assessPronunciation } from "@/lib/iflytek-speech/client";
import { chatConversation, type ChatTurnMessage } from "@/lib/gemini/client";
import { buildChatSystemPrompt } from "@/lib/chat/build-system-prompt";
import { isValidUUID } from "@/lib/validations";
import { getAffectionLevel } from "@/lib/gamification/xp";

const AFFECTION_PER_TURN = 3;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const sessionId = formData.get("sessionId") as string;
    const audio = formData.get("audio") as File;
    const filterOffTopic = formData.get("filterOffTopic") !== "false";

    if (!sessionId || !isValidUUID(sessionId) || !audio) {
      return NextResponse.json({ error: "Missing sessionId or audio" }, { status: 400 });
    }

    // Validate file size (10MB max for chat messages)
    if (audio.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "Audio too large (max 10MB)" }, { status: 400 });
    }

    // Verify session belongs to user
    const { data: session } = await supabase
      .from("chat_sessions")
      .select("id, character_id, scenario_id, message_count, ended_at, xp_earned, affection_earned")
      .eq("id", sessionId)
      .eq("user_id", user.id)
      .single();

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // Auto-reopen ended sessions instead of rejecting
    if (session.ended_at) {
      await supabase.from("chat_sessions")
        .update({ ended_at: null }).eq("id", sessionId);
    }

    // Fetch character + scenario for LLM context
    const [{ data: character }, { data: scenario }] = await Promise.all([
      supabase.from("characters").select("name, personality_prompt, voice_id").eq("id", session.character_id).single(),
      supabase.from("chat_scenarios").select("system_prompt, title, category").eq("id", session.scenario_id).single(),
    ]);

    if (!character || !scenario) {
      return NextResponse.json({ error: "Character or scenario not found" }, { status: 500 });
    }

    const buffer = Buffer.from(await audio.arrayBuffer());

    // Step 1: ASR transcription
    console.log("[Chat] Step 1: Transcribing audio...");
    let transcript: string;
    try {
      const asrResult = await transcribeAudio(buffer);
      transcript = asrResult.transcript.trim();
    } catch (err) {
      console.error("[Chat] ASR failed:", err);
      return NextResponse.json({ error: "Speech recognition failed. Please try again." }, { status: 422 });
    }

    if (!transcript) {
      return NextResponse.json({ error: "No speech detected. Please speak clearly and try again." }, { status: 422 });
    }

    // Step 2: ISE pronunciation scoring
    console.log("[Chat] Step 2: Scoring pronunciation...");
    let pronunciationScore = 0;
    let toneScore = 0;
    let fluencyScore = 0;

    try {
      const iseResult = await assessPronunciation(buffer, transcript, "zh-CN", "read_chapter");
      pronunciationScore = iseResult.pronunciationScore;
      toneScore = iseResult.toneScore;
      fluencyScore = iseResult.fluencyScore;
    } catch (err) {
      console.error("[Chat] ISE scoring failed:", err);
      // Continue without scores rather than failing the whole turn
      pronunciationScore = 70;
      toneScore = 70;
      fluencyScore = 70;
    }

    const overallScore = Math.round((pronunciationScore + toneScore + fluencyScore) / 3);

    // Step 3: Build conversation history for LLM (defer user save until after LLM responds)
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
      category: scenario.category as 'jttw' | 'modern_daily' | 'psc_exam',
      turnCount: currentTurnCount,
      filterOffTopic,
    });

    const messages: ChatTurnMessage[] = [
      { role: "system", content: systemPrompt },
      ...(history ?? []).map((msg) => ({
        role: (msg.role === "companion" ? "assistant" : "user") as "assistant" | "user",
        content: msg.content,
      })),
      // Append current user transcript in-memory (not yet saved)
      { role: "user", content: transcript },
    ];

    // Step 4: Generate companion reply
    console.log("[Chat] Step 3: Generating companion reply...");
    const response = await chatConversation(messages);

    // Step 5: Conditional save — only persist on-topic exchanges
    if (response.type === "redirect") {
      // Off-topic: return scores + redirect, no DB writes
      return NextResponse.json({
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
    let xpEarned = 2; // attempted
    if (overallScore >= 90) xpEarned = 10; // perfect
    else if (overallScore >= 60) xpEarned = 5; // good

    // Award XP to profile immediately
    const { data: profile } = await supabase
      .from("profiles").select("total_xp").eq("id", user.id).single();
    if (profile) {
      await supabase.from("profiles")
        .update({ total_xp: profile.total_xp + xpEarned }).eq("id", user.id);
    }

    // Award affection immediately
    const { data: userChar } = await supabase
      .from("user_characters").select("affection_xp")
      .eq("user_id", user.id).eq("character_id", session.character_id).single();
    if (userChar) {
      const newXP = userChar.affection_xp + AFFECTION_PER_TURN;
      const { level } = getAffectionLevel(newXP);
      await supabase.from("user_characters")
        .update({ affection_xp: newXP, affection_level: level })
        .eq("user_id", user.id).eq("character_id", session.character_id);
    }

    // Update session: message count + running totals
    await supabase.from("chat_sessions").update({
      message_count: (session.message_count ?? 0) + 2,
      xp_earned: (session.xp_earned ?? 0) + xpEarned,
      affection_earned: (session.affection_earned ?? 0) + AFFECTION_PER_TURN,
    }).eq("id", sessionId);

    const turnNumber = Math.floor(((session.message_count ?? 0) + 2) / 2);

    return NextResponse.json({
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
    console.error("[Chat] Respond error:", error);
    return NextResponse.json({ error: "Failed to process response" }, { status: 500 });
  }
}
