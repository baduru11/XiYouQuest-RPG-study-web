import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isValidUUID } from "@/lib/validations";

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = request.nextUrl.searchParams.get("id");
  if (!id || !isValidUUID(id)) {
    return NextResponse.json(
      { error: "A valid friendship id is required" },
      { status: 400 }
    );
  }

  try {
    // Atomically verify ownership and delete in one query to prevent TOCTOU
    const { data: deleted, error: deleteError } = await supabase
      .from("friendships")
      .delete()
      .eq("id", id)
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
      .select("id")
      .single();

    if (deleteError || !deleted) {
      return NextResponse.json(
        { error: "Friendship not found" },
        { status: 404 }
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
