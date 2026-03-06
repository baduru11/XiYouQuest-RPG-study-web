import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { requireEnv, SUPABASE_SERVICE_ROLE_KEY } from "./env.ts";

/**
 * Create authenticated Supabase client from request's Authorization header.
 * Mirrors the cookie-based auth in src/lib/supabase/server.ts.
 */
export function createSupabaseClient(req: Request): SupabaseClient {
  const authHeader = req.headers.get("authorization") ?? "";
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      global: { headers: { Authorization: authHeader } },
    },
  );
}

/** Admin client with service role key (bypasses RLS). */
export function createAdminClient(): SupabaseClient {
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    SUPABASE_SERVICE_ROLE_KEY(),
  );
}
