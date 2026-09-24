import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const getSessionMock = vi.hoisted(() => vi.fn(async () => ({ user: { id: "verified-user" } })));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: getSessionMock } } }));

import { isCrossSiteWrite, proxy } from "./proxy";

const APP = "https://cle-xyq.hkust.edu.hk";

function request(path: string, method: string, headers: Record<string, string> = {}) {
  return new NextRequest(`${APP}${path}`, { method, headers });
}

describe("cross-site write guard", () => {
  it.each([
    ["cross-site", "POST", "/api/progress/update"],
    ["same-site", "POST", "/api/social/request"],
    ["cross-site", "DELETE", "/api/social/remove"],
    ["same-site", "DELETE", "/api/auth/delete-account"],
  ])("refuses a %s %s to %s", async (site, method, path) => {
    const response = await proxy(request(path, method, { "sec-fetch-site": site }));
    expect(response.status).toBe(403);
  });

  it("allows a same-origin write through to the route", async () => {
    const response = await proxy(
      request("/api/progress/update", "POST", { "sec-fetch-site": "same-origin" }),
    );
    expect(response.status).not.toBe(403);
  });

  it("falls back to Origin when Sec-Fetch-Site is absent", () => {
    expect(isCrossSiteWrite(request("/api/chat/end", "POST", { origin: "https://evil.hkust.edu.hk" }))).toBe(true);
    expect(isCrossSiteWrite(request("/api/chat/end", "POST", { origin: APP }))).toBe(false);
  });

  it("leaves non-browser clients to the session check", () => {
    expect(isCrossSiteWrite(request("/api/chat/end", "POST"))).toBe(false);
  });

  it("never blocks reads, pages, or Better Auth's own endpoints", () => {
    const crossSite = { "sec-fetch-site": "cross-site" };
    expect(isCrossSiteWrite(request("/api/leaderboard?tab=xp&scope=global", "GET", crossSite))).toBe(false);
    expect(isCrossSiteWrite(request("/dashboard", "POST", crossSite))).toBe(false);
    expect(isCrossSiteWrite(request("/api/auth/oauth2/callback/hkust", "POST", crossSite))).toBe(false);
  });
});

describe("public paths", () => {
  it("serves the privacy notice without a session", async () => {
    getSessionMock.mockResolvedValueOnce(null as never);
    const response = await proxy(request("/privacy", "GET"));
    expect(response.status).toBe(200);
  });

  it("does not treat a lookalike prefix as public", async () => {
    getSessionMock.mockResolvedValueOnce(null as never);
    const response = await proxy(request("/login-admin", "GET"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`${APP}/login`);
  });
});
