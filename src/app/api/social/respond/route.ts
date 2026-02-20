import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { friendRespondSchema } from "@/lib/validations";
import { checkAndUnlockAchievements } from "@/lib/achievements/check";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = friendRespondSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input: friendship_id must be a UUID, action must be 'accept' or 'reject'" },
        { status: 400 }
      );
    }
    const { friendship_id, action } = parsed.data;

    // Fetch the friendship — only the addressee can respond to a pending request
    const { data: friendship, error: fetchError } = await supabase
      .from("friendships")
      .select("*")
      .eq("id", friendship_id)
      .eq("addressee_id", user.id)
      .eq("status", "pending")
      .single();

    if (fetchError || !friendship) {
      return NextResponse.json(
        { error: "Pending friend request not found" },
        { status: 404 }
      );
    }

    // Update the friendship status
    const { data: updated, error: updateError } = await supabase
      .from("friendships")
      .update({
        status: action === "accept" ? "accepted" : "rejected",
        updated_at: new Date().toISOString(),
      })
      .eq("id", friendship_id)
      .select()
      .single();

    if (updateError) {
      console.error("Respond error:", updateError);
      return NextResponse.json(
        { error: "Failed to respond to friend request" },
        { status: 500 }
      );
    }

    // Check and unlock achievement for the acceptor (current user).
    // The requester's achievement is awarded on their next relevant action,
    // since RLS prevents cross-user INSERT on user_achievements.
    let newAchievements: unknown[] = [];
    if (action === "accept") {
      try {
        newAchievements = await checkAndUnlockAchievements(supabase, user.id, { type: 'friend_added' });
      } catch (err) {
        console.error("Friend achievement check error:", err);
        newAchievements = [];
      }
    }

    return NextResponse.json({ ...updated, newAchievements });
  } catch (error) {
    console.error("Respond error:", error);
    return NextResponse.json(
      { error: "Failed to respond to friend request" },
      { status: 500 }
    );
  }
}
