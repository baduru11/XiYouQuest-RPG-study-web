import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { synthesizeAcademic, synthesizeWordGroup } from "@/lib/voice/client";
import { ttsSpeakSchema } from "@/lib/validations";
import { TTS_CACHE_MAX_SIZE } from "@/lib/constants";

// In-memory cache for consistent pronunciation
// Key: `${voiceId}:${text}`, Value: Buffer
const audioCache = new Map<string, Buffer>();

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = ttsSpeakSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input: provide voiceId with text or words" }, { status: 400 });
    }
    const { voiceId, text, words, pauseMs } = parsed.data;

    let cacheKey: string;
    let audioBuffer: Buffer | undefined;

    if (words && Array.isArray(words)) {
      // Multi-word group mode — concatenate individual TTS with silence
      const pause = pauseMs ?? 750;
      cacheKey = `group:${voiceId}:${words.join(",")}:${pause}`;
      audioBuffer = audioCache.get(cacheKey);

      if (!audioBuffer) {
        audioBuffer = await synthesizeWordGroup({ voiceId, words, pauseMs: pause });
        audioCache.set(cacheKey, audioBuffer);

        if (audioCache.size > TTS_CACHE_MAX_SIZE) {
          const firstKey = audioCache.keys().next().value;
          if (firstKey !== undefined) {
            audioCache.delete(firstKey);
          }
        }
      }
    } else {
      // Single text mode — text is guaranteed by .refine()
      cacheKey = `academic:${voiceId}:${text}`;
      audioBuffer = audioCache.get(cacheKey);

      if (!audioBuffer) {
        audioBuffer = await synthesizeAcademic({ voiceId, text: text! });
        audioCache.set(cacheKey, audioBuffer);

        if (audioCache.size > TTS_CACHE_MAX_SIZE) {
          const firstKey = audioCache.keys().next().value;
          if (firstKey !== undefined) {
            audioCache.delete(firstKey);
          }
        }
      }
    }

    return new NextResponse(new Uint8Array(audioBuffer), {
      headers: {
        "Content-Type": "audio/wav",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    console.error("TTS error:", error);
    return NextResponse.json({ error: "TTS failed" }, { status: 500 });
  }
}
