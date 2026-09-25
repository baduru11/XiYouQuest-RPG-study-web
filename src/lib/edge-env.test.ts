// @vitest-environment node

import { resolve } from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

// Loaded by path at run time: a static import would pull this Deno module into
// the Next type check, where the `Deno` global does not exist.
const EDGE_ENV_PATH = resolve(process.cwd(), "supabase/functions/_shared/env.ts");

interface EdgeEnv {
  SUPABASE_SERVICE_ROLE_KEY: () => string;
  SUPABASE_PUBLISHABLE_KEY: () => string;
}

let SUPABASE_SERVICE_ROLE_KEY: EdgeEnv["SUPABASE_SERVICE_ROLE_KEY"];
let SUPABASE_PUBLISHABLE_KEY: EdgeEnv["SUPABASE_PUBLISHABLE_KEY"];

beforeAll(async () => {
  const edge = (await import(/* @vite-ignore */ EDGE_ENV_PATH)) as EdgeEnv;
  SUPABASE_SERVICE_ROLE_KEY = edge.SUPABASE_SERVICE_ROLE_KEY;
  SUPABASE_PUBLISHABLE_KEY = edge.SUPABASE_PUBLISHABLE_KEY;
});

// The edge helper reads Deno.env lazily, so a stub installed per test is
// enough to exercise it under Node.
function withDenoEnv(vars: Record<string, string>) {
  (globalThis as { Deno?: unknown }).Deno = { env: { get: (name: string) => vars[name] } };
}

afterEach(() => {
  delete (globalThis as { Deno?: unknown }).Deno;
});

describe("edge Supabase key selection", () => {
  it("prefers an explicitly configured XYQ secret", () => {
    withDenoEnv({
      XYQ_SUPABASE_SECRET_KEY: "sb_secret_explicit",
      SUPABASE_SECRET_KEYS: JSON.stringify({ default: "sb_secret_injected" }),
      SUPABASE_SERVICE_ROLE_KEY: "legacy-service-jwt",
    });
    expect(SUPABASE_SERVICE_ROLE_KEY()).toBe("sb_secret_explicit");
  });

  // Supabase injects the new keys as JSON dictionaries keyed by name, so the
  // functions can leave the legacy keys without anyone copying a key.
  it("uses the platform-injected default secret key", () => {
    withDenoEnv({
      SUPABASE_SECRET_KEYS: JSON.stringify({ default: "sb_secret_injected" }),
      SUPABASE_SERVICE_ROLE_KEY: "legacy-service-jwt",
    });
    expect(SUPABASE_SERVICE_ROLE_KEY()).toBe("sb_secret_injected");
  });

  it("uses the platform-injected default publishable key", () => {
    withDenoEnv({
      SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ default: "sb_publishable_injected" }),
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "legacy-anon-jwt",
    });
    expect(SUPABASE_PUBLISHABLE_KEY()).toBe("sb_publishable_injected");
  });

  it("falls back to the legacy keys when the dictionary is missing, malformed or has no default", () => {
    withDenoEnv({ SUPABASE_SERVICE_ROLE_KEY: "legacy-service-jwt" });
    expect(SUPABASE_SERVICE_ROLE_KEY()).toBe("legacy-service-jwt");

    withDenoEnv({ SUPABASE_SECRET_KEYS: "{not json", SUPABASE_SERVICE_ROLE_KEY: "legacy-service-jwt" });
    expect(SUPABASE_SERVICE_ROLE_KEY()).toBe("legacy-service-jwt");

    withDenoEnv({
      SUPABASE_SECRET_KEYS: JSON.stringify({ other: "sb_secret_other" }),
      SUPABASE_SERVICE_ROLE_KEY: "legacy-service-jwt",
    });
    expect(SUPABASE_SERVICE_ROLE_KEY()).toBe("legacy-service-jwt");
  });

  it("fails loudly when no key is available at all", () => {
    withDenoEnv({});
    expect(() => SUPABASE_SERVICE_ROLE_KEY()).toThrow("Missing env: SUPABASE_SERVICE_ROLE_KEY");
  });
});
