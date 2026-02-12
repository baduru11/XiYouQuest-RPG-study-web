import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json(
      { error: "Friendship id is required" },
      { status: 400 }
    );
  }

  try {
    // Verify the user is a party to this friendship before deleting
    const { data: friendship, error: fetchError } = await supabase
      .from("friendships")
      .select("id, requester_id, addressee_id")
      .eq("id", id)
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
      .single();

    if (fetchError || !friendship) {
      return NextResponse.json(
        { error: "Friendship not found" },
        { status: 404 }
      );
    }

    const { error: deleteError } = await supabase
      .from("friendships")
      .delete()
      .eq("id", id);

    if (deleteError) {
      console.error("Remove error:", deleteError);
      return NextResponse.json(
        { error: "Failed to remove friendship" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Remove error:", error);
    return NextResponse.json(
      { error: "Failed to remove friendship" },
      { status: 500 }
    );
  }
}
