import { OPENROUTER_API_KEY } from "./env.ts";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

// Student data (speech transcripts, scores, chat) must not be retained for
// training or processed by providers in mainland China (HKUST ITSO cloud-provider
// guideline: identify processing locations, restrict secondary use). OpenRouter
// then routes only among the remaining providers; if none qualify the request
// fails and the caller's fallback model is used.
const OPENROUTER_PROVIDER_POLICY = {
  data_collection: "deny",
  // Zero-data-retention endpoints only: prompts are not stored by the host.
  // Verified 2026-09-25 against openrouter.ai/api/v1/endpoints/zdr: nine
  // non-PRC ZDR hosts serve deepseek-v4-flash and Google Vertex serves both
  // Gemini fallbacks, so the policy never leaves a model without a host.
  zdr: true,
  ignore: ["streamlake", "siliconflow", "alibaba", "baidu"],
} as const;
const IMAGE_MODEL = "google/gemini-2.5-flash-image:nitro";

/**
 * Generate a pixel-art scene image from server-resolved scenario metadata.
 * Returns base64-encoded image data (PNG).
 */
export async function generateSceneImage(params: {
  companionName: string;
  scenarioTitle: string;
}): Promise<{ base64: string; mimeType: string } | null> {
  const safeName = params.companionName
    .slice(0, 100)
    .replace(/["\n\r]/g, "");
  const safeTitle = params.scenarioTitle
    .slice(0, 200)
    .replace(/["\n\r]/g, "");

  const prompt = `Generate a pixel art scene in Chinese ink painting style.
Setting: A Journey to the West scenario titled "${safeTitle}"
Characters: ${safeName} (from Journey to the West) and a young traveler
Style: 16-bit pixel art with muted earth tones, warm lighting, Chinese landscape elements
Requirements: No text or words in the image. Landscape orientation. Atmospheric and evocative.`;

  try {
    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: IMAGE_MODEL,
        provider: OPENROUTER_PROVIDER_POLICY,
        messages: [{ role: "user", content: prompt }],
        modalities: ["image", "text"],
        image_config: {
          aspect_ratio: "16:9",
        },
      }),
    });

    if (!res.ok) {
      console.error(`[ImageGen] Provider returned ${res.status}`);
      return null;
    }

    const data = await res.json();
    const message = data.choices?.[0]?.message;

    if (!message) {
      console.error("[ImageGen] Provider response had no message");
      return null;
    }

    // Format 1: message.images[] array (OpenRouter standard)
    if (Array.isArray(message.images)) {
      for (const img of message.images) {
        const url = img?.image_url?.url ?? img?.url;
        if (url) {
          const parsed = parseDataUrl(url);
          if (parsed) return parsed;
        }
      }
    }

    // Format 2: content is an array of parts (multimodal content)
    const content = message.content;
    if (Array.isArray(content)) {
      for (const part of content) {
        if (part.type === "image_url" && part.image_url?.url) {
          const parsed = parseDataUrl(part.image_url.url);
          if (parsed) return parsed;
        }
        if (part.inline_data?.data && part.inline_data?.mime_type) {
          return {
            base64: part.inline_data.data,
            mimeType: part.inline_data.mime_type,
          };
        }
        if (part.type === "image" && part.image_url?.url) {
          const parsed = parseDataUrl(part.image_url.url);
          if (parsed) return parsed;
        }
      }
    }

    // Format 3: content is a string containing a data URL
    if (typeof content === "string") {
      const parsed = parseDataUrl(content);
      if (parsed) return parsed;
    }

    console.error("[ImageGen] Provider response had no supported image");
    return null;
  } catch {
    console.error("[ImageGen] Generation failed");
    return null;
  }
}

function parseDataUrl(
  str: string,
): { base64: string; mimeType: string } | null {
  const match = str.match(
    /data:(image\/[\w+.-]+);base64,([A-Za-z0-9+/=\s]+)/,
  );
  if (match) {
    return { base64: match[2].replace(/\s/g, ""), mimeType: match[1] };
  }
  return null;
}
