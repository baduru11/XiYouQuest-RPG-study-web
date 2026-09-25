import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import fs from "node:fs";
import path from "node:path";

// Every route module is dynamically imported below, so every non-relative
// import any route file can reach must be safe to load (or mocked) with no
// session and no real backend.
const { createClient, getSessionUser } = vi.hoisted(() => ({
  createClient: vi.fn(),
  getSessionUser: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient, getSessionUser }));

vi.mock("@/lib/rate-limit", () => ({
  enforceRateLimit: vi.fn().mockResolvedValue(null),
}));

// auth.ts builds a real `pg` Pool and a full Better Auth instance (HKUST OIDC
// config) at module scope. Mocking it mirrors the existing convention in
// src/proxy.test.ts, and keeps this test from touching real connection
// config while importing src/app/api/auth/delete-account/route.ts.
vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: vi.fn().mockResolvedValue(null) } },
  deleteAuthUser: vi.fn(),
}));

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

const API_ROOT = path.join(process.cwd(), "src", "app", "api");

function discoverRouteFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...discoverRouteFiles(fullPath));
    } else if (entry.isFile() && entry.name === "route.ts") {
      found.push(fullPath);
    }
  }
  return found;
}

// Better Auth's own catch-all handler (sign-in, OAuth callback, JWKS, token
// exchange) is the one route that MUST stay reachable without a session —
// every other route in the tree is expected to reject an unauthenticated
// caller.
const EXCLUDED_SEGMENT = "[...all]";

const routeFiles = discoverRouteFiles(API_ROOT).filter(
  (file) => !file.split(path.sep).includes(EXCLUDED_SEGMENT),
);

function toApiPath(file: string): string {
  const rel = path.relative(API_ROOT, file).split(path.sep).join("/");
  return `/api/${rel.replace(/\/route\.ts$/, "")}`;
}

function toImportSpecifier(file: string): string {
  const rel = path.relative(API_ROOT, file).split(path.sep).join("/");
  return `./${rel}`;
}

// Proves no DB access happens before the auth check: any method call on the
// "client" throws instead of silently returning undefined data.
function throwingSupabaseStub(): unknown {
  return new Proxy(
    {},
    {
      get(_target, prop) {
        // `mockResolvedValue` wraps this stub in a Promise; the Promise
        // adoption algorithm probes any resolved value for a callable
        // `.then` (and other well-known symbols) to decide whether to treat
        // it as a thenable. A catch-all trap would make the stub look
        // thenable and self-trigger before the route ever runs, so those
        // property reads must pass through untouched.
        if (prop === "then" || typeof prop === "symbol") {
          return undefined;
        }
        return () => {
          throw new Error(
            `Unexpected Supabase client call '${String(prop)}' before the route's auth check`,
          );
        };
      },
    },
  );
}

beforeEach(() => {
  getSessionUser.mockReset().mockResolvedValue(null);
  createClient.mockReset().mockResolvedValue(throwingSupabaseStub());
});

describe("API route discovery", () => {
  it("discovers at least 39 protected route files (guards against a deleted route or a broken glob)", () => {
    expect(routeFiles.length).toBeGreaterThanOrEqual(39);
  });

  it("every discovered route file performs a getSessionUser() auth check", () => {
    for (const file of routeFiles) {
      const source = fs.readFileSync(file, "utf8");
      expect(
        source,
        `${file} does not reference getSessionUser()`,
      ).toContain("getSessionUser");
    }
  });
});

describe("authorization matrix: every route rejects an unauthenticated caller", () => {
  for (const file of routeFiles) {
    const apiPath = toApiPath(file);
    const importSpecifier = toImportSpecifier(file);

    it(apiPath, async () => {
      const mod: Record<string, unknown> = await import(importSpecifier);
      const methodsFound = HTTP_METHODS.filter(
        (method) => typeof mod[method] === "function",
      );

      expect(
        methodsFound.length,
        `${apiPath} does not export any of GET/POST/PUT/PATCH/DELETE`,
      ).toBeGreaterThan(0);

      for (const method of methodsFound) {
        const request = new NextRequest(
          `https://test.example.com${apiPath}`,
          { method },
        );
        const handler = mod[method] as (
          req: NextRequest,
          ctx: { params: Promise<Record<string, string>> },
        ) => Promise<Response>;
        const response = await handler(request, {
          params: Promise.resolve({}),
        });

        expect(
          response.status,
          `${method} ${apiPath} returned ${response.status} for an unauthenticated caller, expected 401`,
        ).toBe(401);
      }
    });
  }
});
