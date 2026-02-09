import WebSocket from "ws";
import type { ExpressionName } from "@/types/character";

const DASHSCOPE_API_KEY = process.env.ALIBABA_DASHSCOPE_API_KEY || process.env.DASHSCOPE_API_KEY;

const EXPRESSION_INSTRUCTIONS: Partial<Record<ExpressionName, string>> = {
  neutral: "Speak naturally and warmly, like a friendly study buddy.",
  happy: "Speak with a cheerful, bright tone full of energy and joy.",
  proud: "Speak with warm pride and admiration, celebrating achievement.",
  excited: "Speak with high energy and enthusiasm, truly thrilled.",
  thinking: "Speak thoughtfully and gently, as if carefully considering.",
  encouraging: "Speak with warm encouragement, supportive and motivating.",
  teasing: "Speak playfully with a light, teasing tone.",
  surprised: "Speak with gentle surprise, showing care and concern.",
  listening: "Speak softly and attentively.",
  disappointed: "Speak gently with slight concern, still supportive.",
};


/**
 * Academic TTS — clear, consistent Putonghua for reading vocab, passages, sentences.
 * Uses qwen3-tts-flash HTTP API.
 */
export async function synthesizeAcademic(params: {
  voiceId: string;
  text: string;
}): Promise<Buffer> {
  // Truncate to 600 char limit
  const text = params.text.slice(0, 600);

  const response = await fetch(
    "https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${DASHSCOPE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "qwen3-tts-flash",
        input: {
          text: text,
        },
        parameters: {
          voice: params.voiceId,
          language_type: "Chinese",
          speed: 1.0, // Standard speed for natural pronunciation
          pitch: 0, // Neutral pitch - no variation
          volume: 50, // Standard volume
          seed: 42, // Fixed seed for deterministic output
        },
      }),
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    console.error("Qwen3 Academic TTS API error:", errorBody);
    throw new Error(`Qwen3 Academic TTS error: ${response.status} - ${errorBody}`);
  }

  const result = await response.json();
  const audioUrl = result?.output?.audio?.url;

  if (!audioUrl) {
    console.error("Qwen3 Academic TTS: no audio URL in response", JSON.stringify(result));
    throw new Error("Qwen3 Academic TTS: no audio URL in response");
  }

  // Download the WAV file
  const audioResponse = await fetch(audioUrl);
  if (!audioResponse.ok) {
    throw new Error(`Failed to download audio: ${audioResponse.status}`);
  }

  const arrayBuffer = await audioResponse.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

const COMPANION_MAX_RETRIES = 3;
const COMPANION_BASE_DELAY_MS = 1500;

/**
 * Single WebSocket attempt for companion TTS.
 */
function synthesizeCompanionOnce(params: {
  voiceId: string;
  text: string;
  instructions: string;
}): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const url = `wss://dashscope-intl.aliyuncs.com/api-ws/v1/realtime?model=qwen3-tts-instruct-flash-realtime`;
    const ws = new WebSocket(url, {
      headers: {
        "Authorization": `Bearer ${DASHSCOPE_API_KEY}`,
        "X-DashScope-API-Key": DASHSCOPE_API_KEY!,
      },
    });

    const pcmChunks: Buffer[] = [];
    let resolved = false;

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        ws.close();
        reject(new Error("Companion TTS timed out after 30s"));
      }
    }, 30000);

    ws.on("error", (err) => {
      clearTimeout(timeout);
      if (!resolved) {
        resolved = true;
        reject(new Error(`Companion TTS WebSocket error: ${err.message}`));
      }
    });

    ws.on("close", () => {
      clearTimeout(timeout);
      if (!resolved) {
        resolved = true;
        const pcmBuffer = Buffer.concat(pcmChunks);
        const wavBuffer = addWavHeader(pcmBuffer, 24000, 1, 16);
        resolve(wavBuffer);
      }
    });

    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());

        if (msg.type === "session.created") {
          ws.send(
            JSON.stringify({
              type: "session.update",
              session: {
                voice: params.voiceId,
                instructions: params.instructions,
                optimize_instructions: true,
                response_format: "pcm",
                sample_rate: 24000,
              },
            })
          );

          ws.send(
            JSON.stringify({
              type: "input_text_buffer.append",
              delta: params.text,
            })
          );

          ws.send(JSON.stringify({ type: "session.finish" }));
        } else if (msg.type === "response.audio.delta") {
          if (msg.delta) {
            pcmChunks.push(Buffer.from(msg.delta, "base64"));
          }
        } else if (
          msg.type === "session.finished" ||
          msg.type === "response.done"
        ) {
          clearTimeout(timeout);
          if (!resolved) {
            resolved = true;
            ws.close();
            const pcmBuffer = Buffer.concat(pcmChunks);
            const wavBuffer = addWavHeader(pcmBuffer, 24000, 1, 16);
            resolve(wavBuffer);
          }
        } else if (msg.type === "error") {
          clearTimeout(timeout);
          if (!resolved) {
            resolved = true;
            ws.close();
            reject(
              new Error(
                `Companion TTS server error: ${msg.error?.message ?? JSON.stringify(msg)}`
              )
            );
          }
        }
      } catch {
        // Ignore non-JSON messages
      }
    });
  });
}

/**
 * Companion TTS — expressive, personality-driven voice for character dialogue.
 * Uses qwen3-tts-instruct-flash-realtime WebSocket API with retry + backoff.
 * Returns null if all retries are exhausted.
 */
export async function synthesizeCompanion(params: {
  voiceId: string;
  text: string;
  expression?: ExpressionName;
}): Promise<Buffer | null> {
  if (!DASHSCOPE_API_KEY) {
    throw new Error("DASHSCOPE_API_KEY is not configured");
  }

  const instructions =
    EXPRESSION_INSTRUCTIONS[params.expression ?? "neutral"] ??
    EXPRESSION_INSTRUCTIONS.neutral!;

  for (let attempt = 0; attempt <= COMPANION_MAX_RETRIES; attempt++) {
    try {
      return await synthesizeCompanionOnce({
        voiceId: params.voiceId,
        text: params.text,
        instructions,
      });
    } catch (error) {
      if (attempt === COMPANION_MAX_RETRIES) {
        console.error("[Companion TTS] All retries exhausted:", error);
        return null;
      }
      const delay = COMPANION_BASE_DELAY_MS * Math.pow(2, attempt) + Math.random() * 500;
      console.warn(`[Companion TTS] Retrying in ${Math.round(delay)}ms (attempt ${attempt + 1}/${COMPANION_MAX_RETRIES})...`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  return null;
}

/**
 * Synthesize a group of words as a single cohesive audio.
 * Joins words with Chinese commas so the TTS engine produces natural pauses.
 */
export async function synthesizeWordGroup(params: {
  voiceId: string;
  words: string[];
  pauseMs?: number; // kept for API compat, ignored — pauses controlled by punctuation
}): Promise<Buffer> {
  const text = params.words.join("，");
  return synthesizeAcademic({ voiceId: params.voiceId, text });
}

/**
 * Add a WAV header to raw PCM data.
 */
function addWavHeader(
  pcm: Buffer,
  sampleRate: number,
  numChannels: number,
  bitsPerSample: number
): Buffer {
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = pcm.length;
  const headerSize = 44;

  const header = Buffer.alloc(headerSize);
  // RIFF chunk
  header.write("RIFF", 0);
  header.writeUInt32LE(dataSize + headerSize - 8, 4);
  header.write("WAVE", 8);
  // fmt sub-chunk
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); // sub-chunk size
  header.writeUInt16LE(1, 20); // PCM format
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  // data sub-chunk
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcm]);
}
