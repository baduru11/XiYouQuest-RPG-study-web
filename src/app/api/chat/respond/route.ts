import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { transcribeAudio } from "@/lib/iflytek-speech/asr-client";
import { assessPronunciation } from "@/lib/iflytek-speech/client";
import { chatConversation, type ChatTurnMessage } from "@/lib/gemini/client";
import { isValidUUID } from "@/lib/validations";

const MAX_MESSAGES_PER_SESSION = 40; // 20 exchanges = 40 messages (user + companion)

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

    if (!sessionId || !isValidUUID(sessionId) || !audio) {
      return NextResponse.json({ error: "Missing sessionId or audio" }, { status: 400 });
    }

    // Validate file size (10MB max for chat messages)
    if (audio.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "Audio too large (max 10MB)" }, { status: 400 });
    }

    // Verify session belongs to user and is still open
    const { data: session } = await supabase
      .from("chat_sessions")
      .select("id, character_id, scenario_id, message_count, ended_at")
      .eq("id", sessionId)
      .eq("user_id", user.id)
      .single();

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    if (session.ended_at) {
      return NextResponse.json({ error: "Session already ended" }, { status: 400 });
    }
    if (session.message_count >= MAX_MESSAGES_PER_SESSION) {
      return NextResponse.json({ error: "Maximum messages reached" }, { status: 400 });
    }

    // Fetch character + scenario for LLM context
    const [{ data: character }, { data: scenario }] = await Promise.all([
      supabase.from("characters").select("name, personality_prompt, voice_id").eq("id", session.character_id).single(),
      supabase.from("chat_scenarios").select("system_prompt, title").eq("id", session.scenario_id).single(),
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

    // Step 3: Save user message
    await supabase.from("chat_messages").insert({
      session_id: sessionId,
      role: "user",
      content: transcript,
      transcript,
      pronunciation_score: pronunciationScore,
      tone_score: toneScore,
      fluency_score: fluencyScore,
    });

    // Step 4: Build conversation history for LLM
    const { data: history } = await supabase
      .from("chat_messages")
      .select("role, content")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });

    const systemPrompt = `You ARE ${character.name}. Stay fully in character at all times.

${character.personality_prompt}

SCENE: ${scenario.system_prompt}

RULES:
- Respond in Mandarin Chinese (简体中文) only
- Keep responses 1-3 sentences, natural conversational length
- Stay in the Journey to the West scenario context
- Be engaging — ask follow-up questions to keep conversation going
- Adjust difficulty to match user's apparent Mandarin level
- The user's latest pronunciation score was ${overallScore}/100${overallScore < 70 ? ". Gently encourage them." : ""}
- Use vocabulary appropriate for PSC intermediate level`;

    const messages: ChatTurnMessage[] = [
      { role: "system", content: systemPrompt },
      ...(history ?? []).map((msg) => ({
        role: (msg.role === "companion" ? "assistant" : "user") as "assistant" | "user",
        content: msg.content,
      })),
    ];

    // Step 5: Generate companion reply
    console.log("[Chat] Step 3: Generating companion reply...");
    const companionReply = await chatConversation(messages);

    // Step 6: Save companion message
    await supabase.from("chat_messages").insert({
      session_id: sessionId,
      role: "companion",
      content: companionReply,
    });

    // Update message count
    await supabase
      .from("chat_sessions")
      .update({ message_count: (session.message_count ?? 0) + 2 })
      .eq("id", sessionId);

    // Calculate XP for this turn
    let xpEarned = 2; // attempted
    if (overallScore >= 90) xpEarned = 10; // perfect
    else if (overallScore >= 60) xpEarned = 5; // good

    const turnNumber = Math.floor(((session.message_count ?? 0) + 2) / 2);

    return NextResponse.json({
      userTranscript: transcript,
      scores: {
        pronunciation: pronunciationScore,
        tone: toneScore,
        fluency: fluencyScore,
        overall: overallScore,
      },
      companionReply,
      xpEarned,
      turnNumber,
    });
  } catch (error) {
    console.error("[Chat] Respond error:", error);
    return NextResponse.json({ error: "Failed to process response" }, { status: 500 });
  }
}
