/**
 * Provider tokens are never persisted.
 *
 * getUserInfo (src/lib/auth.ts) verifies the live Entra id_token during the
 * sign-in exchange, and nothing in the app reads a stored token afterwards.
 * Better Auth 1.6 encrypts only the access and refresh tokens
 * (`account.encryptOAuthTokens`) and writes the id_token (name, UPN, oid, tid)
 * in plaintext on every sign-in, so the account hooks drop all of them before
 * the row is written. Storing nothing is the data-minimisation answer (PDPO
 * DPP2/DPP4) and keeps posture check DB-6 true after every sign-in.
 */
export const EMPTY_PROVIDER_TOKENS = {
  accessToken: null,
  refreshToken: null,
  idToken: null,
  accessTokenExpiresAt: null,
  refreshTokenExpiresAt: null,
} as const;

export function withoutProviderTokens<T extends Record<string, unknown>>(
  account: T,
): T & typeof EMPTY_PROVIDER_TOKENS {
  return { ...account, ...EMPTY_PROVIDER_TOKENS };
}
