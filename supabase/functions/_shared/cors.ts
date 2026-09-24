export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
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
