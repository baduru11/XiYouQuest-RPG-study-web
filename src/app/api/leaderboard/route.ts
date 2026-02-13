import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { SupabaseClient } from "@supabase/supabase-js";
import { leaderboardQuerySchema } from "@/lib/validations";

interface RankingEntry {
  rank: number;
  id: string;
  display_name: string;
  avatar_url: string | null;
  current_level: number;
  value: number;
}

interface LeaderboardResponse {
  rankings: RankingEntry[];
  user_rank: { rank: number; value: number } | null;
}

const LEADERBOARD_LIMIT = 20;

async function getFriendIds(
  supabase: SupabaseClient,
  userId: string
): Promise<string[]> {
  const { data: friendships, error } = await supabase
    .from("friendships")
    .select("requester_id, addressee_id")
    .eq("status", "accepted")
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);

  if (error || !friendships) {
    return [userId];
  }

  const friendIds = friendships.map((f) =>
    f.requester_id === userId ? f.addressee_id : f.requester_id
  );

  // Include the current user in the friends list
  return [userId, ...friendIds];
}

async function getXpRankings(
  supabase: SupabaseClient,
  userId: string,
  scope: "global" | "friends",
  friendIds: string[]
): Promise<LeaderboardResponse> {
  let query = supabase
    .from("profiles")
    .select("id, display_name, avatar_url, current_level, total_xp")
    .order("total_xp", { ascending: false })
    .limit(LEADERBOARD_LIMIT);

  if (scope === "friends") {
    query = query.in("id", friendIds);
  }

  const { data, error } = await query;

  if (error || !data) {
    return { rankings: [], user_rank: null };
  }

  const rankings: RankingEntry[] = data.map((profile, index) => ({
    rank: index + 1,
    id: profile.id,
    display_name: profile.display_name ?? "Anonymous",
    avatar_url: profile.avatar_url,
    current_level: profile.current_level,
    value: profile.total_xp,
  }));

  // For global scope, calculate user rank if not in top 20
  let userRank: { rank: number; value: number } | null = null;

  if (scope === "global") {
    const userInRankings = rankings.find((r) => r.id === userId);
    if (userInRankings) {
      userRank = { rank: userInRankings.rank, value: userInRankings.value };
    } else {
      // User not in top 20 — count how many have higher XP
      const { data: userProfile } = await supabase
        .from("profiles")
        .select("total_xp")
        .eq("id", userId)
        .single();

      if (userProfile) {
        const { count } = await supabase
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .gt("total_xp", userProfile.total_xp);

        userRank = {
          rank: (count ?? 0) + 1,
          value: userProfile.total_xp,
        };
      }
    }
  }

  return { rankings, user_rank: userRank };
}

