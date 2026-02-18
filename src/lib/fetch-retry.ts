/**
 * Drop-in replacement for fetch() with automatic retry on transient errors.
 * Retries on 429 (Too Many Requests), 500, 502, 503 status codes and network failures.
 * Uses exponential backoff with jitter. Respects Retry-After header.
 */

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503]);

interface RetryOptions {
  /** Max retry attempts (default: 3) */
  maxRetries?: number;
  /** Base delay in ms before first retry (default: 1000) */
  baseDelayMs?: number;
}

export async function fetchWithRetry(
  input: string | URL | Request,
  init?: RequestInit,
  { maxRetries = 3, baseDelayMs = 1000 }: RetryOptions = {}
): Promise<Response> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(input, init);

      if (RETRYABLE_STATUSES.has(response.status) && attempt < maxRetries) {
        const retryAfter = response.headers.get("Retry-After");
        const delay = retryAfter
          ? parseInt(retryAfter, 10) * 1000
          : baseDelayMs * 2 ** attempt * (0.5 + Math.random() * 0.5);

        console.warn(
          `[fetchWithRetry] ${response.status} on attempt ${attempt + 1}, retrying in ${Math.round(delay)}ms…`
        );
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      return response;
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxRetries) {
        const delay =
          baseDelayMs * 2 ** attempt * (0.5 + Math.random() * 0.5);
        console.warn(
          `[fetchWithRetry] Network error on attempt ${attempt + 1}, retrying in ${Math.round(delay)}ms…`,
          (error as Error).message
        );
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  throw lastError ?? new Error("Request failed after retries");
}
