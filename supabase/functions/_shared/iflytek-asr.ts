import { IFLYTEK_APP_ID } from "./env.ts";
import { buildIflytekWsUrl } from "./iflytek-auth.ts";

const ASR_HOST = "ist-api-sg.xf-yun.com";
const ASR_PATH = "/v2/ist";

const ASR_TIMEOUT_MS = 120_000;

export interface AsrTranscriptionResult {
  transcript: string;
}

// ---------- Buffer helpers ----------

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++)
    binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

// ---------- Main transcription ----------

/**
 * Transcribe audio using iFlytek Real-time ASR (IST) via WebSocket.
 * Uses native WebSocket (Deno) and Uint8Array instead of Node.js Buffer/ws.
 */
export async function transcribeAudio(
  audioData: Uint8Array,
): Promise<AsrTranscriptionResult> {
  const wsUrl = await buildIflytekWsUrl(ASR_HOST, ASR_PATH);

  // Strip WAV header if present (44-byte RIFF header)
  let pcmData: Uint8Array;
  if (
    audioData.length > 44 &&
    new TextDecoder().decode(audioData.subarray(0, 4)) === "RIFF"
  ) {
    pcmData = audioData.subarray(44);
  } else {
    pcmData = audioData;
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const startTime = Date.now();

    // Track segments by sequence number for dynamic correction
    const segments: Map<number, string> = new Map();

    console.log(
      `[ASR] pcm=${pcmData.length} bytes (${Math.round(pcmData.length / 32000)}s audio)`,
    );

    const ws = new WebSocket(wsUrl);

    const finish = (transcript: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      console.log(
        `[ASR] completed in ${((Date.now() - startTime) / 1000).toFixed(1)}s, transcript length=${transcript.length}`,
      );
      resolve({ transcript });
    };

    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    };

    const timer = setTimeout(() => {
      ws.close();
      fail(new Error(`iFlytek ASR timeout (${ASR_TIMEOUT_MS / 1000}s)`));
    }, ASR_TIMEOUT_MS);

    ws.onopen = () => {
      // Send audio in 10KB chunks
      const CHUNK_SIZE = 10240;
      let offset = 0;

      const sendChunks = () => {
        if (settled || ws.readyState !== WebSocket.OPEN) return;

        while (offset < pcmData.length) {
          const end = Math.min(offset + CHUNK_SIZE, pcmData.length);
          const chunk = pcmData.subarray(offset, end);
          const isFirst = offset === 0;
          const isLast = end >= pcmData.length;

          const frame: Record<string, unknown> = {
            data: {
              status: isFirst ? 0 : isLast ? 2 : 1,
              format: "audio/L16;rate=16000",
              encoding: "raw",
              audio: uint8ArrayToBase64(chunk),
            },
          };

          // First frame includes common + business params
          if (isFirst) {
            frame.common = { app_id: IFLYTEK_APP_ID() };
            frame.business = {
              language: "zh_cn",
              domain: "ist_open",
              accent: "mandarin",
              dwa: "wpgs",
              punc: 1,
            };
          }

          ws.send(JSON.stringify(frame));
          offset = end;
        }
      };

      sendChunks();
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
          new Error(`iFlytek ASR error ${msg.code}: ${msg.message || ""}`),
        );
        return;
      }

      const result = msg.data?.result;
      if (result) {
        const sn = result.sn as number;
        const pgs = result.pgs as string | undefined;
        const ws_data = result.ws as
          | Array<{ cw: Array<{ w: string }> }>
          | undefined;

        if (ws_data) {
          const text = ws_data
            .map((item) => item.cw.map((cw) => cw.w).join(""))
            .join("");

          if (pgs === "rpl") {
            segments.set(sn, text);
          } else {
            segments.set(sn, text);
          }
        }
      }

      // status=2 means final result
      if (msg.data?.status === 2) {
        ws.close();
        const sortedKeys = Array.from(segments.keys()).sort((a, b) => a - b);
        const transcript = sortedKeys
          .map((k) => segments.get(k)!)
          .join("");
        finish(transcript);
      }
    };

    ws.onerror = () => {
      fail(new Error("iFlytek ASR WebSocket error"));
    };

    ws.onclose = () => {
      if (!settled) {
        if (segments.size > 0) {
          const sortedKeys = Array.from(segments.keys()).sort(
            (a, b) => a - b,
          );
          const transcript = sortedKeys
            .map((k) => segments.get(k)!)
            .join("");
          finish(transcript);
        } else {
          fail(new Error("iFlytek ASR: closed without result"));
        }
      }
    };
  });
}
