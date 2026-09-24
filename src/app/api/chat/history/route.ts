import { NextRequest, NextResponse } from "next/server";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { chatHistoryQuerySchema, isValidUUID } from "@/lib/validations";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("sessionId");

  // If sessionId provided, return full messages for that session
  if (sessionId) {
    if (!isValidUUID(sessionId)) {
      return NextResponse.json({ error: "Invalid sessionId" }, { status: 400 });
    }

    // Verify session ownership BEFORE fetching its messages. The server
    // client runs with the service role (RLS does not apply), so gating the
    // message fetch on a confirmed-owned session is the authorization check:
    // another user's session id returns 404 and the message query is never
    // issued for it.
    const { data: session } = await supabase
      .from("chat_sessions")
      .select("*, characters(name, voice_id, image_url), chat_scenarios(title, category)")
      .eq("id", sessionId)
      .eq("user_id", user.id)
      .single();

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const { data: messages } = await supabase
      .from("chat_messages")
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });

    return NextResponse.json({ session, messages: messages ?? [] });
  }

  // Otherwise, return session list (including active sessions)
  const paging = chatHistoryQuerySchema.safeParse({
    limit: searchParams.get("limit") ?? undefined,
    offset: searchParams.get("offset") ?? undefined,
  });
  if (!paging.success) {
    return NextResponse.json({ error: "Invalid paging parameters" }, { status: 400 });
  }
  const { limit, offset } = paging.data;

  const { data: sessions, error, count } = await supabase
    .from("chat_sessions")
    .select("*, characters(name, voice_id, image_url), chat_scenarios(title, category)", { count: "exact" })
    .eq("user_id", user.id)
    .order("ended_at", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("[Chat] History fetch error:", error);
    return NextResponse.json({ error: "Failed to load history" }, { status: 500 });
  }

  return NextResponse.json({ sessions: sessions ?? [], total: count ?? 0 });
}
