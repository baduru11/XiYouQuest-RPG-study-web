// Only the app itself may read these responses from a browser. Requests carry
// a bearer token rather than cookies, so the old wildcard exposed no session,
// but it let any site that obtained a token read the results, and ITSO's
// scanner reports it. The app origin is the origin of BETTER_AUTH_JWKS_URL,
// the same value verify-jwt.ts pins as the token issuer. A missing or invalid
// URL yields "null", which no browser origin matches; never a wildcard.
function appOrigin(): string {
  try {
    return new URL(Deno.env.get("BETTER_AUTH_JWKS_URL") ?? "").origin;
  } catch {
    return "null";
  }
}

export const corsHeaders = {
  "Access-Control-Allow-Origin": appOrigin(),
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  // Lets the browser read Retry-After on 429 from the rate limiter.
  "Access-Control-Expose-Headers": "Retry-After",
};

export function corsResponse(): Response {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function errorResponse(error: string, status: number): Response {
  return jsonResponse({ error }, status);
}
