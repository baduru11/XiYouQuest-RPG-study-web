import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Fetch incoming and outgoing pending requests in parallel
    const [incomingResult, outgoingResult] = await Promise.all([
      supabase
        .from("friendships")
        .select("id, requester_id, created_at")
        .eq("addressee_id", user.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false }),

      supabase
        .from("friendships")
        .select("id, addressee_id, created_at")
        .eq("requester_id", user.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false }),
    ]);

    if (incomingResult.error || outgoingResult.error) {
      console.error(
        "Requests fetch error:",
        incomingResult.error || outgoingResult.error
      );
      return NextResponse.json(
        { error: "Failed to fetch requests" },
        { status: 500 }
      );
    }

    const incoming = incomingResult.data ?? [];
    const outgoing = outgoingResult.data ?? [];

    // Collect all unique user IDs to batch-fetch profiles
    const userIds = new Set<string>();
    for (const r of incoming) {
      userIds.add(r.requester_id);
    }
    for (const r of outgoing) {
      userIds.add(r.addressee_id);
    }

    const userIdArray = Array.from(userIds);

    // Batch-fetch profiles
    let profileMap: Record<
      string,
      {
        id: string;
        display_name: string | null;
        avatar_url: string | null;
        current_level: number;
      }
    > = {};

    if (userIdArray.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url, current_level")
        .in("id", userIdArray);

      if (profiles) {
        profileMap = Object.fromEntries(profiles.map((p) => [p.id, p]));
      }
    }

    return NextResponse.json({
      incoming: incoming.map((r) => ({
        friendship_id: r.id,
        created_at: r.created_at,
        user: profileMap[r.requester_id] ?? null,
      })),
      outgoing: outgoing.map((r) => ({
        friendship_id: r.id,
        created_at: r.created_at,
        user: profileMap[r.addressee_id] ?? null,
      })),
    });
  } catch (error) {
    console.error("Requests error:", error);
    return NextResponse.json(
      { error: "Failed to fetch requests" },
      { status: 500 }
    );
  }
}
