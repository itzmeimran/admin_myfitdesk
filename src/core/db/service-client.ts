import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { serverEnv } from "@/core/config/server";
import type { Database } from "./database.types";

/**
 * Bypasses RLS entirely. This admin app's cross-tenant aggregate reads
 * (gyms across every organization, platform-wide MRR, invoices across every
 * gym) have no per-tenant RLS policy that could return them anyway — that's
 * the whole reason a platform back-office needs a service-role client where
 * the tenant app almost never does.
 *
 * Still gated: every caller of this client must sit behind
 * src/app/admin/layout.tsx's `resolvePlatformAdmin()` check first — this
 * file being reachable is not itself the authorization boundary, the
 * layout's fail-closed RPC check is. Blocked by eslint-plugin-boundaries
 * from being imported by `features/**` or any `'use client'` module (see
 * eslint.config.mjs) — query modules under `features/**` should go through
 * a thin server-only wrapper instead once real Supabase wiring lands.
 */
export function createServiceClient() {
  return createSupabaseClient<Database>(serverEnv.SUPABASE_URL, serverEnv.SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
