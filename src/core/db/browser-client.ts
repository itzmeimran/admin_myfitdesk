import { createBrowserClient } from "@supabase/ssr";
import { getPublicSupabaseCredentials } from "@/core/config/public";
import type { AdminEnvironment } from "@/core/config/environments";
import type { Database } from "./database.types";

/**
 * RLS applies. The only client permitted in 'use client' components.
 *
 * Takes the active environment explicitly rather than re-deriving it —
 * unlike the server client (core/db/server-client.ts), a Client Component
 * has no direct, trustworthy read of the `admin-env` cookie's value (it's
 * set via a Server Action; the authoritative parse lives in
 * core/env/active-environment.ts, which is server-only). Pass the value
 * from `useAdminEnvironment()` (core/env/context.tsx), which is seeded from
 * that same server-side read via the root layout.
 *
 * `cookieOptions.name` matches core/db/server-client.ts's
 * `sb-admin-${environment}` exactly — both sides must agree on the name for
 * a session set here to be readable server-side, and vice versa.
 */
export function createClient(environment: AdminEnvironment) {
  const { url, publishableKey } = getPublicSupabaseCredentials(environment);
  return createBrowserClient<Database>(url, publishableKey, {
    cookieOptions: { name: `sb-admin-${environment}` },
  });
}
