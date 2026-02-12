import crypto from "crypto";
import WebSocket from "ws";

const IFLYTEK_APP_ID = process.env.IFLYTEK_APP_ID!;
const IFLYTEK_API_KEY = process.env.IFLYTEK_API_KEY!;
const IFLYTEK_API_SECRET = process.env.IFLYTEK_API_SECRET!;

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
 * Parse a WAV buffer to extract raw PCM data and audio format info.
 */
function parseWavPcm(wav: Buffer): {
  pcm: Buffer;
  sampleRate: number;
  numChannels: number;
  bitsPerSample: number;
} {
  const numChannels = wav.readUInt16LE(22);
  const sampleRate = wav.readUInt32LE(24);
  const bitsPerSample = wav.readUInt16LE(34);

  // Find "data" sub-chunk
  let dataOffset = 36;
  while (dataOffset < wav.length - 8) {
    if (wav.toString("ascii", dataOffset, dataOffset + 4) === "data") break;
    dataOffset += 2;
  }

  const dataSize = wav.readUInt32LE(dataOffset + 4);
  const pcm = wav.subarray(dataOffset + 8, dataOffset + 8 + dataSize);
  return { pcm, sampleRate, numChannels, bitsPerSample };
}

/**
 * Normalize inter-word pauses in PCM audio to an exact duration.
 * Uses windowed RMS energy (25ms windows, 10ms hops) to detect silence gaps
 * produced by sentence-boundary separators (。). Replaces each detected gap
 * with fixed-length silence and trims leading/trailing silence.
 */
function normalizePauses(
  pcm: Buffer,
  sampleRate: number,
  targetPauseMs: number
): Buffer {
  const BYTES = 2; // 16-bit PCM
  const total = pcm.length / BYTES;
  if (total === 0) return pcm;

  const targetGapBytes = Math.round((targetPauseMs / 1000) * sampleRate) * BYTES;

  // --- RMS energy in 25ms windows, 10ms hops ---
  const winSam = Math.round(0.025 * sampleRate);
  const hopSam = Math.round(0.010 * sampleRate);
  if (winSam === 0 || hopSam === 0) return pcm;

  const nFrames = Math.floor((total - winSam) / hopSam) + 1;
  if (nFrames <= 0) return pcm;

  const rms: number[] = new Array(nFrames);
  for (let f = 0; f < nFrames; f++) {
    const off = f * hopSam;
    let sq = 0;
    for (let i = 0; i < winSam; i++) {
      const s = pcm.readInt16LE((off + i) * BYTES);
      sq += s * s;
    }
    rms[f] = Math.sqrt(sq / winSam);
  }

  // Adaptive threshold: 5% of peak RMS
  const peak = Math.max(...rms);
  if (peak === 0) return pcm;
  const silThresh = peak * 0.05;

  // --- Build runs of silent/audio frames ---
  type Run = { silent: boolean; s: number; e: number };
  const runs: Run[] = [];
  let curSilent = rms[0] < silThresh;
  let runStart = 0;

  for (let f = 1; f < nFrames; f++) {
    const fSilent = rms[f] < silThresh;
    if (fSilent !== curSilent) {
      runs.push({ silent: curSilent, s: runStart * hopSam, e: f * hopSam });
      curSilent = fSilent;
      runStart = f;
    }
  }
  runs.push({ silent: curSilent, s: runStart * hopSam, e: total });

  // Find first and last audio run
  const firstAudio = runs.findIndex((r) => !r.silent);
  const lastAudio = runs.findLastIndex((r) => !r.silent);
  if (firstAudio === -1) return pcm;

  const minGapSamples = Math.round(0.05 * sampleRate); // 50ms min inter-word gap

  const parts: Buffer[] = [];
  for (let i = firstAudio; i <= lastAudio; i++) {
    const run = runs[i];
    if (run.silent && run.e - run.s >= minGapSamples) {
      parts.push(Buffer.alloc(targetGapBytes));
    } else {
      parts.push(pcm.subarray(run.s * BYTES, run.e * BYTES));
    }
  }

  return Buffer.concat(parts);
}

/**
 * Synthesize a group of words as a single TTS call with consistent pauses.
 * Words joined with Chinese comma (，) for natural TTS boundaries,
 * then RMS-based silence detection replaces all gaps with exact-duration silence.
 */
export async function synthesizeWordGroup(params: {
  voiceId: string;
  words: string[];
  pauseMs?: number;
}): Promise<Buffer> {
  const pauseMs = params.pauseMs ?? 1000;

  const text = params.words.join("，");
  const wav = await synthesizeAcademic({ voiceId: params.voiceId, text });

  const { pcm, sampleRate, numChannels, bitsPerSample } = parseWavPcm(wav);
  const normalizedPcm = normalizePauses(pcm, sampleRate, pauseMs);
  return addWavHeader(normalizedPcm, sampleRate, numChannels, bitsPerSample);
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
