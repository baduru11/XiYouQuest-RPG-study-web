import { IFLYTEK_APP_ID } from "./env.ts";
import { buildIflytekWsUrl } from "./iflytek-auth.ts";

const IFLYTEK_HOST = "tts-api-sg.xf-yun.com";
const IFLYTEK_PATH = "/v2/tts";

const VALID_IFLYTEK_VOICES = new Set([
  "x_xiaoyan",
  "x_xiaoyuan",
  "x_xiaoxi",
  "x_xiaomei",
  "x_xiaofeng",
  "x_xiaoxue",
  "x_yifeng",
  "x_xiaoyang_story",
  "x_xiaolin",
  "x4_lingfeizhe_assist",
  "x4_lingfeichen_assist",
  "x4_lingxiaoqi_assist",
  "x4_yilin",
  "x4_ziwen_assist",
  "x_laoma",
]);

const DEFAULT_IFLYTEK_VOICE = "x_xiaoyan";

// ---------- Buffer helpers ----------

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function concatUint8Arrays(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((sum, a) => sum + a.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    result.set(a, offset);
    offset += a.length;
  }
  return result;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++)
    binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

// ---------- WAV header ----------

function addWavHeader(
  pcm: Uint8Array,
  sampleRate: number,
  numChannels: number,
  bitsPerSample: number,
): Uint8Array {
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = pcm.length;
  const headerSize = 44;

  const header = new ArrayBuffer(headerSize);
  const view = new DataView(header);
  const encoder = new TextEncoder();

  // RIFF chunk
  const riff = encoder.encode("RIFF");
  new Uint8Array(header, 0, 4).set(riff);
  view.setUint32(4, dataSize + headerSize - 8, true);
  const wave = encoder.encode("WAVE");
  new Uint8Array(header, 8, 4).set(wave);

  // fmt sub-chunk
  const fmt = encoder.encode("fmt ");
  new Uint8Array(header, 12, 4).set(fmt);
  view.setUint32(16, 16, true); // sub-chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  // data sub-chunk
  const data = encoder.encode("data");
  new Uint8Array(header, 36, 4).set(data);
  view.setUint32(40, dataSize, true);

  return concatUint8Arrays(new Uint8Array(header), pcm);
}

// ---------- Core TTS ----------

async function synthesizeIflytek(params: {
  text: string;
  vcn?: string;
  speed?: number;
  pitch?: number;
  volume?: number;
}): Promise<Uint8Array> {
  const text = params.text.slice(0, 2000);
  const vcn =
    params.vcn && VALID_IFLYTEK_VOICES.has(params.vcn)
      ? params.vcn
      : DEFAULT_IFLYTEK_VOICE;
  const speed = params.speed ?? 50;
  const pitch = params.pitch ?? 50;
  const volume = params.volume ?? 50;

  const wsUrl = await buildIflytekWsUrl(IFLYTEK_HOST, IFLYTEK_PATH);
  const textBase64 = btoa(
    Array.from(new TextEncoder().encode(text), (b) =>
      String.fromCharCode(b),
    ).join(""),
  );

  return new Promise((resolve, reject) => {
    let settled = false;
    const audioChunks: Uint8Array[] = [];

    const ws = new WebSocket(wsUrl);

    const finish = (pcm: Uint8Array) => {
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

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          common: { app_id: IFLYTEK_APP_ID() },
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
        }),
      );
    };

    ws.onmessage = (ev: MessageEvent) => {
      let msg;
      try {
        msg = JSON.parse(typeof ev.data === "string" ? ev.data : "");
      } catch {
        return;
      }

      if (msg.code !== 0) {
        ws.close();
        fail(
          new Error(
            `iFlytek TTS error code ${msg.code}: ${msg.message || ""}`,
          ),
        );
        return;
      }

      if (msg.data?.audio) {
        audioChunks.push(base64ToUint8Array(msg.data.audio));
      }

      if (msg.data?.status === 2) {
        ws.close();
        finish(concatUint8Arrays(...audioChunks));
      }
    };

    ws.onerror = () => {
      fail(new Error("iFlytek TTS WebSocket error"));
    };

    ws.onclose = () => {
      if (audioChunks.length > 0 && !settled) {
        finish(concatUint8Arrays(...audioChunks));
      } else if (!settled) {
        fail(new Error("iFlytek TTS: connection closed without audio"));
      }
    };
  });
}

/**
 * Academic TTS — clear, consistent Putonghua for reading vocab, passages, sentences.
 * Returns WAV audio as Uint8Array.
 */
export async function synthesizeAcademic(params: {
  voiceId: string;
  text: string;
}): Promise<Uint8Array> {
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

/** Helper to convert Uint8Array to base64 (exported for edge functions). */
export { uint8ArrayToBase64 };
