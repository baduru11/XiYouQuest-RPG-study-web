// Server-side Better Auth instance. Mounted by the catch-all route at
// `app/api/auth/[...all]/route.ts`.
//
// Architecture notes (HKUST SSO migration — see docs/oidc-redirect-uris.md):
// - Sign-in is HKUST OIDC (Microsoft Entra, staff tenant) ONLY. No
//   email/password, no social providers.
// - Better Auth tables (user, session, account, verification, jwks) live in
//   the `better_auth` schema of the SAME Supabase Postgres that holds app
//   data. The `auth` schema is owned by (now-dormant) Supabase Auth and must
//   not be touched.
// - User ids are UUIDs (generateId below) so `public.profiles.id uuid` and
//   every `auth.uid() = user_id` RLS policy keep working: Supabase is
//   configured to trust this instance's JWKS (third-party auth), and
//   `auth.uid()` reads the JWT `sub` claim.
// - The jwt plugin signs ES256 — Supabase verifies RS256/ES256, NOT
//   better-auth's EdDSA default.

import { betterAuth } from "better-auth";
import { jwt, genericOAuth } from "better-auth/plugins";
import { APIError } from "better-auth/api";
import { createClient } from "@supabase/supabase-js";
import { Pool } from "pg";
import { createRemoteJWKSet, decodeJwt, jwtVerify } from "jose";

import { buildAuthPoolConnection } from "@/lib/db-tls";
import { withoutProviderTokens } from "@/lib/oauth-token-hygiene";
import { SUPABASE_SERVICE_ROLE_KEY } from "@/lib/env";

// The localhost fallback is a convenience for local dev ONLY. In production a
// missing BETTER_AUTH_DATABASE_URL must fail loudly rather than silently
// connect to a non-existent local DB (which surfaces as opaque hung requests).
if (
  process.env.NODE_ENV === "production" &&
  !process.env.BETTER_AUTH_DATABASE_URL
) {
  throw new Error(
    "BETTER_AUTH_DATABASE_URL is required in production (Better Auth tables).",
  );
}

// buildAuthPoolConnection forces the Supabase TRANSACTION pooler port (6543;
// the session pooler caps at 15 clients and is exhausted under serverless
// concurrency) and pins TLS: the chain must verify against Supabase's root CA
// with hostname checking on. Identity, session and OAuth rows cross the public
// internet between Vercel and the database, so plaintext or unverified TLS is
// not acceptable for this High-risk data (HKUST ITSO MSS, secure transport).
// The transaction pooler still honors the `search_path` startup option, so the
// better_auth schema resolves. Keep `max` small so each Vercel instance holds
// few connections.
const { connectionString, ssl } = buildAuthPoolConnection(
  process.env.BETTER_AUTH_DATABASE_URL ??
    "postgresql://postgres:postgres@localhost:54322/postgres",
);
const pool = new Pool({
  connectionString,
  ssl,
  options: "-c search_path=better_auth,public",
  max: 3,
  idleTimeoutMillis: 20_000,
  connectionTimeoutMillis: 10_000,
});

// Single source of truth for the app's own origin: Better Auth's baseURL and
// the sole trustedOrigin (server-side backstop against crafted cross-origin
// callback / redirect URLs).
const baseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

// Fail fast in production if the session secret is missing — otherwise Better
// Auth generates a per-process secret and sessions break on every deploy.
if (process.env.NODE_ENV === "production" && !process.env.BETTER_AUTH_SECRET) {
  throw new Error(
    "BETTER_AUTH_SECRET is required in production. Generate with `openssl rand -base64 32`.",
  );
}

/**
 * Delete the Better Auth user row (and, via ON DELETE CASCADE, its sessions
 * and OAuth accounts). Used by the account-deletion route after it has removed
 * the user's application data. Replaces Supabase's `admin.auth.admin.deleteUser`.
 */
