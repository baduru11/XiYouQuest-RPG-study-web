import {
  corsResponse,
  jsonResponse,
  errorResponse,
} from "../_shared/cors.ts";
import {
  createSupabaseClient,
  createAdminClient,
} from "../_shared/supabase.ts";
import { generateSceneImage } from "../_shared/image-gen.ts";
import { chatGenerateImageSchema } from "../_shared/validations.ts";

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return corsResponse();

  const supabase = createSupabaseClient(req);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return errorResponse("Unauthorized", 401);

  try {
    const body = await req.json();
    const parsed = chatGenerateImageSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse("Invalid input", 400);
    }
    const { sessionId, conversationSummary } = parsed.data;

    // Verify session belongs to user
    const { data: session } = await supabase
      .from("chat_sessions")
      .select("id, character_id, scenario_id")
      .eq("id", sessionId)
      .eq("user_id", user.id)
      .single();

    if (!session) {
      return errorResponse("Session not found", 404);
    }

    // Always fetch character/scenario from DB (never trust client-supplied names)
    const [{ data: character }, { data: scenario }] = await Promise.all([
      supabase
        .from("characters")
        .select("name")
        .eq("id", session.character_id)
        .single(),
      supabase
        .from("chat_scenarios")
        .select("title")
        .eq("id", session.scenario_id)
        .single(),
    ]);
    const resolvedCharName = character?.name ?? "Companion";
    const resolvedScenTitle = scenario?.title ?? "Journey";

    // Generate image
    const imageResult = await generateSceneImage({
      companionName: resolvedCharName,
      scenarioTitle: resolvedScenTitle,
      conversationSummary,
    });

    if (!imageResult) {
      return errorResponse("Image generation failed", 502);
    }

    // Normalize mime type
    const ALLOWED_TYPES = [
      "image/png",
      "image/jpeg",
      "image/gif",
      "image/webp",
    ];
    const normalizedMime = ALLOWED_TYPES.includes(imageResult.mimeType)
      ? imageResult.mimeType
      : "image/png";
    const ext =
      normalizedMime === "image/jpeg"
        ? "jpg"
        : normalizedMime === "image/webp"
          ? "webp"
          : normalizedMime === "image/gif"
            ? "gif"
            : "png";

    // Upload to Supabase Storage using service role
    const adminClient = createAdminClient();

    const fileName = `${user.id}/${sessionId}/${Date.now()}.${ext}`;
    const imageBytes = base64ToUint8Array(imageResult.base64);

    const { error: uploadError } = await adminClient.storage
      .from("chat-images")
      .upload(fileName, imageBytes, {
        contentType: normalizedMime,
        upsert: false,
      });

    if (uploadError) {
      console.error("[ImageGen] Upload failed:", uploadError);
      return errorResponse("Failed to save image", 500);
    }

    const { data: urlData } = adminClient.storage
      .from("chat-images")
      .getPublicUrl(fileName);
    const imageUrl = urlData.publicUrl;

    // Find the latest companion message and update with image_url
    const { data: latestCompanionMsg } = await supabase
      .from("chat_messages")
      .select("id")
      .eq("session_id", sessionId)
      .eq("role", "companion")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (latestCompanionMsg) {
      await supabase
        .from("chat_messages")
        .update({ image_url: imageUrl })
        .eq("id", latestCompanionMsg.id);
    }

    return jsonResponse({ imageUrl });
  } catch (error) {
    console.error("[chat-generate-image] Error:", error);
    return errorResponse("Image generation failed", 500);
  }
});
