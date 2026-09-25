import {
  corsResponse,
  jsonResponse,
  errorResponse,
} from "../_shared/cors.ts";
import { createRequestClient } from "../_shared/supabase.ts";
import { verifyUser } from "../_shared/verify-jwt.ts";
import { enforceRateLimit } from "../_shared/rate-limit.ts";
import { generateFeedback } from "../_shared/ai-client.ts";
import { buildPlayerMemory } from "../_shared/player-memory.ts";
import { aiFeedbackSchema } from "../_shared/validations.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return corsResponse();

  const user = await verifyUser(req);
  if (!user) return errorResponse("Unauthorized", 401);

  const limited = await enforceRateLimit(user.id, "ai-text");
  if (limited) return limited;
  const supabase = createRequestClient(user);

  let body: Record<string, unknown> | undefined;
  try {
    body = await req.json();
    const parsed = aiFeedbackSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse("Invalid input", 400);
    }
    const { characterId, ...feedbackParams } = parsed.data;

    // Look up character prompt server-side (never trust client)
    const { data: character } = await supabase
      .from("characters")
      .select("personality_prompt")
      .eq("id", characterId)
      .single();

    if (!character) {
      return errorResponse("Character not found", 404);
    }

    // Build player memory server-side
    const playerMemory = await buildPlayerMemory(
      supabase,
      user.id,
      characterId,
    );

    const feedback = await generateFeedback({
      ...feedbackParams,
      characterPrompt: character.personality_prompt,
      playerMemory,
    });

    return jsonResponse({ feedback });
  } catch (error) {
    console.error("[ai-feedback] Error:", error);
    const fallback = body?.isCorrect
      ? "做得好！继续加油！ Nice work, keep it up!"
      : "再试一次吧！Practice makes perfect!";
    return jsonResponse({ feedback: fallback, fallback: true });
  }
});
