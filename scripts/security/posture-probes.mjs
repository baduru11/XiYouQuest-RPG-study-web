// Network probes for the posture check. Each probe resolves to plain data and
// never throws; posture-lib.mjs decides what the data proves.

import net from "node:net";
import tls from "node:tls";

export const TIMEOUT_MS = 20_000;

/** fetch with retries on network failure (not on HTTP status). Throws the last error. */
export async function fetchRetry(url, init = {}, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
  throw lastError;
}

/** Reads a response body as JSON when possible, else null. */
export async function jsonBody(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * Offers one TLS configuration to host:port.
 * @returns {Promise<{ handshake: boolean, protocol?: string, code?: string }>}
 */
export function tlsOffer({ host, port = 443, minVersion = "TLSv1", maxVersion, ciphers }) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };
    let socket;
    try {
      socket = tls.connect(
        { host, port, servername: host, minVersion, maxVersion, ciphers, rejectUnauthorized: true },
        () => {
          const protocol = socket.getProtocol() ?? undefined;
          socket.end();
          finish({ handshake: true, protocol });
        },
      );
    } catch (error) {
      // An impossible cipher list throws synchronously: the offer was never made.
      finish({ handshake: false, code: error.code ?? "CLIENT_ERROR" });
      return;
    }
    socket.setTimeout(TIMEOUT_MS, () => {
      socket.destroy();
      finish({ handshake: false, code: "TIMEOUT" });
    });
    socket.on("error", (error) => finish({ handshake: false, code: error.code ?? "UNKNOWN" }));
  });
}

/**
 * Postgres TLS as a client really negotiates it: SSLRequest first, then a TLS
 * handshake that must verify against `ca` with hostname checking on.
 * @returns {Promise<{ ok: boolean, protocol?: string, code?: string }>}
 */
export function postgresTls({ host, port = 6543, ca }) {
  return new Promise((resolve) => {
    let settled = false;
    const raw = net.connect({ host, port });
    const finish = (value) => {
      if (settled) return;
      settled = true;
      raw.destroy();
      resolve(value);
    };
    raw.setTimeout(TIMEOUT_MS, () => finish({ ok: false, code: "TIMEOUT" }));
    raw.once("error", (error) => finish({ ok: false, code: error.code ?? "UNKNOWN" }));
    raw.once("connect", () => {
      const sslRequest = Buffer.alloc(8);
      sslRequest.writeInt32BE(8, 0);
      sslRequest.writeInt32BE(80877103, 4);
      raw.write(sslRequest);
    });
    raw.once("data", (data) => {
      if (data[0] !== 0x53 /* 'S' */) return finish({ ok: false, code: "SSL_NOT_SUPPORTED" });
      const secure = tls.connect({ socket: raw, servername: host, ca, rejectUnauthorized: true }, () => {
        const protocol = secure.getProtocol() ?? undefined;
        secure.end();
        finish({ ok: true, protocol });
      });
      secure.once("error", (error) => finish({ ok: false, code: error.code ?? "UNKNOWN" }));
    });
  });
}
