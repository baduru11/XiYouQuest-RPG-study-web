import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { SupabaseClient } from "@supabase/supabase-js";

interface UserStats {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  current_level: number;
  total_xp: number;
  login_streak: number;
  total_sessions: number;
  avg_scores: Record<number, number | null>;
  selected_character: {
    name: string;
    image_url: string;
  } | null;
  achievement_count: number;
}

async function getUserStats(
  supabase: SupabaseClient,
  userId: string
): Promise<UserStats | null> {
  // Fetch profile, practice sessions, and selected character in parallel
  const [profileResult, sessionsResult, selectedCharResult, achievementCountResult] = await Promise.all(
    [
      supabase
        .from("profiles")
        .select(
          "id, display_name, avatar_url, current_level, total_xp, login_streak"
        )
        .eq("id", userId)
        .single(),

      supabase
        .from("practice_sessions")
        .select("component, score")
        .eq("user_id", userId),

      supabase
        .from("user_characters")
        .select("character_id, characters(name, image_url)")
        .eq("user_id", userId)
        .eq("is_selected", true)
        .single(),

      supabase
        .from("user_achievements")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId),
    ]
  );

  if (profileResult.error || !profileResult.data) {
    return null;
  }

  const profile = profileResult.data;
  const sessions = sessionsResult.data ?? [];

  // Calculate total sessions and avg scores per component
  const totalSessions = sessions.length;
  const avgScores: Record<number, number | null> = {};
  for (let c = 1; c <= 5; c++) {
    const componentSessions = sessions.filter(
      (s: { component: number; score: number }) => s.component === c
    );
    if (componentSessions.length > 0) {
      const sum = componentSessions.reduce(
        (acc: number, s: { score: number }) => acc + s.score,
        0
      );
      avgScores[c] = Math.round(sum / componentSessions.length);
    } else {
      avgScores[c] = null;
    }
  }

  // Extract selected character info
  let selectedCharacter: { name: string; image_url: string } | null = null;
  if (selectedCharResult.data) {
    const charData = selectedCharResult.data as unknown as {
      character_id: string;
      characters: { name: string; image_url: string } | null;
    };
    if (charData.characters) {
      selectedCharacter = {
        name: charData.characters.name,
        image_url: charData.characters.image_url,
      };
    }
  }

  return {
    id: profile.id,
    display_name: profile.display_name,
    avatar_url: profile.avatar_url,
    current_level: profile.current_level,
    total_xp: profile.total_xp,
    login_streak: profile.login_streak,
    total_sessions: totalSessions,
    avg_scores: avgScores,
    selected_character: selectedCharacter,
    achievement_count: achievementCountResult.count ?? 0,
  };
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Get accepted friendships
    const { data: friendships, error } = await supabase
      .from("friendships")
      .select("id, requester_id, addressee_id")
      .eq("status", "accepted")
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);

    if (error) {
      console.error("Friends fetch error:", error);
      return NextResponse.json(
        { error: "Failed to fetch friends" },
        { status: 500 }
      );
    }

    // Collect friend IDs
    const friendIds = (friendships ?? []).map((f) =>
      f.requester_id === user.id ? f.addressee_id : f.requester_id
    );

    // Fetch stats for all friends and self in parallel
    const [selfStats, ...friendStats] = await Promise.all([
      getUserStats(supabase, user.id),
      ...friendIds.map((id) => getUserStats(supabase, id)),
    ]);

    // Build friendship map for IDs
    const friendshipMap: Record<string, string> = {};
    for (const f of friendships ?? []) {
      const friendId =
        f.requester_id === user.id ? f.addressee_id : f.requester_id;
      friendshipMap[friendId] = f.id;
    }

    const friends = friendStats
      .filter((s): s is UserStats => s !== null)
      .map((s) => ({
        ...s,
        friendship_id: friendshipMap[s.id],
      }));

    return NextResponse.json({
      self: selfStats,
      friends,
    });
  } catch (error) {
    console.error("Friends error:", error);
    return NextResponse.json(
      { error: "Failed to fetch friends" },
      { status: 500 }
    );
  }
}
