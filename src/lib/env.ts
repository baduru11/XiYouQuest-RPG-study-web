/** Require an environment variable at runtime. Throws with a clear message if missing. */
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
export const IFLYTEK_APP_ID = requireEnv("IFLYTEK_APP_ID");
export const IFLYTEK_API_KEY = requireEnv("IFLYTEK_API_KEY");
export const IFLYTEK_API_SECRET = requireEnv("IFLYTEK_API_SECRET");

// --- Google Gemini ---
export const GEMINI_API_KEY = requireEnv("GEMINI_API_KEY");
