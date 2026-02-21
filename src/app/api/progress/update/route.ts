import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserLevel, getAffectionLevel } from "@/lib/gamification/xp";
import { XP_VALUES } from "@/types/gamification";
import { progressUpdateSchema } from "@/lib/validations";
import { MAX_XP_PER_SESSION } from "@/lib/constants";
import { checkAndUnlockAchievements } from "@/lib/achievements/check";

/** Get today's date in Hong Kong time (YYYY-MM-DD) */
function getHKTDate(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Hong_Kong" });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = progressUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
    const {
      characterId,
      component,
      score,
      xpEarned,
      durationSeconds,
      questionsAttempted,
      questionsCorrect,
      bestStreak,
    } = parsed.data;

    // Server-side XP bounds validation — cap per-question (max 20 XP each: 10 base * 2.0x streak)
    const perQuestionCap = questionsAttempted > 0 ? questionsAttempted * 20 : MAX_XP_PER_SESSION;
    const clampedXpEarned = Math.max(0, Math.min(Math.floor(xpEarned), perQuestionCap, MAX_XP_PER_SESSION));

    // Anti-replay: reject duplicate submissions from same user+component within 10 seconds
    const { data: recentSession } = await supabase
      .from("practice_sessions")
      .select("id")
      .eq("user_id", user.id)
      .eq("component", component)
      .gte("created_at", new Date(Date.now() - 10_000).toISOString())
      .limit(1)
      .single();

    if (recentSession) {
      return NextResponse.json({ error: "Duplicate submission" }, { status: 429 });
    }

    // 1. Insert practice session
    const { error: sessionError } = await supabase
      .from("practice_sessions")
      .insert({
        user_id: user.id,
        character_id: characterId,
        component,
        score,
        xp_earned: clampedXpEarned,
        duration_seconds: durationSeconds ?? 0,
      });

    if (sessionError) {
      console.error("Session insert error:", sessionError);
      return NextResponse.json({ error: "Failed to save session" }, { status: 500 });
    }

    // 2. Atomic upsert user_progress — prevents race conditions from concurrent requests
    const { error: progressError } = await supabase.rpc("upsert_user_progress", {
      p_user_id: user.id,
      p_component: component,
      p_questions_attempted: questionsAttempted,
      p_questions_correct: questionsCorrect,
      p_best_streak: bestStreak,
      p_duration_seconds: durationSeconds,
    });

    if (progressError) {
      console.error("Progress upsert error:", progressError);
    }

    // 3. Atomic streak + XP update via RPC (HKT timezone, race-condition safe)
    const todayHKT = getHKTDate();
    const { data: streakResult, error: streakError } = await supabase.rpc("update_profile_with_streak", {
      p_user_id: user.id,
      p_today: todayHKT,
      p_xp_to_add: clampedXpEarned,
      p_daily_bonus_base: XP_VALUES.daily_login,
    });

    if (streakError) {
      console.error("Streak update error:", streakError);
      return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
    }

    const newTotalXP = streakResult[0]?.new_total_xp ?? 0;
    const dailyBonus = streakResult[0]?.daily_bonus_awarded ?? 0;

    // 4. Recalculate user level from new total_xp
    const levelInfo = getUserLevel(newTotalXP);

    const { error: levelError } = await supabase
      .from("profiles")
      .update({ current_level: levelInfo.level })
      .eq("id", user.id);

    if (levelError) {
      console.error("Level update error:", levelError);
    }

    // 6. Add xpEarned to user_characters.affection_xp
    const { data: userCharacter } = await supabase
      .from("user_characters")
      .select("affection_xp, affection_level")
      .eq("user_id", user.id)
      .eq("character_id", characterId)
      .single();

    let affectionXP = 0;
    let affectionLevel = 1;

    if (userCharacter) {
      affectionXP = userCharacter.affection_xp + clampedXpEarned;

      // 7. Recalculate affection level
      const affectionInfo = getAffectionLevel(affectionXP);
      affectionLevel = affectionInfo.level;

      const { error: characterError } = await supabase
        .from("user_characters")
        .update({
          affection_xp: affectionXP,
          affection_level: affectionLevel,
        })
        .eq("user_id", user.id)
        .eq("character_id", characterId);

      if (characterError) {
        console.error("Character affection update error:", characterError);
      }
    }

    // 9. Check and unlock achievements
    let newAchievements: unknown[] = [];
    try {
      const { data: charData } = await supabase
        .from('characters')
        .select('name')
        .eq('id', characterId)
        .single();

      if (charData) {
        newAchievements = await checkAndUnlockAchievements(supabase, user.id, {
          type: 'session_complete',
          characterName: charData.name,
        });
      }
    } catch (err) {
      console.error("Session achievement check error:", err);
      newAchievements = [];
    }

    // 10. Return results
    return NextResponse.json({
      totalXP: newTotalXP,
      level: levelInfo.level,
      affectionXP,
      affectionLevel,
      dailyBonus,
      newAchievements,
    });
  } catch (error) {
    console.error("Progress update error:", error);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}
