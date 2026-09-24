import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { cache } from "react";

import { auth } from "@/lib/auth";
import {
  SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_URL,
} from "@/lib/env";

/**
 * Server-side Supabase client for the current request.
 *
 * After the HKUST SSO migration, auth is Better Auth (not Supabase Auth).
 * Supabase third-party auth only trusts the JWKS of Clerk, Firebase, Auth0,
 * AWS Cognito, and WorkOS, so a Better Auth JWT can never authenticate against
 * PostgREST: attaching it via `accessToken` made every user-scoped query fail
 * with 401 in production (empty catalogs, failing social panels).
 *
 * Instead, the server verifies the Better Auth session itself and then uses
 * the service-role key for data access. Requests without a session get an
 * anon-key client, which holds no privileges on the public schema since
 * 20260924090000_lockdown_client_roles.sql, so it can read nothing. Because the
 * service-role client bypasses RLS, callers MUST keep scoping queries by the
 * verified session user id (never by client-supplied ids).
 */
export async function createClient() {
  const user = await getSessionUser();
  return createSupabaseClient(
    SUPABASE_URL(),
    user ? SUPABASE_SERVICE_ROLE_KEY() : SUPABASE_ANON_KEY(),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export interface SessionUser {
  id: string;
  // May be empty: Entra can omit the email claim and `getUserInfo` falls back to
  // preferred_username, which itself can be absent. Typed honestly so callers
  // handle the empty case instead of trusting a guaranteed address.
  email: string;
}

/**
 * The authenticated user for the current request, or null. Replacement for
 * `supabase.auth.getUser()`: reads the Better Auth session cookie server-side.
 * Wrapped in React `cache()` so layout, page, and `createClient()` share one
 * session lookup per request instead of hitting the auth store repeatedly.
 */
export const getSessionUser = cache(
  async (): Promise<SessionUser | null> => {
    const requestHeaders = await headers();
    const session = await auth.api.getSession({ headers: requestHeaders });
    if (!session?.user) return null;
    return { id: session.user.id, email: session.user.email ?? "" };
  },
);
