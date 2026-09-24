import { NextRequest, NextResponse } from "next/server";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { chatEndSchema } from "@/lib/validations";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limited = await enforceRateLimit(user.id, "write");
  if (limited) return limited;

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

    // The session's scene images live in a public bucket; remove them too so a
    // deleted chat leaves no publicly served content. Log and continue on
    // failure, as account deletion does.
    try {
      const folder = `${user.id}/${sessionId}`;
      const { data: images } = await supabase.storage.from("chat-images").list(folder);
      if (images && images.length > 0) {
        await supabase.storage
          .from("chat-images")
          .remove(images.map((image) => `${folder}/${image.name}`));
      }
    } catch (storageError) {
      console.error("[Chat] Delete: image cleanup failed:", storageError);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Chat] Delete error:", error);
    return NextResponse.json({ error: "Failed to delete session" }, { status: 500 });
  }
}
