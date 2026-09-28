// @vitest-environment node

import { resolve } from "node:path";
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

  it("never falls back to a wildcard", async () => {
    for (const vars of [{}, { BETTER_AUTH_JWKS_URL: "not a url" }] as Record<string, string | undefined>[]) {
      const { corsHeaders } = await loadWithEnv(vars);
      expect(corsHeaders["Access-Control-Allow-Origin"]).toBe("null");
    }
  });
});
