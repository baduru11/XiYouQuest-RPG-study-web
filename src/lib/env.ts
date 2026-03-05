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

// --- OpenRouter (DeepSeek) ---
export function OPENROUTER_API_KEY() {
  return requireEnv("OPENROUTER_API_KEY");
}

// --- Supabase (service role — server-side only) ---
export function SUPABASE_SERVICE_ROLE_KEY() {
  return requireEnv("SUPABASE_SERVICE_ROLE_KEY");
}
