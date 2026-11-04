import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Zod messages quote the rejected value ("received '<x>'"), so returning them
// echoes attacker input in the response. The ITSO scan flagged this on
// /api/leaderboard; no client reads the details, so 400s carry a fixed message.

const API_ROOT = path.resolve(__dirname);

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return routeFiles(full);
    return name === "route.ts" ? [full] : [];
  });
}

describe("API validation errors", () => {
  const files = routeFiles(API_ROOT);

  it("discovers the route tree", () => {
    expect(files.length).toBeGreaterThanOrEqual(40);
  });

  it.each(files.map((f) => path.relative(API_ROOT, f)))("%s does not return Zod error text", (rel) => {
    const source = readFileSync(path.join(API_ROOT, rel), "utf8");
    expect(source).not.toMatch(/error\.(flatten|format)\(|error\.issues|error\.errors/);
  });
});
