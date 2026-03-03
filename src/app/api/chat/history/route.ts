import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isValidUUID } from "@/lib/validations";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
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

    const [{ data: session }, { data: messages }] = await Promise.all([
      supabase
        .from("chat_sessions")
        .select("*, characters(name, voice_id, image_url), chat_scenarios(title, category)")
        .eq("id", sessionId)
        .eq("user_id", user.id)
        .single(),
      supabase
        .from("chat_messages")
        .select("*")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true }),
    ]);

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    return NextResponse.json({ session, messages: messages ?? [] });
  }

  // Otherwise, return session list (including active sessions)
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20", 10), 50);
  const offset = parseInt(searchParams.get("offset") ?? "0", 10);

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
