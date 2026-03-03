import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { chatEndSchema } from "@/lib/validations";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    // Reuse chatEndSchema since it's the same shape (just { sessionId })
    const parsed = chatEndSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const { sessionId } = parsed.data;

    // Verify session belongs to user
    const { data: session } = await supabase
      .from("chat_sessions")
      .select("id")
      .eq("id", sessionId)
      .eq("user_id", user.id)
      .single();

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // Delete messages first (FK constraint), then session
    await supabase
      .from("chat_messages")
      .delete()
      .eq("session_id", sessionId);

    await supabase
      .from("chat_sessions")
      .delete()
      .eq("id", sessionId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Chat] Delete error:", error);
    return NextResponse.json({ error: "Failed to delete session" }, { status: 500 });
  }
}
