import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.95.3";
import { requireEnv, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY } from "./env.ts";

/**
 * DB client for a request whose Better Auth user has already been verified
 * via verify-jwt.ts.
 *
 * Supabase third-party auth only trusts the JWKS of five named providers
 * (Clerk, Firebase, Auth0, Cognito, WorkOS), so PostgREST can never verify a
 * Better Auth JWT itself. The previous approach (forwarding the request's
 * Authorization header on an anon-key client) therefore made every
 * user-scoped query fail with 401. Instead, a verified request gets the
 * service-role client; callers MUST keep scoping every query by the verified
 * user id. Unverified requests get an anon client, which holds no privileges
 * on the public schema (20260924090000_lockdown_client_roles.sql), so it can
 * read nothing.
 */
export function createRequestClient(
  user: { id: string } | null,
): SupabaseClient {
  if (!user) {
    return createClient(
      requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
      SUPABASE_PUBLISHABLE_KEY(),
    );
  }
  return createAdminClient();
}

/** Admin client with service role key (bypasses RLS). */
export function createAdminClient(): SupabaseClient {
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    SUPABASE_SERVICE_ROLE_KEY(),
  );
}
