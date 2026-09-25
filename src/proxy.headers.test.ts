import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Security headers in this app are split across two layers:
//   - src/proxy.ts sets Content-Security-Policy per request (it needs a
//     fresh nonce every time, so it cannot be a static header).
//   - next.config.ts's headers() sets the remaining static headers
//     (X-Content-Type-Options, X-Frame-Options, Referrer-Policy,
//     Strict-Transport-Security, Permissions-Policy) once, since they never
//     vary per request.
// A production response carries both. This file tests each layer for what
// it actually emits, then checks the combined set a real response carries.

const getSessionMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: getSessionMock,
    },
  },
}));

import { proxy } from "./proxy";
import nextConfig from "../next.config";

function authedRequest(pathname = "/dashboard"): NextRequest {
  return new NextRequest(`https://cle-xyq.hkust.edu.hk${pathname}`);
}

async function withNodeEnv<T>(value: string, fn: () => Promise<T>): Promise<T> {
  vi.stubEnv("NODE_ENV", value);
  try {
    return await fn();
  } finally {
    vi.unstubAllEnvs();
  }
}

describe("src/proxy.ts: Content-Security-Policy (production)", () => {
  it("stamps a per-request nonce into script-src", async () => {
    await withNodeEnv("production", async () => {
      getSessionMock.mockResolvedValueOnce({ user: { id: "verified-user" } });
      const response = await proxy(authedRequest());

      const csp = response.headers.get("Content-Security-Policy");
      expect(csp).not.toBeNull();
      expect(csp).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
      // No unsafe-inline / unsafe-eval in the production script-src directive
      // specifically — style-src legitimately keeps 'unsafe-inline', so the
      // check is scoped to the script-src segment rather than the whole CSP.
      const scriptSrc = csp?.split(";").find((d) => d.trim().startsWith("script-src"));
      expect(scriptSrc).not.toContain("unsafe-inline");
      expect(scriptSrc).not.toContain("unsafe-eval");
    });
  });

  it("uses a fresh nonce on every response", async () => {
    await withNodeEnv("production", async () => {
      getSessionMock.mockResolvedValue({ user: { id: "verified-user" } });
      const first = await proxy(authedRequest());
      const second = await proxy(authedRequest());

      const firstNonce = first.headers
        .get("Content-Security-Policy")
        ?.match(/nonce-([^']+)/)?.[1];
      const secondNonce = second.headers
        .get("Content-Security-Policy")
        ?.match(/nonce-([^']+)/)?.[1];

      expect(firstNonce).toBeTruthy();
      expect(secondNonce).toBeTruthy();
      expect(firstNonce).not.toBe(secondNonce);
    });
  });

  it("restricts frame-ancestors to 'none' (equivalent to X-Frame-Options: DENY)", async () => {
    await withNodeEnv("production", async () => {
      getSessionMock.mockResolvedValueOnce({ user: { id: "verified-user" } });
      const response = await proxy(authedRequest());

      expect(response.headers.get("Content-Security-Policy")).toContain(
        "frame-ancestors 'none'",
      );
    });
  });

  it("restricts default-src to 'self' as the fallback for object-src (no explicit object-src directive is set)", async () => {
    await withNodeEnv("production", async () => {
      getSessionMock.mockResolvedValueOnce({ user: { id: "verified-user" } });
      const response = await proxy(authedRequest());

      const csp = response.headers.get("Content-Security-Policy") ?? "";
      // The policy does not set object-src explicitly, so it inherits from
      // default-src 'self' — restrictive, but not as tight as an explicit
      // object-src 'none'. Documented here rather than asserted as 'none'
      // so this test fails loudly if that assumption ever changes.
      expect(csp).toContain("default-src 'self'");
      expect(csp).not.toMatch(/object-src/);
    });
  });

  it("restricts base-uri and form-action to 'self'", async () => {
    await withNodeEnv("production", async () => {
      getSessionMock.mockResolvedValueOnce({ user: { id: "verified-user" } });
      const response = await proxy(authedRequest());

      const csp = response.headers.get("Content-Security-Policy") ?? "";
      expect(csp).toContain("base-uri 'self'");
      expect(csp).toContain("form-action 'self'");
    });
  });
});

describe("next.config.ts headers(): static security headers", () => {
  it("sets X-Content-Type-Options: nosniff", async () => {
    const [{ headers }] = await nextConfig.headers!();
    expect(headers).toContainEqual({ key: "X-Content-Type-Options", value: "nosniff" });
  });

  it("sets X-Frame-Options: DENY", async () => {
    const [{ headers }] = await nextConfig.headers!();
    expect(headers).toContainEqual({ key: "X-Frame-Options", value: "DENY" });
  });

  it("sets a restrictive Referrer-Policy", async () => {
    const [{ headers }] = await nextConfig.headers!();
    const referrerPolicy = headers.find((h) => h.key === "Referrer-Policy");
    expect(referrerPolicy?.value).toBe("strict-origin-when-cross-origin");
  });

  it("sets Strict-Transport-Security with max-age >= 31536000 and includeSubDomains", async () => {
    const [{ headers }] = await nextConfig.headers!();
    const hsts = headers.find((h) => h.key === "Strict-Transport-Security");
    expect(hsts).toBeDefined();

    const maxAgeMatch = hsts?.value.match(/max-age=(\d+)/);
    expect(maxAgeMatch).not.toBeNull();
    expect(Number(maxAgeMatch?.[1])).toBeGreaterThanOrEqual(31536000);
    expect(hsts?.value).toContain("includeSubDomains");
  });

  it("sets a Permissions-Policy header", async () => {
    const [{ headers }] = await nextConfig.headers!();
    const permissionsPolicy = headers.find((h) => h.key === "Permissions-Policy");
    expect(permissionsPolicy).toBeDefined();
    expect(permissionsPolicy?.value.length).toBeGreaterThan(0);
  });

  it("applies the header set to every path via the catch-all source", async () => {
    const [{ source }] = await nextConfig.headers!();
    expect(source).toBe("/(.*)");
  });
});

describe("combined production response: every header the deliverable asks for", () => {
  it("carries CSP (with nonce, frame-ancestors 'none') plus the next.config static headers together", async () => {
    await withNodeEnv("production", async () => {
      getSessionMock.mockResolvedValueOnce({ user: { id: "verified-user" } });
      const proxyResponse = await proxy(authedRequest());
      const [{ headers: staticHeaders }] = await nextConfig.headers!();

      // proxy.ts's own header.
      const csp = proxyResponse.headers.get("Content-Security-Policy");
      expect(csp).toMatch(/nonce-/);
      expect(csp).toContain("frame-ancestors 'none'");

      // next.config.ts's static headers — Next.js merges these onto every
      // response server-side; this test reads the config directly since a
      // unit test of proxy() alone never executes Next's header-merging
      // pipeline.
      const byKey = Object.fromEntries(staticHeaders.map((h) => [h.key, h.value]));
      expect(byKey["X-Content-Type-Options"]).toBe("nosniff");
      expect(byKey["X-Frame-Options"]).toBe("DENY");
      expect(byKey["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
      expect(byKey["Strict-Transport-Security"]).toMatch(/max-age=\d+/);
      expect(byKey["Permissions-Policy"]).toBeTruthy();
    });
  });
});
