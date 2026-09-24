-- Close the gap left by 20260924090000: a per-schema
-- `ALTER DEFAULT PRIVILEGES ... IN SCHEMA public REVOKE ... FROM PUBLIC` cannot
-- remove PostgreSQL's built-in EXECUTE-to-PUBLIC default for new functions
-- (it only undoes a matching per-schema GRANT). The global form does, so a
-- future SECURITY DEFINER function created by postgres is not callable by
-- anon through PUBLIC. Existing functions were already revoked explicitly.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