export async function deleteAuthUser(userId: string): Promise<void> {
  await pool.query('DELETE FROM better_auth."user" WHERE id = $1', [userId]);
}

const ALLOWED_EMAIL_DOMAINS = ["ust.hk", "connect.ust.hk"];

function isAllowedEmail(email: string): boolean {
  const domain = email.toLowerCase().split("@")[1] ?? "";
  return ALLOWED_EMAIL_DOMAINS.includes(domain);
}

// HKUST OIDC (Entra ID, staff tenant — students authenticate there too once
// ITSO assigns them). providerId "hkust" MUST match the redirect URI
// registered on the Entra app: {origin}/api/auth/oauth2/callback/hkust.
// The slot is dormant until all three env vars exist, so builds and dev
// without credentials keep working.
// HKUST uses the MULTI-TENANT `/organizations/` endpoint (ITSO direction,
// 2026-07): one app serves both staff (@ust.hk) and students (@connect.ust.hk),
// and Microsoft routes each user to their home tenant by email domain.
//
// We deliberately provide explicit endpoints instead of a discovery URL: the
// `/organizations/` discovery `issuer` is the templated `.../{tenantid}/v2.0`,
// and Better Auth's RFC 9207 check compares the callback `iss` (the user's REAL
// tenant) against that template — which would reject every login with
// `issuer_mismatch`. With no discoveryUrl/issuer set, that check is skipped.
// Because that leaves Better Auth with NO issuer/signature check on the
// `/organizations/` (any-tenant) endpoint, `getUserInfo` below re-establishes
// the trust boundary itself: it verifies the id_token signature against the
// issuing tenant's JWKS and pins the tenant to HKUST's own tenants.
const HKUST_AUTHORIZE_URL =
  "https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize";
const HKUST_TOKEN_URL =
  "https://login.microsoftonline.com/organizations/oauth2/v2.0/token";

// The only Microsoft Entra tenants HKUST users legitimately belong to. Values
// are authoritative, read from Microsoft's tenant discovery documents:
//   https://login.microsoftonline.com/ust.hk/v2.0/.well-known/openid-configuration
//   https://login.microsoftonline.com/connect.ust.hk/v2.0/.well-known/openid-configuration
// Staff/faculty (@ust.hk) and students (@connect.ust.hk) live in DIFFERENT
// tenants — that is why the multi-tenant `/organizations/` endpoint is used.
// An id_token whose `tid` is not one of these is rejected outright.
const HKUST_TENANT_ISSUERS: Record<string, string> = {
  "c917f3e2-9322-4926-9bb3-daca730413ca":
    "https://login.microsoftonline.com/c917f3e2-9322-4926-9bb3-daca730413ca/v2.0", // ust.hk (staff/faculty)
  "6c1d4152-39d0-44ca-88d9-b8d6ddca0708":
    "https://login.microsoftonline.com/6c1d4152-39d0-44ca-88d9-b8d6ddca0708/v2.0", // connect.ust.hk (students)
};

// One remote JWK set per tenant, created lazily and cached so `jose` reuses the
// fetched signing keys across requests (per server process).
const tenantJwksCache = new Map<
  string,
  ReturnType<typeof createRemoteJWKSet>
>();
function jwksForTenant(tid: string): ReturnType<typeof createRemoteJWKSet> {
  let jwks = tenantJwksCache.get(tid);
  if (!jwks) {
    jwks = createRemoteJWKSet(
      new URL(
        `https://login.microsoftonline.com/${tid}/discovery/v2.0/keys`,
      ),
    );
    tenantJwksCache.set(tid, jwks);
  }
  return jwks;
}

