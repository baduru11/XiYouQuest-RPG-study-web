import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getSessionUser = vi.hoisted(() => vi.fn());
const enforceRateLimit = vi.hoisted(() => vi.fn(async () => null));
const logSecurityEvent = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({})), getSessionUser }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit }));
vi.mock("@/lib/security-events", () => ({
  logSecurityEvent,
  requestContext: () => ({ ip: "203.0.113.7", userAgent: "vitest" }),
}));
vi.mock("@/lib/auth", () => ({
  exportAuthRecords: vi.fn(async () => ({ user: { id: "u1" }, sessions: [], accounts: [] })),
}));
vi.mock("@/lib/data-export", () => ({
  collectUserData: vi.fn(async () => ({ format: "xiyouquest-personal-data-export/1", exportedAt: "2026-09-25T00:00:00.000Z" })),
}));

import { GET } from "./route";

const request = () => new NextRequest("https://cle-xyq.hkust.edu.hk/api/profile/export");

describe("GET /api/profile/export", () => {
  beforeEach(() => vi.clearAllMocks());

  it("refuses anonymous callers", async () => {
    getSessionUser.mockResolvedValueOnce(null);
    expect((await GET(request())).status).toBe(401);
  });

  it("is rate limited per user", async () => {
    getSessionUser.mockResolvedValueOnce({ id: "u1", email: "a@ust.hk" });
    enforceRateLimit.mockResolvedValueOnce(new Response(null, { status: 429 }) as never);
    expect((await GET(request())).status).toBe(429);
    expect(enforceRateLimit).toHaveBeenCalledWith("u1", "export");
  });

  it("returns an uncached JSON attachment and records the export", async () => {
    getSessionUser.mockResolvedValueOnce({ id: "u1", email: "a@ust.hk" });
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toMatch(/^attachment; filename="xiyouquest-my-data-2026-09-25\.json"$/);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body.identity.user.id).toBe("u1");
    expect(logSecurityEvent).toHaveBeenCalledWith(expect.objectContaining({ type: "account.export", userId: "u1" }));
  });
});
