export function requireEnv(name: string): string {
  const val = Deno.env.get(name);
  if (!val) throw new Error(`Missing env: ${name}`);
  return val;
}

// Lazy accessors (same pattern as src/lib/env.ts)
export const OPENROUTER_API_KEY = () => requireEnv("OPENROUTER_API_KEY");
export const IFLYTEK_APP_ID = () => requireEnv("IFLYTEK_APP_ID");
export const IFLYTEK_API_KEY = () => requireEnv("IFLYTEK_API_KEY");
export const IFLYTEK_API_SECRET = () => requireEnv("IFLYTEK_API_SECRET");
// One key from a JSON dictionary the platform injects into every function
// (SUPABASE_SECRET_KEYS / SUPABASE_PUBLISHABLE_KEYS, keyed by key name).
function injectedKey(dictionary: string, keyName = "default"): string | undefined {
  const raw = Deno.env.get(dictionary);
  if (!raw) return undefined;
  try {
    const value = (JSON.parse(raw) as Record<string, unknown>)[keyName];
    return typeof value === "string" && value !== "" ? value : undefined;
  } catch {
    return undefined;
  }
}

// Key order: an explicit XYQ_ edge secret (edge secrets cannot use the
// reserved SUPABASE_ prefix), then the new key the platform injects, then the
// injected legacy key. The legacy keys are JWTs signed by the legacy HS256
// secret, which can only be revoked once nothing uses them
// (docs/security/owner-actions.md, OA-1).
export const SUPABASE_SERVICE_ROLE_KEY = () =>
  Deno.env.get("XYQ_SUPABASE_SECRET_KEY") ||
  injectedKey("SUPABASE_SECRET_KEYS") ||
  requireEnv("SUPABASE_SERVICE_ROLE_KEY");
export const SUPABASE_PUBLISHABLE_KEY = () =>
  Deno.env.get("XYQ_SUPABASE_PUBLISHABLE_KEY") ||
  injectedKey("SUPABASE_PUBLISHABLE_KEYS") ||
  requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
