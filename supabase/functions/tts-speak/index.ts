import { z } from "npm:zod";
import {
  corsResponse,
  jsonResponse,
  errorResponse,
} from "../_shared/cors.ts";
import { createSupabaseClient } from "../_shared/supabase.ts";
import { synthesizeAcademic, uint8ArrayToBase64 } from "../_shared/iflytek-tts.ts";

const VALID_VOICE_IDS = new Set([
  "x_xiaoyan", "x_xiaoyuan", "x_xiaoxi", "x_xiaomei",
  "x_xiaofeng", "x_xiaoxue", "x_yifeng", "x_xiaoyang_story",
  "x_xiaolin", "x4_lingfeizhe_assist", "x4_lingfeichen_assist",
]);

const schema = z.object({
  voiceId: z.string().min(1).max(50).refine(
    (v) => VALID_VOICE_IDS.has(v),
    { message: "Invalid voice ID" },
  ),
  text: z.string().min(1).max(500),
});

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return corsResponse();

  const supabase = createSupabaseClient(req);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return errorResponse("Unauthorized", 401);

  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return errorResponse("Invalid input: provide voiceId and text", 400);
    }
    const { voiceId, text } = parsed.data;

    const audioData = await synthesizeAcademic({ voiceId, text });

    return new Response(audioData, {
      headers: {
        "Content-Type": "audio/wav",
        "Cache-Control": "private, max-age=3600",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    console.error("[tts-speak] Error:", error instanceof Error ? error.message : error);
    return errorResponse("TTS failed", 500);
  }
});
