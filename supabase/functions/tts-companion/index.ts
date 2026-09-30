import { z } from "npm:zod@3.25.76";
import {
  corsHeaders,
  corsResponse,
  errorResponse,
} from "../_shared/cors.ts";
import { verifyUser } from "../_shared/verify-jwt.ts";
import { enforceRateLimit } from "../_shared/rate-limit.ts";
import { synthesizeAcademic } from "../_shared/iflytek-tts.ts";

const schema = z.object({
  // Same bound as src/lib/validations.ts ttsCompanionSchema (parity-tested).
  voiceId: z.string().min(1).max(50).regex(/^[a-z0-9_]+$/i),
  text: z.string().min(1).max(500),
});

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return corsResponse();

  const user = await verifyUser(req);
  if (!user) return errorResponse("Unauthorized", 401);

  const limited = await enforceRateLimit(user.id, "tts");
  if (limited) return limited;

  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return errorResponse("Invalid input: voiceId and text are required", 400);
    }
    const { voiceId, text } = parsed.data;

    const audioData = await synthesizeAcademic({ voiceId, text });

    return new Response(audioData, {
      headers: {
        "Content-Type": "audio/wav",
        "Cache-Control": "no-cache",
        ...corsHeaders,
      },
    });
  } catch (error) {
    console.error("[tts-companion] Error:", error instanceof Error ? error.message : error);
    return new Response(
      JSON.stringify({ error: "TTS temporarily unavailable" }),
      {
        status: 503,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      },
    );
  }
});
