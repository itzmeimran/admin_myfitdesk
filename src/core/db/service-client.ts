import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getServiceSupabaseCredentials } from "@/core/config/server";
import { getActiveAdminEnvironment } from "@/core/env/active-environment";
import type { AdminEnvironment } from "@/core/config/environments";
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
 *
 * Resolves to the currently-selected DEV/PROD project the same way
 * core/db/server-client.ts does (`getActiveAdminEnvironment()`, the
 * `admin-env` cookie) — a service-role call made while the admin is on
 * PROD hits PROD, full stop; there is no separate "which project does the
 * service client use" setting to fall out of sync with the toggle.
 */
export async function createServiceClient() {
  return createServiceClientForEnvironment(await getActiveAdminEnvironment());
}

/**
 * Pinned to an explicit environment. Only for actions that have ALREADY
 * proven (through the actor's own RLS session on that same project) that the
 * caller is allowed to do what they are about to do with elevated rights —
 * e.g. creating the auth account for an invited platform admin.
 */
export async function createServiceClientForEnvironment(environment: AdminEnvironment) {
  const { url, secretKey } = getServiceSupabaseCredentials(environment);

  return createSupabaseClient<Database>(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
