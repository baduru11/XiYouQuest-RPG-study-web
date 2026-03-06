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
export const SUPABASE_SERVICE_ROLE_KEY = () =>
  requireEnv("SUPABASE_SERVICE_ROLE_KEY");
