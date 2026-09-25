import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY } from "@/lib/env";

describe("Supabase key selection (legacy-key retirement, OA-1)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("keeps using the legacy keys until the new ones are configured", () => {
    vi.stubEnv("SUPABASE_SECRET_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "legacy-service");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "legacy-anon");
    expect(SUPABASE_SERVICE_ROLE_KEY()).toBe("legacy-service");
    expect(SUPABASE_ANON_KEY()).toBe("legacy-anon");
  });

  it("prefers the new secret and publishable keys once set", () => {
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_new");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_new");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "legacy-service");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "legacy-anon");
    expect(SUPABASE_SERVICE_ROLE_KEY()).toBe("sb_secret_new");
    expect(SUPABASE_ANON_KEY()).toBe("sb_publishable_new");
  });

  // The edge twin's behaviour, including the platform-injected new keys, is
  // exercised directly in src/lib/edge-env.test.ts; this only pins that it
  // still falls back to the same legacy variable names as the Node helper.
  it("gives the edge runtime the same opt-in and legacy fallback names", () => {
    const edge = readFileSync("supabase/functions/_shared/env.ts", "utf8");
    expect(edge).toContain('Deno.env.get("XYQ_SUPABASE_SECRET_KEY")');
    expect(edge).toContain('requireEnv("SUPABASE_SERVICE_ROLE_KEY")');
    expect(edge).toContain('Deno.env.get("XYQ_SUPABASE_PUBLISHABLE_KEY")');
    expect(edge).toContain('requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY")');
  });
});