const hkustProviders = [
  {
    providerId: "hkust",
    clientId: process.env.HKUST_XYQ_CLIENT_ID ?? "",
    // Public-client (PKCE) flow: HKUST's Entra apps authenticate with PKCE and
    // no client secret. Better Auth only puts a
    // client_secret on the token request when this is non-empty
    // (@better-auth/core validate-authorization-code.mjs), so leaving it empty
    // performs a clean public-client exchange.
    clientSecret: process.env.HKUST_XYQ_CLIENT_SECRET ?? "",
    authorizationUrl: HKUST_AUTHORIZE_URL,
    tokenUrl: HKUST_TOKEN_URL,
    scopes: ["openid", "profile", "email"],
    // Required for the public-client flow and hardens against code interception.
    pkce: true,
    // Always show the account picker — HKUST users commonly hold both a
    // personal/student and a staff Microsoft session in the same browser.
    authorizationUrlParams: { prompt: "select_account" },
    // Entra frequently omits the `email` claim, so the default getUserInfo
    // (which needs id_token.email) would fall through to a userinfo URL we
    // don't configure. We read the id_token ourselves — but only AFTER
    // cryptographically verifying it, because the `/organizations/` endpoint
    // otherwise leaves the token unauthenticated at the app boundary.
    //
    // This runs on EVERY sign-in (new and returning users), so the tenant pin
    // and domain gate below are enforced on every authentication, not just at
    // account creation.
    getUserInfo: async (tokens: { idToken?: string }) => {
      if (!tokens.idToken) return null;

      // Step 1: peek the (still-unverified) `tid` ONLY to select which tenant's
      // JWKS to verify against. decodeJwt throws (JWTInvalid) on a malformed
      // token; the caller does not wrap getUserInfo, so returning null yields a
      // clean error redirect instead of an unhandled 500.
      let unverifiedTid: string | undefined;
      try {
        unverifiedTid = decodeJwt(tokens.idToken).tid as string | undefined;
      } catch {
        return null;
      }
      // Reject any token not minted by an HKUST tenant. This is the tenant pin
      // that replaces the disabled RFC 9207 issuer check.
      if (!unverifiedTid || !(unverifiedTid in HKUST_TENANT_ISSUERS)) {
        return null;
      }

      // Step 2: verify the id_token signature against that tenant's published
      // keys, pinning issuer + audience + algorithm. A forged `tid` cannot pass
      // here: the signature would not validate against the claimed tenant's
      // keys and the pinned `issuer` would not match. Entra v2 id_tokens are
      // RS256-signed.
      const clientId = process.env.HKUST_XYQ_CLIENT_ID ?? "";
      let claims: ReturnType<typeof decodeJwt>;
      try {
        const { payload } = await jwtVerify(
          tokens.idToken,
          jwksForTenant(unverifiedTid),
          {
            issuer: HKUST_TENANT_ISSUERS[unverifiedTid],
            audience: clientId,
            algorithms: ["RS256"],
          },
        );
        claims = payload;
      } catch {
        // Bad signature / issuer / audience / expiry — reject.
        return null;
      }

      if (!claims.sub) return null;
      // With the tenant verified, `preferred_username` is an HKUST-issued UPN,
      // so gating the domain on it (when `email` is absent) is safe.
      const email = String(
        (claims.email as string) ??
          (claims.preferred_username as string) ??
          "",
      ).toLowerCase();
      // Per-sign-in domain enforcement: blocks any account whose verified
      // address is outside the allow-list, for new AND returning users.
      if (!isAllowedEmail(email)) return null;

      return {
        id: String(claims.sub),
        email,
        // Institutional SSO account — treated as verified.
        emailVerified: true,
        // Never fall back to preferred_username: it is the UPN (an email
        // address), and this name becomes the leaderboard / search display name.
        name:
          typeof claims.name === "string" && claims.name.trim()
            ? claims.name.trim().slice(0, 50)
            : "Learner",
        image:
          typeof claims.picture === "string"
            ? (claims.picture as string)
            : undefined,
      };
    },
  },
  // Mount whenever the client id + endpoints are present — the client secret is
  // optional (public-client PKCE).
].filter((p) => p.clientId && p.authorizationUrl && p.tokenUrl);

