import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } from "@/lib/env";
import { logSecurityEvent } from "@/lib/security-events";

/**
 * Per-user rate limits for paid providers and abuse-prone reads.
 *
 * Enforced in Postgres by `consume_rate_limit` so the Next route and the edge
 * function twin of an endpoint share one counter. The edge copy of this table
 * lives in supabase/functions/_shared/rate-limit.ts and is kept identical by
 * src/lib/rate-limit.test.ts.
 *
 * Limits are sized well above a heavy legitimate study session (a full mock
 * exam is ~60 speech assessments) and exist to stop scripted cost exhaustion.
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
} as const satisfies Record<string, { windows: readonly number[]; limits: readonly number[] }>;

export type RateLimitBucket = keyof typeof RATE_LIMITS;

/**
 * Records one hit for `userId` in `bucket`. Returns a 429 response when a
 * window is exceeded, otherwise null.
 *
 * Call only after the session user has been verified. If the limiter itself
 * fails, the request is allowed and the failure is logged: an outage of the counter must not take the study features down.
 */
export async function enforceRateLimit(
  userId: string,
  bucket: RateLimitBucket,
): Promise<NextResponse | null> {
  const { windows, limits } = RATE_LIMITS[bucket];
  const admin = createClient(SUPABASE_URL(), SUPABASE_SERVICE_ROLE_KEY(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await admin.rpc("consume_rate_limit", {
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

  await logSecurityEvent({
    type: "rate_limit.exceeded",
    userId,
    detail: { bucket, retryAfter, runtime: "next" },
  });
  return NextResponse.json(
    { error: "Too many requests. Please wait before trying again." },
    { status: 429, headers: { "Retry-After": String(retryAfter) } },
  );
}
