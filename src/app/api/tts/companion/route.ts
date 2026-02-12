import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { synthesizeAcademic } from "@/lib/voice/client";
import { ttsCompanionSchema } from "@/lib/validations";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = ttsCompanionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input: voiceId and text are required" }, { status: 400 });
    }
    const { voiceId, text } = parsed.data;

    const audioBuffer = await synthesizeAcademic({ voiceId, text });

    return new NextResponse(new Uint8Array(audioBuffer), {
      headers: {
        "Content-Type": "audio/wav",
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    console.error("Companion TTS error:", error);
    return NextResponse.json(
      { error: "TTS temporarily unavailable" },
      { status: 503 }
    );
  }
}
