import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
    const { friendship_id, action } = body as {
      friendship_id: string;
      action: "accept" | "reject";
    };

    if (!friendship_id || !action) {
      return NextResponse.json(
        { error: "friendship_id and action are required" },
        { status: 400 }
      );
    }

    if (action !== "accept" && action !== "reject") {
      return NextResponse.json(
        { error: "action must be 'accept' or 'reject'" },
        { status: 400 }
      );
    }

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
