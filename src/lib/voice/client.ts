import crypto from "crypto";
import WebSocket from "ws";
import { IFLYTEK_APP_ID, IFLYTEK_API_KEY, IFLYTEK_API_SECRET } from "@/lib/env";

const IFLYTEK_HOST = "tts-api-sg.xf-yun.com";
const IFLYTEK_PATH = "/v2/tts";

const VALID_IFLYTEK_VOICES = new Set([
  "x_xiaoyan", "x_xiaoyuan", "x_xiaoxi", "x_xiaomei",
  "x_xiaofeng", "x_xiaoxue", "x_yifeng", "x_xiaoyang_story",
  "x_xiaolin", "x4_lingfeizhe_assist", "x4_lingfeichen_assist",
  "x4_lingxiaoqi_assist", "x4_yilin", "x4_ziwen_assist",
  "x_laoma",
]);

const DEFAULT_IFLYTEK_VOICE = "x_xiaoyan";

/**
 * Build an authenticated WebSocket URL for iFlytek TTS API.
 * Uses HMAC-SHA256 signature with date-based expiry (~300s tolerance).
 */
function buildIflytekWsUrl(): string {
  const date = new Date().toUTCString();

  const signatureOrigin = `host: ${IFLYTEK_HOST}\ndate: ${date}\nGET ${IFLYTEK_PATH} HTTP/1.1`;

  const hmac = crypto.createHmac("sha256", IFLYTEK_API_SECRET);
  hmac.update(signatureOrigin);
  const signature = hmac.digest("base64");

  const authorizationOrigin = `api_key="${IFLYTEK_API_KEY}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`;
  const authorization = Buffer.from(authorizationOrigin).toString("base64");

  return `wss://${IFLYTEK_HOST}${IFLYTEK_PATH}?authorization=${authorization}&date=${encodeURIComponent(date)}&host=${IFLYTEK_HOST}`;
}

/**
 * Core iFlytek TTS synthesis via WebSocket.
 * Returns raw PCM audio (16kHz, 16-bit, mono).
 */
async function synthesizeIflytek(params: {
  text: string;
  vcn?: string;
  speed?: number;  // 0-100, 50 = normal
  pitch?: number;  // 0-100, 50 = normal
  volume?: number; // 0-100, 50 = normal
}): Promise<Buffer> {
  const text = params.text.slice(0, 2000);
  const vcn = (params.vcn && VALID_IFLYTEK_VOICES.has(params.vcn))
    ? params.vcn
    : DEFAULT_IFLYTEK_VOICE;
  const speed = params.speed ?? 50;
  const pitch = params.pitch ?? 50;
  const volume = params.volume ?? 50;

  const wsUrl = buildIflytekWsUrl();
  const textBase64 = Buffer.from(text, "utf-8").toString("base64");

  return new Promise((resolve, reject) => {
    let settled = false;
    const audioChunks: Buffer[] = [];

    const ws = new WebSocket(wsUrl);

    const finish = (pcm: Buffer) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(pcm);
    };

    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(err);
    };

    const timeout = setTimeout(() => {
      ws.close();
      fail(new Error("iFlytek TTS timeout (15s)"));
    }, 15000);

    ws.on("open", () => {
      ws.send(JSON.stringify({
        common: { app_id: IFLYTEK_APP_ID },
        business: {
          vcn,
          aue: "raw",
          auf: "audio/L16;rate=16000",
          speed,
          volume,
          pitch,
          tte: "UTF8",
        },
        data: {
          status: 2,
          text: textBase64,
        },
      }));
    });

    ws.on("message", (data: WebSocket.Data) => {
      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }

      if (msg.code !== 0) {
        ws.close();
        fail(new Error(`iFlytek TTS error code ${msg.code}: ${msg.message || ""}`));
        return;
      }

      if (msg.data?.audio) {
        audioChunks.push(Buffer.from(msg.data.audio, "base64"));
      }

      if (msg.data?.status === 2) {
        ws.close();
        finish(Buffer.concat(audioChunks));
      }
    });

    ws.on("error", (err) => {
      fail(err instanceof Error ? err : new Error(String(err)));
    });

    ws.on("close", () => {
      if (audioChunks.length > 0 && !settled) {
        finish(Buffer.concat(audioChunks));
      } else if (!settled) {
        fail(new Error("iFlytek TTS: connection closed without audio"));
      }
    });
  });
}

/**
 * Academic TTS — clear, consistent Putonghua for reading vocab, passages, sentences.
 * Uses iFlytek WebSocket API with standard pronunciation settings.
 */
export async function synthesizeAcademic(params: {
  voiceId: string;
  text: string;
}): Promise<Buffer> {
  const vcn = VALID_IFLYTEK_VOICES.has(params.voiceId)
    ? params.voiceId
    : DEFAULT_IFLYTEK_VOICE;

  const pcm = await synthesizeIflytek({
    text: params.text,
    vcn,
    speed: 40,
    pitch: 50,
    volume: 50,
  });

  return addWavHeader(pcm, 16000, 1, 16);
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
