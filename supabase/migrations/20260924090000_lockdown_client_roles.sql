-- Lock the PostgREST client roles (anon, authenticated) out of the public schema.
--
-- Why: since the HKUST SSO migration, identity lives in Better Auth and every
-- server path (Next routes and edge functions) verifies the session itself and
-- then uses the service-role client (see src/lib/supabase/server.ts and
-- supabase/functions/_shared/supabase.ts). Nothing legitimate ever reaches
-- PostgREST as `anon` or `authenticated`, yet production still granted both
-- roles broad table privileges and EXECUTE on SECURITY DEFINER functions.
--
-- Two concrete exposures this closes (verified against production 2026-09-24):
--   1. record_practice_progress(p_user_id, ...) is SECURITY DEFINER and was
--      executable by `anon`: anyone holding the public anon key could write
--      practice results / XP into any student's record. The original migration
--      revoked FROM PUBLIC, which does not remove Supabase's explicit
--      anon/authenticated grants.
--   2. Supabase Auth sign-up was still open, so anyone could mint an
--      `authenticated` JWT and read every profile (real names from Entra) or
--      call deduct_xp_if_sufficient / update_profile_with_streak for any user.
--
-- After this migration only postgres and service_role hold privileges on the
-- public schema's tables, sequences and functions. RLS stays enabled as a
-- second layer. Rollback: re-grant from the ACL snapshot recorded in
-- docs/security/evidence/2026-09-24-prod-lockdown.md.

BEGIN;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- Stop future objects created by postgres from re-acquiring client grants
-- (the root cause of exposure 1).
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon, authenticated;

-- Defense in depth: profile rows are readable only by their owner, not by
-- every `authenticated` principal.
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT tablename, policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename IN ('profiles', 'user_characters')
      AND cmd = 'SELECT'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', pol.policyname, pol.tablename);
  END LOOP;
END $$;
CREATE POLICY profiles_select_own ON public.profiles
  FOR SELECT USING (id = (SELECT auth.uid()));
CREATE POLICY user_characters_select_own ON public.user_characters
  FOR SELECT USING (user_id = (SELECT auth.uid()));

COMMIT;
