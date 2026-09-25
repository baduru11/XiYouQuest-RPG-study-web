-- Least-privilege database role for the Better Auth pool (OA-16).
--
-- Why: the pool in src/lib/auth.ts connected as `postgres`, the database
-- owner, so its connection string in the Vercel environment granted full
-- control of the database, including the security event log. This role holds
-- only what the pool's queries need:
--   - the five Better Auth tables: read, insert, update and delete;
--   - public.profiles: insert of (id, display_name) for the sign-up hook,
--     allowed by a row-level-security policy scoped to this role.
-- It is created without LOGIN. The owner enables LOGIN with a password set
-- outside the repository and points BETTER_AUTH_DATABASE_URL at the pooler
-- user better_auth_app.<project-ref> (docs/security/owner-actions.md, OA-16).

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'better_auth_app') THEN
    CREATE ROLE better_auth_app NOLOGIN NOINHERIT;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA better_auth TO better_auth_app;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON better_auth."user", better_auth.session, better_auth.account,
     better_auth.verification, better_auth.jwks
  TO better_auth_app;

GRANT USAGE ON SCHEMA public TO better_auth_app;
GRANT INSERT (id, display_name) ON public.profiles TO better_auth_app;
-- The hook's ON CONFLICT (id) needs SELECT on the conflict column, and with
-- ON CONFLICT Postgres also checks the new row against SELECT policies.
-- Column privilege limits this role to `id`, the same user ids it already
-- reads from better_auth."user"; no other profile column is readable.
GRANT SELECT (id) ON public.profiles TO better_auth_app;

DROP POLICY IF EXISTS better_auth_app_insert_profile ON public.profiles;
CREATE POLICY better_auth_app_insert_profile ON public.profiles
  FOR INSERT TO better_auth_app WITH CHECK (true);

DROP POLICY IF EXISTS better_auth_app_select_profile_id ON public.profiles;
CREATE POLICY better_auth_app_select_profile_id ON public.profiles
  FOR SELECT TO better_auth_app USING (true);

-- Lets the migration owner SET ROLE to verify the grants.
GRANT better_auth_app TO postgres;

COMMIT;
