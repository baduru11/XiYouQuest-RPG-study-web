import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json([]);
  }

  try {
    // Get the session to access provider_token
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.provider_token) {
      return NextResponse.json([]);
    }

    // Fetch Discord friends
    const discordResponse = await fetch(
      "https://discord.com/api/v10/users/@me/relationships",
      {
        headers: {
          Authorization: `Bearer ${session.provider_token}`,
        },
      }
    );

    if (!discordResponse.ok) {
      return NextResponse.json([]);
    }

    const relationships = (await discordResponse.json()) as Array<{
      id: string;
      type: number;
      user: { id: string; username: string; avatar: string | null };
    }>;

    // Filter for type 1 (friends only)
    const discordFriendIds = relationships
      .filter((r) => r.type === 1)
      .map((r) => r.user.id);

    if (discordFriendIds.length === 0) {
      return NextResponse.json([]);
    }

    // Find profiles that match these Discord IDs
    const { data: matchedProfiles } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url, current_level, friend_code")
      .in("discord_id", discordFriendIds)
      .neq("id", user.id);

    if (!matchedProfiles || matchedProfiles.length === 0) {
      return NextResponse.json([]);
    }

    // Exclude users who already have a friendship with the current user
    const matchedIds = matchedProfiles.map((p) => p.id);
    const { data: existingFriendships } = await supabase
      .from("friendships")
      .select("requester_id, addressee_id")
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);

    const existingFriendIds = new Set<string>();
    if (existingFriendships) {
      for (const f of existingFriendships) {
        existingFriendIds.add(f.requester_id);
        existingFriendIds.add(f.addressee_id);
      }
    }

    const suggestions = matchedProfiles.filter(
      (p) => matchedIds.includes(p.id) && !existingFriendIds.has(p.id)
    );

    return NextResponse.json(suggestions);
  } catch {
    // Return empty array on ANY failure (silent)
    return NextResponse.json([]);
  }
}
