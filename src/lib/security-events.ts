import { createClient } from "@supabase/supabase-js";

import { SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } from "@/lib/env";

/**
 * Append-only security event log (supabase/migrations/20260925090000_security_events.sql).
 *
 * Events are written through the SECURITY DEFINER function log_security_event;
 * the app holds no privilege on the table, so it can add to the record but not
 * read, change or erase it. The edge twin lives in
 * supabase/functions/_shared/security-events.ts.
 */
export type SecurityEventType =
  | "auth.sign_in"
  | "auth.sign_in_denied"
  | "account.delete"
  | "account.export"
  | "rate_limit.exceeded"
  | "profile.avatar_upload";

export interface SecurityEvent {
  type: SecurityEventType;
  userId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  detail?: Record<string, string | number | boolean | null>;
}

/**
 * Records one event. Never throws: a logging outage is reported to the runtime
 * log and must not break sign-in, erasure or the request that triggered it.
 */
export async function logSecurityEvent(event: SecurityEvent): Promise<void> {
  try {
    const admin = createClient(SUPABASE_URL(), SUPABASE_SERVICE_ROLE_KEY(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await admin.rpc("log_security_event", {
      p_event_type: event.type,
      p_user_id: event.userId ?? null,
      p_ip_address: event.ip ?? null,
      p_user_agent: event.userAgent ?? null,
      p_detail: event.detail ?? {},
    });
    if (error) {
      console.error(`[security-events] ${event.type} not recorded: ${error.message}`);
    }
  } catch (error) {
    console.error(
      `[security-events] ${event.type} not recorded:`,
      error instanceof Error ? error.message : error,
    );
  }
}

/** Client address and agent as Vercel's edge reports them. */
export function requestContext(headers: Headers): { ip: string | null; userAgent: string | null } {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return {
    ip: forwarded || headers.get("x-real-ip") || null,
    userAgent: headers.get("user-agent"),
  };
}
