import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { friendRespondSchema } from "@/lib/validations";

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

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Respond error:", error);
    return NextResponse.json(
      { error: "Failed to respond to friend request" },
      { status: 500 }
    );
  }
}
