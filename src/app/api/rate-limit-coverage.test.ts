import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Every API handler that writes user data or calls a paid provider must hit the
// per-user limiter after authenticating. The first rate-limit pass missed
// learning/checkpoint/complete because only edge functions were tested, so this
// discovers every route file instead of listing the ones someone remembered.

const API_ROOT = path.resolve(__dirname);

// Handlers deliberately left unmetered, with the reason. Anything not listed
// here and exporting POST/PUT/PATCH/DELETE must call enforceRateLimit.
const EXEMPT: Record<string, string> = {
  "auth/[...all]": "Better Auth handler; its own origin checks and flow state apply",
  "auth/delete-account": "Erasure right; a deleted user cannot repeat it",
  "chat/resume": "Read-only despite POST; returns the caller's own session",
};

// GET handlers that are metered because they allow directory enumeration.
const METERED_READS = ["social/lookup", "social/search"];

function routeFiles(dir: string, prefix = ""): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    const rel = prefix ? `${prefix}/${name}` : name;
    if (statSync(full).isDirectory()) return routeFiles(full, rel);
    return name === "route.ts" ? [prefix] : [];
  });
}

function handlerBodies(source: string): Map<string, string> {
  const bodies = new Map<string, string>();
  const matches = [...source.matchAll(/export async function (GET|POST|PUT|PATCH|DELETE)\b/g)];
  matches.forEach((match, i) => {
    const end = i + 1 < matches.length ? matches[i + 1].index : source.length;
    bodies.set(match[1], source.slice(match.index, end));
  });
  return bodies;
}

describe("Next API rate-limit coverage", () => {
  const routes = routeFiles(API_ROOT);

  it("discovers the route tree", () => {
    expect(routes.length).toBeGreaterThanOrEqual(40);
  });

  it.each(routes.filter((r) => !(r in EXEMPT)))(
    "%s meters every mutating handler after authenticating",
    (route) => {
      const source = readFileSync(path.join(API_ROOT, route, "route.ts"), "utf8");
      for (const [method, body] of handlerBodies(source)) {
        const mustMeter = method !== "GET" || METERED_READS.includes(route);
        if (!mustMeter) continue;
        const auth = body.indexOf("getSessionUser()");
        const limit = body.indexOf("enforceRateLimit(user.id");
        expect(auth, `${route} ${method} authenticates`).toBeGreaterThan(-1);
        expect(limit, `${route} ${method} is rate limited`).toBeGreaterThan(auth);
      }
    },
  );

  it("keeps the exemption list honest", () => {
    for (const route of Object.keys(EXEMPT)) {
      expect(routes, `${route} still exists`).toContain(route);
    }
  });
});