export const auth = betterAuth({
  database: pool,
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL,
  trustedOrigins: [baseURL],

  emailAndPassword: { enabled: false },

  advanced: {
    database: {
      // UUIDs keep `profiles.id uuid` and all `auth.uid() = user_id` RLS
      // policies valid — auth.uid() casts the JWT `sub` to uuid.
      generateId: () => crypto.randomUUID(),
    },
  },

  user: {
    // Off: Better Auth's own POST /api/auth/delete-user would drop only the
    // identity and orphan every app row (profiles has no FK to it). Account
    // erasure goes through /api/auth/delete-account, which removes app data
    // first and then calls deleteAuthUser() directly.
    deleteUser: { enabled: false },
  },

  account: {
    // Entra tokens are only needed during the sign-in exchange (getUserInfo
    // reads the fresh id_token, never the stored one). The account hooks below
    // store no provider token at all; encryption stays on as a second layer in
    // case a future plugin writes tokens outside those hooks. Note that Better
    // Auth 1.6 encrypts access/refresh tokens only, never the id_token.
    encryptOAuthTokens: true,
  },

  plugins: [
    // Issues ES256-signed JWTs and serves the JWKS at /api/auth/jwks.
    // Supabase's third-party auth is registered against that JWKS URL, and
    // PostgREST requires `role: "authenticated"` to apply RLS as a signed-in
    // user (anon otherwise).
    jwt({
      jwks: { keyPairConfig: { alg: "ES256" } },
      jwt: {
        definePayload: ({ user }) => ({
          role: "authenticated",
          email: user.email,
        }),
      },
    }),
    ...(hkustProviders.length
      ? [genericOAuth({ config: hkustProviders })]
      : []),
  ],

  databaseHooks: {
    account: {
      // See src/lib/oauth-token-hygiene.ts: no provider token is persisted.
      create: { before: async (account) => ({ data: withoutProviderTokens(account) }) },
      update: { before: async (account) => ({ data: withoutProviderTokens(account) }) },
    },
    user: {
      create: {
        // Domain gate — throwing here aborts the user row create in the same
        // transaction, so a rejected SSO sign-up leaves no orphan. This is
        // the only authorization we apply besides Entra's own app-assignment.
        before: async (user) => {
          if (!isAllowedEmail(user.email)) {
            throw new APIError("BAD_REQUEST", {
              message:
                "Only HKUST accounts (@ust.hk / @connect.ust.hk) can sign in.",
            });
          }
        },
        // Replaces the old `on_auth_user_created` DB trigger: create the
        // public.profiles row keyed on the SAME uuid. The existing
        // `on_profile_created` trigger then unlocks the default characters.
        // If the profile insert fails we delete the just-created better_auth
        // user so the account can retry cleanly (no half-provisioned state).
        after: async (user) => {
          try {
            await pool.query(
              `INSERT INTO public.profiles (id, display_name)
               VALUES ($1, $2)
               ON CONFLICT (id) DO NOTHING`,
              [user.id, (user.name || "Learner").slice(0, 50)],
            );
          } catch (error) {
            try {
              await pool.query(
                'DELETE FROM better_auth."user" WHERE id = $1',
                [user.id],
              );
            } catch (cleanupError) {
              console.error(
                "[auth] failed to remove orphan better_auth user after profile insert failure",
                cleanupError,
              );
            }
            throw error;
          }

          // Fire-and-forget account_created achievement (was in the old
          // Supabase OAuth callback). Service-role client: there is no user
          // JWT yet at user-creation time.
          try {
            const admin = createClient(
              process.env.NEXT_PUBLIC_SUPABASE_URL!,
              SUPABASE_SERVICE_ROLE_KEY(),
            );
            const { checkAndUnlockAchievements } = await import(
              "@/lib/achievements/check"
            );
            await checkAndUnlockAchievements(admin, user.id, {
              type: "account_created",
            });
          } catch (error) {
            console.error("[auth] account_created achievement check failed", error);
          }
        },
      },
    },
  },
});
