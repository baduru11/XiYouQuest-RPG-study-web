import { corsHeaders } from "./cors.ts";
import { createAdminClient } from "./supabase.ts";

/**
 * Edge twin of src/lib/rate-limit.ts. Both call the same Postgres function
 * (`consume_rate_limit`), so a limit cannot be bypassed by switching runtimes.
 * RATE_LIMITS must stay identical to the Next copy; src/lib/rate-limit.test.ts
 * enforces that.
 */
export const RATE_LIMITS = {
  speech: { windows: [3600, 86400], limits: [300, 1500] },
  "ai-text": { windows: [3600, 86400], limits: [120, 600] },
  "ai-image": { windows: [3600, 86400], limits: [20, 60] },
  tts: { windows: [3600, 86400], limits: [600, 3000] },
  "social-search": { windows: [60, 3600], limits: [30, 300] },
  // Per-user ceilings on ordinary writes (progress, quests, learning, chat
  // housekeeping, settings) — far above a heavy study day, low enough to stop
  // scripted XP farming and leaderboard manipulation.
  write: { windows: [3600, 86400], limits: [600, 3000] },
  // Friend requests / responses / removals: blocks request spam.
  "social-write": { windows: [3600, 86400], limits: [60, 300] },
  // Avatar uploads.
  upload: { windows: [3600, 86400], limits: [20, 60] },
  // Personal-data export (DPP6 access requests).
  export: { windows: [3600, 86400], limits: [5, 20] },
} as const;

export type RateLimitBucket = keyof typeof RATE_LIMITS;

/**
 * Records one hit for a verified user. Returns a 429 Response when a window is
 * exceeded, otherwise null. A limiter failure is logged and the request is
 * allowed, so a counter outage does not take study features down.
 */
export async function enforceRateLimit(
  userId: string,
  bucket: RateLimitBucket,
): Promise<Response | null> {
  const { windows, limits } = RATE_LIMITS[bucket];
  const { data, error } = await createAdminClient().rpc("consume_rate_limit", {
    p_user_id: userId,
    p_bucket: bucket,
    p_windows: windows,
    p_limits: limits,
  });

  if (error) {
    console.error(`[rate-limit] ${bucket} check failed: ${error.message}`);
    return null;
  }

  const retryAfter = typeof data === "number" ? data : 0;
  if (retryAfter <= 0) return null;

  return new Response(
    JSON.stringify({ error: "Too many requests. Please wait before trying again." }),
    {
      status: 429,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Retry-After": String(retryAfter),
      },
    },
  );
}
