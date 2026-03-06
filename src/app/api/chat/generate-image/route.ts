import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { chatGenerateImageSchema } from "@/lib/validations";
import { generateSceneImage } from "@/lib/image-gen/client";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { SUPABASE_SERVICE_ROLE_KEY } from "@/lib/env";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = chatGenerateImageSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
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
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // Always fetch character/scenario from DB (never trust client-supplied names)
    const [{ data: character }, { data: scenario }] = await Promise.all([
      supabase.from("characters").select("name").eq("id", session.character_id).single(),
      supabase.from("chat_scenarios").select("title").eq("id", session.scenario_id).single(),
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
      return NextResponse.json({ error: "Image generation failed" }, { status: 502 });
    }

    // Normalize mime type to one Supabase bucket allows
    const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
    const normalizedMime = ALLOWED_TYPES.includes(imageResult.mimeType)
      ? imageResult.mimeType
      : "image/png";
    const ext = normalizedMime === "image/jpeg" ? "jpg"
      : normalizedMime === "image/webp" ? "webp"
      : normalizedMime === "image/gif" ? "gif"
      : "png";

    // Upload to Supabase Storage using service role for storage operations
    const adminClient = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      SUPABASE_SERVICE_ROLE_KEY(),
    );

    const fileName = `${user.id}/${sessionId}/${Date.now()}.${ext}`;
    const imageBuffer = Buffer.from(imageResult.base64, "base64");

    const { error: uploadError } = await adminClient.storage
      .from("chat-images")
      .upload(fileName, imageBuffer, {
        contentType: normalizedMime,
        upsert: false,
      });

    if (uploadError) {
      console.error("[ImageGen] Upload failed:", uploadError);
      return NextResponse.json({ error: "Failed to save image" }, { status: 500 });
    }

    const { data: urlData } = adminClient.storage.from("chat-images").getPublicUrl(fileName);
    const imageUrl = urlData.publicUrl;

    // Find the latest companion message in this session and update it with image_url
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

    return NextResponse.json({ imageUrl });
  } catch (error) {
    console.error("[ImageGen] Route error:", error);
    return NextResponse.json({ error: "Image generation failed" }, { status: 500 });
  }
}
