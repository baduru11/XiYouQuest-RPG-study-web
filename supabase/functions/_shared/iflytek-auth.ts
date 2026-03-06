import { IFLYTEK_API_KEY, IFLYTEK_API_SECRET } from "./env.ts";

/**
 * Build an authenticated WebSocket URL for any iFlytek service.
 * Uses Web Crypto API (works in Deno) instead of Node.js crypto.
 */
export async function buildIflytekWsUrl(
  host: string,
  path: string,
): Promise<string> {
  const apiKey = IFLYTEK_API_KEY();
  const apiSecret = IFLYTEK_API_SECRET();

  const now = new Date().toUTCString();
  const signatureOrigin = `host: ${host}\ndate: ${now}\nGET ${path} HTTP/1.1`;

  // HMAC-SHA256 using Web Crypto API
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(apiSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signatureBytes = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(signatureOrigin),
  );
  const signature = btoa(
    String.fromCharCode(...new Uint8Array(signatureBytes)),
  );

  const authorizationOrigin = `api_key="${apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`;
  const authorization = btoa(authorizationOrigin);

  const params = new URLSearchParams({
    authorization,
    date: now,
    host,
  });

  return `wss://${host}${path}?${params.toString()}`;
}
