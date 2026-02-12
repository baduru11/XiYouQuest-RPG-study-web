import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isValidUUID } from "@/lib/validations";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const q = request.nextUrl.searchParams.get("q");
  if (!q || q.trim().length < 2) {
    return NextResponse.json(
      { error: "Query must be at least 2 characters" },
      { status: 400 }
    );
  }

  try {
    // Get IDs of users who have any existing friendship with the current user
    const { data: existingFriendships } = await supabase
      .from("friendships")
      .select("requester_id, addressee_id")
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);

    const excludeIds = new Set<string>([user.id]);
    if (existingFriendships) {
      for (const f of existingFriendships) {
        excludeIds.add(f.requester_id);
        excludeIds.add(f.addressee_id);
      }
    }

    // Validate all exclude IDs are proper UUIDs to prevent injection
    const excludeArray = Array.from(excludeIds).filter(isValidUUID);

    // Search profiles by display_name using ILIKE, excluding self and existing friendships
    let query = supabase
      .from("profiles")
      .select("id, display_name, avatar_url, current_level, friend_code")
      .ilike("display_name", `%${q.trim().replace(/[%_\\]/g, "\\$&")}%`)
      .limit(10);

    if (excludeArray.length > 0) {
      query = query.not("id", "in", `(${excludeArray.join(",")})`);
    }

    const { data: profiles, error } = await query;

    if (error) {
      console.error("Search error:", error);
      return NextResponse.json(
        { error: "Search failed" },
        { status: 500 }
      );
    }

    return NextResponse.json(profiles ?? []);
  } catch (error) {
    console.error("Search error:", error);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
