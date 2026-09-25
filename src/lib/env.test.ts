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

  it("gives the edge runtime the same opt-in", () => {
    const edge = readFileSync("supabase/functions/_shared/env.ts", "utf8");
    expect(edge).toContain('Deno.env.get("XYQ_SUPABASE_SECRET_KEY") || requireEnv("SUPABASE_SERVICE_ROLE_KEY")');
    expect(edge).toContain('Deno.env.get("XYQ_SUPABASE_PUBLISHABLE_KEY") || requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY")');
  });
});
