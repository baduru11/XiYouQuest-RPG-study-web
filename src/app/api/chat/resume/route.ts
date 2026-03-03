import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { chatResumeSchema } from "@/lib/validations";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = chatResumeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const { sessionId } = parsed.data;

    // Fetch session with character + scenario details
    const { data: session } = await supabase
      .from("chat_sessions")
      .select("*, characters(name, voice_id, image_url), chat_scenarios(title, category)")
      .eq("id", sessionId)
      .eq("user_id", user.id)
      .single();

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // Clear ended_at if set (reopen the session)
    if (session.ended_at) {
      await supabase
        .from("chat_sessions")
        .update({ ended_at: null })
        .eq("id", sessionId);
    }

    // Fetch all messages ordered by created_at
    const { data: messages } = await supabase
      .from("chat_messages")
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });

    return NextResponse.json({
      session: {
        id: session.id,
        character_id: session.character_id,
        scenario_id: session.scenario_id,
        message_count: session.message_count,
        xp_earned: session.xp_earned,
        affection_earned: session.affection_earned,
      },
      messages: messages ?? [],
      character: session.characters as { name: string; voice_id: string; image_url: string | null },
      scenario: session.chat_scenarios as { title: string; category: string },
    });
  } catch (error) {
    console.error("[Chat] Resume error:", error);
    return NextResponse.json({ error: "Failed to resume session" }, { status: 500 });
  }
}