async function getAccuracyRankings(
  supabase: SupabaseClient,
  userId: string,
  scope: "global" | "friends",
  friendIds: string[]
): Promise<LeaderboardResponse> {
  // Fetch all user_progress rows (we need to aggregate per user)
  let query = supabase
    .from("user_progress")
    .select("user_id, questions_attempted, questions_correct");

  if (scope === "friends") {
    query = query.in("user_id", friendIds);
  }

  const { data: progressRows, error } = await query;

  if (error || !progressRows) {
    return { rankings: [], user_rank: null };
  }

  // Aggregate per user
  const userAggregates = new Map<
    string,
    { attempted: number; correct: number }
  >();

  for (const row of progressRows) {
    const existing = userAggregates.get(row.user_id) ?? {
      attempted: 0,
      correct: 0,
    };
    existing.attempted += row.questions_attempted;
    existing.correct += row.questions_correct;
    userAggregates.set(row.user_id, existing);
  }

  // Filter users with at least 1 attempt, calculate accuracy
  const userAccuracies: { user_id: string; accuracy: number }[] = [];
  for (const [user_id, agg] of userAggregates) {
    if (agg.attempted > 0) {
      const accuracy =
        Math.round((agg.correct / agg.attempted) * 100 * 10) / 10;
      userAccuracies.push({ user_id, accuracy });
    }
  }

  // Sort by accuracy descending
  userAccuracies.sort((a, b) => b.accuracy - a.accuracy);

  // Limit for global scope
  const limited =
    scope === "global"
      ? userAccuracies.slice(0, LEADERBOARD_LIMIT)
      : userAccuracies;

  if (limited.length === 0) {
    return { rankings: [], user_rank: null };
  }

  // Fetch profiles for the ranked users
  const rankedUserIds = limited.map((u) => u.user_id);
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url, current_level")
    .in("id", rankedUserIds);

  const profileMap = new Map(
    (profiles ?? []).map((p) => [p.id, p])
  );

  const rankings: RankingEntry[] = limited.map((entry, index) => {
    const profile = profileMap.get(entry.user_id);
    return {
      rank: index + 1,
      id: entry.user_id,
      display_name: profile?.display_name ?? "Anonymous",
      avatar_url: profile?.avatar_url ?? null,
      current_level: profile?.current_level ?? 0,
      value: entry.accuracy,
    };
  });

  // For global scope, calculate user rank if not in top 20
  let userRank: { rank: number; value: number } | null = null;

  if (scope === "global") {
    const userInRankings = rankings.find((r) => r.id === userId);
    if (userInRankings) {
      userRank = { rank: userInRankings.rank, value: userInRankings.value };
    } else {
      // Check if the user has accuracy data at all
      const userAccuracy = userAccuracies.find((u) => u.user_id === userId);
      if (userAccuracy) {
        // Count users with higher accuracy
        const higherCount = userAccuracies.filter(
          (u) => u.accuracy > userAccuracy.accuracy
        ).length;
        userRank = {
          rank: higherCount + 1,
          value: userAccuracy.accuracy,
        };
      }
    }
  }

  return { rankings, user_rank: userRank };
}

async function getStreakRankings(
  supabase: SupabaseClient,
  userId: string,
  scope: "global" | "friends",
  friendIds: string[]
): Promise<LeaderboardResponse> {
  let query = supabase
    .from("profiles")
    .select("id, display_name, avatar_url, current_level, login_streak")
    .order("login_streak", { ascending: false })
    .limit(LEADERBOARD_LIMIT);

  if (scope === "friends") {
    query = query.in("id", friendIds);
  }

  const { data, error } = await query;

  if (error || !data) {
    return { rankings: [], user_rank: null };
  }

  const rankings: RankingEntry[] = data.map((profile, index) => ({
    rank: index + 1,
    id: profile.id,
    display_name: profile.display_name ?? "Anonymous",
    avatar_url: profile.avatar_url,
    current_level: profile.current_level,
    value: profile.login_streak,
  }));

  // For global scope, calculate user rank if not in top 20
  let userRank: { rank: number; value: number } | null = null;

  if (scope === "global") {
    const userInRankings = rankings.find((r) => r.id === userId);
    if (userInRankings) {
      userRank = { rank: userInRankings.rank, value: userInRankings.value };
    } else {
      // User not in top 20 — count how many have higher streak
      const { data: userProfile } = await supabase
        .from("profiles")
        .select("login_streak")
        .eq("id", userId)
        .single();

      if (userProfile) {
        const { count } = await supabase
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .gt("login_streak", userProfile.login_streak);

        userRank = {
          rank: (count ?? 0) + 1,
          value: userProfile.login_streak,
        };
      }
    }
  }

  return { rankings, user_rank: userRank };
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Validate query params
  const tab = request.nextUrl.searchParams.get("tab");
  const scope = request.nextUrl.searchParams.get("scope");

  const parsed = leaderboardQuerySchema.safeParse({ tab, scope });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query parameters", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { tab: validTab, scope: validScope } = parsed.data;

  try {
    // For friends scope, fetch friend IDs first
    const friendIds =
      validScope === "friends"
        ? await getFriendIds(supabase, user.id)
        : [];

    let result: LeaderboardResponse;

    switch (validTab) {
      case "xp":
        result = await getXpRankings(supabase, user.id, validScope, friendIds);
        break;
      case "accuracy":
        result = await getAccuracyRankings(
          supabase,
          user.id,
          validScope,
          friendIds
        );
        break;
      case "streak":
        result = await getStreakRankings(
          supabase,
          user.id,
          validScope,
          friendIds
        );
        break;
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Leaderboard error:", error);
    return NextResponse.json(
      { error: "Failed to fetch leaderboard" },
      { status: 500 }
    );
  }
}
