import { OPENROUTER_API_KEY } from "@/lib/env";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const IMAGE_MODEL = "google/gemini-3.1-flash-image-preview";

/**
 * Generate a pixel-art scene image based on conversation context.
 * Returns base64-encoded image data (PNG).
 */
export async function generateSceneImage(params: {
  companionName: string;
  scenarioTitle: string;
  conversationSummary: string;
}): Promise<{ base64: string; mimeType: string } | null> {
  const prompt = `Generate a pixel art scene in Chinese ink painting style.
Scene: ${params.conversationSummary}
Setting: A Journey to the West scenario titled "${params.scenarioTitle}"
Characters: ${params.companionName} (from Journey to the West) and a young traveler
Style: 16-bit pixel art with muted earth tones, warm lighting, Chinese landscape elements
Requirements: No text or words in the image. Landscape orientation. Atmospheric and evocative.`;

  try {
    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: IMAGE_MODEL,
        messages: [
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`[ImageGen] OpenRouter error ${res.status}: ${body}`);
      return null;
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;

    // Gemini image preview returns inline_data in parts
    if (Array.isArray(content)) {
      for (const part of content) {
        if (part.type === "image_url" && part.image_url?.url) {
          // data:image/png;base64,... format
          const match = part.image_url.url.match(/^data:(image\/\w+);base64,(.+)$/);
          if (match) {
            return { base64: match[2], mimeType: match[1] };
          }
        }
      }
    }

    // Alternative: check for inline base64 in text content
    if (typeof content === "string" && content.includes("base64")) {
      const match = content.match(/data:(image\/\w+);base64,([A-Za-z0-9+/=]+)/);
      if (match) {
        return { base64: match[2], mimeType: match[1] };
      }
    }

    console.warn("[ImageGen] No image data found in response");
    return null;
  } catch (error) {
    console.error("[ImageGen] Generation failed:", error);
    return null;
  }
}
