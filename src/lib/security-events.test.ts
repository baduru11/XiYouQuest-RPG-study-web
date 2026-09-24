import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ rpc }) }));

import { logSecurityEvent, requestContext } from "@/lib/security-events";

describe("logSecurityEvent", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";
  });
  afterEach(() => rpc.mockReset());

  it("writes through the append-only function", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await logSecurityEvent({ type: "account.export", userId: "u1", ip: "203.0.113.7", detail: { a: 1 } });
    expect(rpc).toHaveBeenCalledWith("log_security_event", {
      p_event_type: "account.export",
      p_user_id: "u1",
      p_ip_address: "203.0.113.7",
      p_user_agent: null,
      p_detail: { a: 1 },
    });
  });

  it("never throws when the log is unavailable", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    rpc.mockResolvedValueOnce({ data: null, error: { message: "function does not exist" } });
    await expect(logSecurityEvent({ type: "auth.sign_in" })).resolves.toBeUndefined();
    rpc.mockRejectedValueOnce(new Error("network"));
    await expect(logSecurityEvent({ type: "auth.sign_in" })).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledTimes(2);
    log.mockRestore();
  });
});

describe("requestContext", () => {
  it("takes the first forwarded address and the user agent", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1", "user-agent": "UA" });
    expect(requestContext(headers)).toEqual({ ip: "203.0.113.7", userAgent: "UA" });
  });

  it("returns nulls when the headers are absent", () => {
    expect(requestContext(new Headers())).toEqual({ ip: null, userAgent: null });
  });
});
