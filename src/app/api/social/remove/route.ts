import { NextRequest, NextResponse } from "next/server";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { isValidUUID } from "@/lib/validations";

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limited = await enforceRateLimit(user.id, "social-write");
  if (limited) return limited;

  const id = request.nextUrl.searchParams.get("id");
  if (!id || !isValidUUID(id)) {
    return NextResponse.json(
      { error: "A valid friendship id is required" },
      { status: 400 }
    );
  }

  try {
    // Atomically verify ownership and delete in one query to prevent TOCTOU
    const { error: deleteError, count } = await supabase
      .from("friendships")
      .delete({ count: "exact" })
      .eq("id", id)
      // The addressee may remove any row. The requester may remove an accepted
      // friendship or withdraw a pending request, but not a rejected one: that
      // row is what stops the same request from being sent again.
      .or(
        `and(requester_id.eq.${user.id},status.neq.rejected),addressee_id.eq.${user.id}`,
      );

    if (deleteError || count === 0) {
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
