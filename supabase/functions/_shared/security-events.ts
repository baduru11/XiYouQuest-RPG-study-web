import { createAdminClient } from "./supabase.ts";

/**
 * Edge twin of src/lib/security-events.ts: records an event through the
 * append-only log_security_event function. Never throws.
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

export async function logSecurityEvent(event: SecurityEvent): Promise<void> {
  try {
    const { error } = await createAdminClient().rpc("log_security_event", {
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
