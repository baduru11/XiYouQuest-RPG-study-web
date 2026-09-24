-- Purge plaintext HKUST Entra tokens persisted by Better Auth.
--
-- The app never reads stored OAuth tokens: getUserInfo (src/lib/auth.ts) uses
-- the id_token from the live sign-in exchange. Stored access/id tokens were
-- plaintext (id_tokens carry name and email claims) and only increased the
-- impact of a database read. From this release Better Auth encrypts any token
-- it persists (account.encryptOAuthTokens); this clears the legacy plaintext.
-- Sessions are unaffected — they do not depend on these columns.

BEGIN;

UPDATE better_auth.account
SET "accessToken" = NULL,
    "refreshToken" = NULL,
    "idToken" = NULL,
    "accessTokenExpiresAt" = NULL,
    "refreshTokenExpiresAt" = NULL
WHERE "accessToken" IS NOT NULL OR "refreshToken" IS NOT NULL OR "idToken" IS NOT NULL;

COMMIT;
