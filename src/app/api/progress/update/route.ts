import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserLevel, getAffectionLevel } from "@/lib/gamification/xp";
import { XP_VALUES } from "@/types/gamification";
import { progressUpdateSchema } from "@/lib/validations";
import { MAX_XP_PER_SESSION } from "@/lib/constants";

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

    // Server-side XP bounds validation
    const clampedXpEarned = Math.max(0, Math.min(Math.floor(xpEarned), MAX_XP_PER_SESSION));

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

    // 3. Get current profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("total_xp, current_level, last_login_date, login_streak")
      .eq("id", user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    // 4. Add XP to profile.total_xp
    let totalXpToAdd = clampedXpEarned;

    // 8. Check and update daily login streak
    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    const lastLogin = profile.last_login_date;
    let dailyBonus = 0;
    let newLoginStreak = profile.login_streak;

    if (lastLogin !== today) {
      // Calculate if last login was yesterday
      if (lastLogin) {
        const lastDate = new Date(lastLogin);
        const todayDate = new Date(today);
        const diffTime = todayDate.getTime() - lastDate.getTime();
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays === 1) {
          // Yesterday - increment streak
          newLoginStreak = profile.login_streak + 1;
        } else {
          // More than 1 day gap - reset streak
          newLoginStreak = 1;
        }
      } else {
        // First ever login
        newLoginStreak = 1;
      }

      // Award daily login XP bonus
      dailyBonus = XP_VALUES.daily_login;
      totalXpToAdd += dailyBonus;
    }
    // If lastLogin === today, no change to streak, no daily bonus

    const newTotalXP = profile.total_xp + totalXpToAdd;

    // 5. Recalculate user level from new total_xp
    const levelInfo = getUserLevel(newTotalXP);

    // Update profile with new XP, level, and login info
    const profileUpdate: Record<string, unknown> = {
      total_xp: newTotalXP,
      current_level: levelInfo.level,
    };

    if (lastLogin !== today) {
      profileUpdate.last_login_date = today;
      profileUpdate.login_streak = newLoginStreak;
    }

    const { error: profileError } = await supabase
      .from("profiles")
      .update(profileUpdate)
      .eq("id", user.id);

    if (profileError) {
      console.error("Profile update error:", profileError);
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

    // 9. Return results
    return NextResponse.json({
      totalXP: newTotalXP,
      level: levelInfo.level,
      affectionXP,
      affectionLevel,
      dailyBonus,
    });
  } catch (error) {
    console.error("Progress update error:", error);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}
