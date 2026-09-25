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
// Prefers the new secret API key when the XYQ_SUPABASE_SECRET_KEY edge secret is
// set (edge secrets cannot use the reserved SUPABASE_ prefix). The injected
// legacy key is a JWT signed by the legacy HS256 secret, which can only be
// revoked once nothing uses it (docs/security/owner-actions.md, OA-1).
export const SUPABASE_SERVICE_ROLE_KEY = () =>
  Deno.env.get("XYQ_SUPABASE_SECRET_KEY") || requireEnv("SUPABASE_SERVICE_ROLE_KEY");
export const SUPABASE_PUBLISHABLE_KEY = () =>
  Deno.env.get("XYQ_SUPABASE_PUBLISHABLE_KEY") || requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
