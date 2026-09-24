import { NextRequest, NextResponse } from "next/server";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getUserLevel, getAffectionLevel } from "@/lib/gamification/xp";
import { XP_VALUES } from "@/types/gamification";
import { progressUpdateSchema } from "@/lib/validations";
import { MAX_XP_PER_SESSION, MAX_XP_NO_QUESTIONS } from "@/lib/constants";
import { checkAndUnlockAchievements } from "@/lib/achievements/check";

/** Get today's date in Hong Kong time (YYYY-MM-DD) */
function getHKTDate(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Hong_Kong" });
}

async function checkSessionAchievements(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  characterId: string,
): Promise<unknown[]> {
  try {
    const { data: charData } = await supabase
      .from("characters")
      .select("name")
      .eq("id", characterId)
      .single();

    if (!charData) {
      return [];
    }

    return await checkAndUnlockAchievements(supabase, userId, {
      type: "session_complete",
      characterName: charData.name,
    });
  } catch (err) {
    console.error("Session achievement check error:", err);
    return [];
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limited = await enforceRateLimit(user.id, "write");
  if (limited) return limited;

  try {
    const body = await request.json();
    const parsed = progressUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
    const {
      characterId,
      attemptId,
      component,
      score,
      xpEarned,
      durationSeconds,
      questionsAttempted,
      questionsCorrect,
      bestStreak,
    } = parsed.data;

    // Server-side XP bounds validation — cap per-question (max 20 XP each: 10 base * 2.0x streak)
    // When no questions attempted (e.g. C5 speaking), cap at a small session bonus
    const perQuestionCap = questionsAttempted > 0 ? questionsAttempted * 20 : MAX_XP_NO_QUESTIONS;
    const clampedXpEarned = Math.max(0, Math.min(Math.floor(xpEarned), perQuestionCap, MAX_XP_PER_SESSION));

    if (attemptId) {
      const { data: atomicResult, error: atomicError } = await supabase.rpc("record_practice_progress", {
        p_user_id: user.id,
        p_character_id: characterId,
        p_client_attempt_id: attemptId,
        p_component: component,
        p_score: score,
        p_xp_earned: clampedXpEarned,
        p_duration_seconds: durationSeconds,
        p_questions_attempted: questionsAttempted,
        p_questions_correct: questionsCorrect,
        p_best_streak: bestStreak,
        p_today: getHKTDate(),
        p_daily_bonus_base: XP_VALUES.daily_login,
      });

      const result = Array.isArray(atomicResult) ? atomicResult[0] : null;
      if (atomicError || !result) {
        console.error("Atomic progress record error:", atomicError);
        return NextResponse.json({ error: "Failed to record practice attempt" }, { status: 500 });
      }

      if (result.already_recorded) {
        return NextResponse.json({ alreadyRecorded: true, newAchievements: [] });
      }

      if (
        typeof result.new_total_xp !== "number"
        || typeof result.new_level !== "number"
        || typeof result.new_affection_xp !== "number"
        || typeof result.new_affection_level !== "number"
        || typeof result.daily_bonus_awarded !== "number"
      ) {
        console.error("Atomic progress record returned an invalid result");
        return NextResponse.json({ error: "Failed to record practice attempt" }, { status: 500 });
      }

      const newAchievements = await checkSessionAchievements(supabase, user.id, characterId);
      return NextResponse.json({
        totalXP: result.new_total_xp,
        level: result.new_level,
        affectionXP: result.new_affection_xp,
        affectionLevel: result.new_affection_level,
        dailyBonus: result.daily_bonus_awarded,
        newAchievements,
      });
    }

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
        client_attempt_id: null,
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
    const newAchievements = await checkSessionAchievements(supabase, user.id, characterId);

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
