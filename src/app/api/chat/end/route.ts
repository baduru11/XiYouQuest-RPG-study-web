import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { chatEndSchema } from "@/lib/validations";
import { checkAndUnlockAchievements } from "@/lib/achievements/check";
import { XP_VALUES } from "@/types/gamification";

/** Get today's date in Hong Kong time (YYYY-MM-DD) */
function getHKTDate(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Hong_Kong" });
}

const MIN_EXCHANGES_FOR_STREAK = 5;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = chatEndSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const { sessionId } = parsed.data;

    // Fetch session + verify ownership
    const { data: session } = await supabase
      .from("chat_sessions")
      .select("*")
      .eq("id", sessionId)
      .eq("user_id", user.id)
      .single();

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // Allow re-ending: if already ended, return existing summary (idempotent)
    if (session.ended_at) {
      const { data: images } = await supabase
        .from("chat_messages")
        .select("image_url")
        .eq("session_id", sessionId)
        .not("image_url", "is", null);

      return NextResponse.json({
        summary: {
          messageCount: session.message_count,
          avgScore: session.avg_score ?? 0,
          xpEarned: session.xp_earned,
          affectionEarned: session.affection_earned,
          images: (images ?? []).map((i) => i.image_url).filter(Boolean),
        },
        newAchievements: [],
      });
    }

    // Calculate avg score from messages
    const { data: userMessages } = await supabase
      .from("chat_messages")
      .select("pronunciation_score, tone_score, fluency_score")
      .eq("session_id", sessionId)
      .eq("role", "user")
      .not("pronunciation_score", "is", null);

    const scoredMessages = userMessages ?? [];
    const messageCount = session.message_count;
    const userTurnCount = Math.floor(messageCount / 2);

    let avgScore = 0;
    if (scoredMessages.length > 0) {
      const totalScore = scoredMessages.reduce((sum, m) => {
        const s = ((m.pronunciation_score ?? 0) + (m.tone_score ?? 0) + (m.fluency_score ?? 0)) / 3;
        return sum + s;
      }, 0);
      avgScore = Math.round(totalScore / scoredMessages.length);
    }

    // XP + affection already awarded per turn — just snapshot final values
    await supabase
      .from("chat_sessions")
      .update({
        ended_at: new Date().toISOString(),
        avg_score: avgScore,
      })
      .eq("id", sessionId);

    // Update streak (XP already awarded per turn, pass 0)
    const todayHKT = getHKTDate();
    if (userTurnCount >= MIN_EXCHANGES_FOR_STREAK) {
      await supabase.rpc("update_profile_with_streak", {
        p_user_id: user.id,
        p_today: todayHKT,
        p_xp_to_add: 0,
        p_daily_bonus_base: XP_VALUES.daily_login,
      });
    }

    // Check achievements
    let newAchievements: unknown[] = [];
    try {
      const { data: charData } = await supabase
        .from("characters")
        .select("name")
        .eq("id", session.character_id)
        .single();

      if (charData) {
        newAchievements = await checkAndUnlockAchievements(supabase, user.id, {
          type: "chat_complete",
          characterName: charData.name,
        });
      }
    } catch (err) {
      console.error("[Chat] Achievement check error:", err);
    }

    // Fetch generated images for summary
    const { data: images } = await supabase
      .from("chat_messages")
      .select("image_url")
      .eq("session_id", sessionId)
      .not("image_url", "is", null);

    return NextResponse.json({
      summary: {
        messageCount,
        avgScore,
        xpEarned: session.xp_earned,
        affectionEarned: session.affection_earned,
        images: (images ?? []).map((i) => i.image_url).filter(Boolean),
      },
      newAchievements,
    });
  } catch (error) {
    console.error("[Chat] End error:", error);
    return NextResponse.json({ error: "Failed to end session" }, { status: 500 });
  }
}
