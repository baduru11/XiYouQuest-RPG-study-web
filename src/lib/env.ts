/**
 * Environment variable accessors with lazy validation.
 *
 * Validation is deferred to the first call so that module evaluation during
 * build-time page-data collection (Vercel) does not throw when server-only
 * env vars are unavailable.
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
      `Add it to your .env.local file or deployment environment.`
    );
  }
  return value;
}

// --- iFlytek (Speech & TTS) ---
export function IFLYTEK_APP_ID() {
  return requireEnv("IFLYTEK_APP_ID");
}
export function IFLYTEK_API_KEY() {
  return requireEnv("IFLYTEK_API_KEY");
}
export function IFLYTEK_API_SECRET() {
  return requireEnv("IFLYTEK_API_SECRET");
}

// --- OpenRouter (DeepSeek V4 Flash primary, Gemini 2.5 Flash fallback, Gemini 2.5 Flash Image for scene art) ---
export function OPENROUTER_API_KEY() {
  return requireEnv("OPENROUTER_API_KEY");
}

// --- Supabase (service role — server-side only) ---
// Prefers Supabase's new secret API key (sb_secret_...) when SUPABASE_SECRET_KEY
// is set. The legacy service_role key is a JWT signed by the legacy HS256
// secret; switching to the new key is what allows that secret to be revoked
// (docs/security/owner-actions.md, OA-1). Unset, behaviour is unchanged.
export function SUPABASE_SERVICE_ROLE_KEY() {
  return process.env.SUPABASE_SECRET_KEY || requireEnv("SUPABASE_SERVICE_ROLE_KEY");
}

// --- Supabase (public project URL + anon key) ---
// NEXT_PUBLIC_* are build-inlined on the client, but on the server these give a
// clear fail-fast error instead of the opaque failure a bare `!` assertion
// produces when a var is missing.
export function SUPABASE_URL() {
  return requireEnv("NEXT_PUBLIC_SUPABASE_URL");
}
export function SUPABASE_ANON_KEY() {
  // New publishable key (sb_publishable_...) when set; see SUPABASE_SERVICE_ROLE_KEY.
  return (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
  );
}
