import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_SERVICE_ROLE_KEY } from "@/lib/env";
import { generateSceneImage } from "@/lib/image-gen/client";

/**
 * Admin-only one-time endpoint to pre-generate background images for all
 * chat_scenarios that don't have one yet.
 *
 * POST /api/admin/generate-scenario-backgrounds
 * Header: x-admin-key must match SUPABASE_SERVICE_ROLE_KEY
 */
export async function POST(request: Request) {
  const adminKey = request.headers.get("x-admin-key");
  if (!adminKey || adminKey !== SUPABASE_SERVICE_ROLE_KEY()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    SUPABASE_SERVICE_ROLE_KEY(),
  );

  const { data: scenarios, error } = await supabase
    .from("chat_scenarios")
    .select("id, title, description, category, background_url")
    .is("background_url", null);

  if (error || !scenarios) {
    return NextResponse.json({ error: "Failed to fetch scenarios" }, { status: 500 });
  }

  const results: { id: string; title: string; status: string; url?: string }[] = [];

  for (const scenario of scenarios) {
    try {
      const imageResult = await generateSceneImage({
        companionName: "a traveler",
        scenarioTitle: scenario.title,
        conversationSummary: `Setting: ${scenario.title} — ${scenario.description}`,
      });

      if (!imageResult) {
        results.push({ id: scenario.id, title: scenario.title, status: "generation_failed" });
        continue;
      }

      const fileName = `scenario-backgrounds/${scenario.id}.png`;
      const imageBuffer = Buffer.from(imageResult.base64, "base64");

      const { error: uploadError } = await supabase.storage
        .from("chat-images")
        .upload(fileName, imageBuffer, {
          contentType: imageResult.mimeType,
          upsert: true,
        });

      if (uploadError) {
        results.push({ id: scenario.id, title: scenario.title, status: "upload_failed" });
        continue;
      }

      const { data: urlData } = supabase.storage.from("chat-images").getPublicUrl(fileName);

      await supabase
        .from("chat_scenarios")
        .update({ background_url: urlData.publicUrl })
        .eq("id", scenario.id);

      results.push({ id: scenario.id, title: scenario.title, status: "ok", url: urlData.publicUrl });
    } catch (err) {
      console.error(`[Admin] Failed for scenario ${scenario.id}:`, err);
      results.push({ id: scenario.id, title: scenario.title, status: "error" });
    }
  }

  return NextResponse.json({ total: scenarios.length, results });
}
