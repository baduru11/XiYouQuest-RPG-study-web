import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ rpc }),
}));

import { RATE_LIMITS, enforceRateLimit } from "@/lib/rate-limit";

const root = path.resolve(__dirname, "../..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");

/** Extracts `const NAME = { ... }` and strips whitespace so formatting differences don't matter. */
function objectLiteral(source: string, name: string): string {
  const start = source.indexOf(`const ${name} = {`);
  if (start === -1) throw new Error(`${name} not found`);
  let depth = 0;
  for (let i = source.indexOf("{", start); i < source.length; i++) {
    if (source[i] === "{") depth++;
    if (source[i] === "}" && --depth === 0) {
      return source.slice(start, i + 1).replace(/\s+/g, "");
    }
  }
  throw new Error(`${name} is unterminated`);
}

describe("dual-runtime security constants stay identical", () => {
  it("RATE_LIMITS matches the edge copy", () => {
    expect(objectLiteral(read("supabase/functions/_shared/rate-limit.ts"), "RATE_LIMITS")).toBe(
      objectLiteral(read("src/lib/rate-limit.ts"), "RATE_LIMITS"),
    );
  });

  it("OPENROUTER_PROVIDER_POLICY matches in every OpenRouter client", () => {
    const files = [
      "src/lib/gemini/client.ts",
      "src/lib/image-gen/client.ts",
      "supabase/functions/_shared/ai-client.ts",
      "supabase/functions/_shared/image-gen.ts",
    ];
    const literals = files.map((f) => objectLiteral(read(f), "OPENROUTER_PROVIDER_POLICY"));
    expect(new Set(literals).size).toBe(1);
    expect(literals[0]).toContain('data_collection:"deny"');
    expect(literals[0]).toContain("zdr:true");
  });

  it("pins every edge npm: import to the exact version the Node tests run against", () => {
    const found = execSync("git grep -hoE '\"npm:[^\"]+\"' -- supabase/functions", { encoding: "utf8" })
      .split("\n")
      .filter(Boolean)
      .map((s) => s.slice(5, -1));
    expect(found.length).toBeGreaterThan(0);
    for (const spec of new Set(found)) {
      const at = spec.lastIndexOf("@");
      expect(at, `${spec} carries a version`).toBeGreaterThan(0);
      const [name, version] = [spec.slice(0, at), spec.slice(at + 1)];
      expect(version, spec).toMatch(/^\d+\.\d+\.\d+$/);
      const installed = JSON.parse(read(`node_modules/${name}/package.json`)).version;
      expect(version, `${name} matches node_modules`).toBe(installed);
    }
  });

  it("every OpenRouter request body carries the provider policy", () => {
    for (const f of [
      "src/lib/gemini/client.ts",
      "src/lib/image-gen/client.ts",
      "supabase/functions/_shared/ai-client.ts",
      "supabase/functions/_shared/image-gen.ts",
    ]) {
      const src = read(f);
      const bodies = src.split("JSON.stringify({").length - 1;
      const policies = src.split("provider: OPENROUTER_PROVIDER_POLICY").length - 1;
      expect(policies, f).toBe(bodies);
    }
  });

  it("every paid edge function enforces a rate limit after verifying the user", () => {
    for (const fn of [
      "ai-feedback", "ai-insights", "ai-mock-exam-feedback", "chat-generate-image",
      "chat-respond", "chat-start", "learning-generate-plan", "speech-assess",
      "speech-c5-assess", "tts-companion", "tts-speak",
    ]) {
      const src = read(`supabase/functions/${fn}/index.ts`);
      const verify = src.indexOf("verifyUser(req)");
      const limit = src.indexOf("enforceRateLimit(user.id");
      expect(verify, fn).toBeGreaterThan(-1);
      expect(limit, fn).toBeGreaterThan(verify);
    }
  });
});

describe("enforceRateLimit", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";
  });
  afterEach(() => rpc.mockReset());

  it("allows the request when every window has room", async () => {
    rpc.mockResolvedValue({ data: 0, error: null });
    expect(await enforceRateLimit("user-1", "speech")).toBeNull();
    expect(rpc).toHaveBeenCalledWith("consume_rate_limit", {
      p_user_id: "user-1",
      p_bucket: "speech",
      p_windows: RATE_LIMITS.speech.windows,
      p_limits: RATE_LIMITS.speech.limits,
    });
  });

  it("returns 429 with Retry-After when a window is exceeded", async () => {
    rpc.mockResolvedValue({ data: 42, error: null });
    const res = await enforceRateLimit("user-1", "ai-image");
    expect(res?.status).toBe(429);
    expect(res?.headers.get("Retry-After")).toBe("42");
  });

  it("fails open and logs when the counter is unavailable", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    expect(await enforceRateLimit("user-1", "tts")).toBeNull();
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});
