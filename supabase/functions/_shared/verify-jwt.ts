import { createRemoteJWKSet, jwtVerify } from "npm:jose@6.2.3";

/**
 * Better Auth issues ES256 JWTs signed with keys published at its JWKS
 * endpoint (BETTER_AUTH_JWKS_URL). Callers no longer have a Supabase
 * `auth.users` row, so `supabase.auth.getUser()` cannot be used to gate
 * requests. This verifies the Better Auth JWT instead.
 *
 * The remote JWK set is created ONCE at module scope so `jose` can cache
 * and reuse the fetched keys across requests (per Deno isolate).
 */
function requireJwksUrl(): URL {
  const raw = Deno.env.get("BETTER_AUTH_JWKS_URL");
  if (!raw) {
    throw new Error(
      "BETTER_AUTH_JWKS_URL is not set. Configure it in the edge function " +
        "secrets (e.g. https://<app-origin>/api/auth/jwks).",
    );
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`BETTER_AUTH_JWKS_URL is not a valid URL: ${raw}`);
  }
  // The JWKS must never be fetched over plaintext: a MITM could substitute
  // signing keys and forge tokens this verifier would accept.
  if (url.protocol !== "https:") {
    throw new Error(
      `BETTER_AUTH_JWKS_URL must use https (got ${url.protocol}).`,
    );
  }
  return url;
}

const jwksUrl = requireJwksUrl();
const jwks = createRemoteJWKSet(jwksUrl);

// Better Auth signs with iss = aud = its baseURL, which is the origin of the
// JWKS URL (…/api/auth/jwks). Pinning issuer + audience + algorithm closes the
// trust boundary: a token from any other issuer, tenant, or algorithm is
// rejected even if it were somehow signed by a key this set could fetch.
const EXPECTED_ORIGIN = jwksUrl.origin;

/**
 * Verify the Better Auth JWT on the incoming request.
 * @returns `{ id }` (the token subject) on success, or `null` on any failure
 *          (missing header, malformed/expired/invalid token, wrong
 *          algorithm/issuer/audience).
 */
export async function verifyUser(
  req: Request,
): Promise<{ id: string } | null> {
  const authHeader = req.headers.get("authorization") ?? "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const token = match[1];

  try {
    const { payload } = await jwtVerify(token, jwks, {
      algorithms: ["ES256"],
      issuer: EXPECTED_ORIGIN,
      audience: EXPECTED_ORIGIN,
    });
    if (!payload.sub) return null;
    return { id: String(payload.sub) };
  } catch {
    return null;
  }
}
