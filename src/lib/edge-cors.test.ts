// @vitest-environment node

import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

// Loaded by path at run time: a static import would pull this Deno module into
// the Next type check, where the `Deno` global does not exist.
const EDGE_CORS_PATH = resolve(process.cwd(), "supabase/functions/_shared/cors.ts");

interface EdgeCors {
  corsHeaders: Record<string, string>;
}

async function loadWithEnv(vars: Record<string, string | undefined>): Promise<EdgeCors> {
  (globalThis as { Deno?: unknown }).Deno = { env: { get: (name: string) => vars[name] } };
  vi.resetModules();
  return (await import(/* @vite-ignore */ EDGE_CORS_PATH)) as EdgeCors;
}

afterEach(() => {
  delete (globalThis as { Deno?: unknown }).Deno;
});

describe("edge CORS origin", () => {
  it("allows only the app origin that issues the tokens", async () => {
    const { corsHeaders } = await loadWithEnv({
      BETTER_AUTH_JWKS_URL: "https://cle-xyq.hkust.edu.hk/api/auth/jwks",
    });
    expect(corsHeaders["Access-Control-Allow-Origin"]).toBe("https://cle-xyq.hkust.edu.hk");
  });

  it("sends no allowed origin at all when the app origin is unknown", async () => {
    for (const vars of [
      {},
      { BETTER_AUTH_JWKS_URL: "not a url" },
      { BETTER_AUTH_JWKS_URL: "file:///etc/jwks" },
    ] as Record<string, string | undefined>[]) {
      const { corsHeaders } = await loadWithEnv(vars);
      expect(corsHeaders).not.toHaveProperty("Access-Control-Allow-Origin");
    }
  });
});

describe("edge functions", () => {
  // Every response must take its CORS headers from _shared/cors.ts; a
  // hand-written Allow-Origin (the old "*") would bypass the pin.
  it("never set Access-Control-Allow-Origin outside the shared helper", () => {
    const root = resolve(process.cwd(), "supabase/functions");
    const offenders: string[] = [];
    for (const dir of readdirSync(root, { withFileTypes: true })) {
      if (!dir.isDirectory()) continue;
      for (const file of readdirSync(join(root, dir.name))) {
        if (!file.endsWith(".ts") || (dir.name === "_shared" && file === "cors.ts")) continue;
        const source = readFileSync(join(root, dir.name, file), "utf8");
        if (source.includes("Access-Control-Allow-Origin")) offenders.push(`${dir.name}/${file}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
