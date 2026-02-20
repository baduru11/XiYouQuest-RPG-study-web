import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Get accepted friend IDs
    const { data: friendships } = await supabase
      .from("friendships")
      .select("requester_id, addressee_id")
      .eq("status", "accepted")
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);

    const userIds = [user.id];
    for (const f of friendships ?? []) {
      userIds.push(f.requester_id === user.id ? f.addressee_id : f.requester_id);
    }

    // Fetch recent achievements for all relevant users
    const { data: feed, error } = await supabase
      .from("user_achievements")
      .select(`
        unlocked_at,
        user_id,
        achievements!inner(key, name, emoji, tier),
        profiles!user_id(display_name, avatar_url)
      `)
      .in("user_id", userIds)
      .order("unlocked_at", { ascending: false })
      .limit(20);

    if (error) {
      console.error("Achievement feed query error:", error);
      return NextResponse.json({ error: "Failed to fetch feed" }, { status: 500 });
    }

    const entries = (feed ?? []).map((entry: Record<string, unknown>) => {
      const achievements = entry.achievements as { key: string; name: string; emoji: string; tier: string } | null;
      const profiles = entry.profiles as { display_name: string | null; avatar_url: string | null } | null;
      return {
        unlocked_at: entry.unlocked_at,
        user_id: entry.user_id,
        display_name: profiles?.display_name ?? "Unknown",
        avatar_url: profiles?.avatar_url ?? null,
        achievement_key: achievements?.key,
        achievement_name: achievements?.name,
        achievement_emoji: achievements?.emoji,
        achievement_tier: achievements?.tier,
        is_self: entry.user_id === user.id,
      };
    });

    return NextResponse.json({ feed: entries });
  } catch (err) {
    console.error("Achievement feed error:", err);
    return NextResponse.json({ error: "Failed to fetch feed" }, { status: 500 });
  }
}
