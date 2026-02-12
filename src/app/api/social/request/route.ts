import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { friendRequestSchema } from "@/lib/validations";

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
    const parsed = friendRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input: addressee_id must be a valid UUID" },
        { status: 400 }
      );
    }
    const { addressee_id } = parsed.data;

    // Cannot send friend request to self
    if (addressee_id === user.id) {
      return NextResponse.json(
        { error: "Cannot send friend request to yourself" },
        { status: 400 }
      );
    }

    // Check for existing friendship in either direction
    const { data: existing } = await supabase
      .from("friendships")
      .select("id")
      .or(
        `and(requester_id.eq.${user.id},addressee_id.eq.${addressee_id}),and(requester_id.eq.${addressee_id},addressee_id.eq.${user.id})`
      )
      .limit(1);

    if (existing && existing.length > 0) {
      return NextResponse.json(
        { error: "Friendship already exists" },
        { status: 409 }
      );
    }

    // Create pending friendship
    const { data: friendship, error } = await supabase
      .from("friendships")
      .insert({
        requester_id: user.id,
        addressee_id,
        status: "pending",
      })
      .select()
      .single();

    if (error) {
      console.error("Friend request error:", error);
      return NextResponse.json(
        { error: "Failed to send friend request" },
        { status: 500 }
      );
    }

    return NextResponse.json(friendship, { status: 201 });
  } catch (error) {
    console.error("Friend request error:", error);
    return NextResponse.json(
      { error: "Failed to send friend request" },
      { status: 500 }
    );
  }
}
