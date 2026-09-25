import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { synthesizeAcademic } from "@/lib/voice/client";
import { ttsCompanionSchema } from "@/lib/validations";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = await enforceRateLimit(user.id, "tts");
  if (limited) return limited;

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
