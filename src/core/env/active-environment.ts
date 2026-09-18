import "server-only";
import { cookies } from "next/headers";
import { ADMIN_ENV_COOKIE } from "./cookie";
import { DEFAULT_ADMIN_ENVIRONMENT, isAdminEnvironment, type AdminEnvironment } from "@/core/config/environments";

/**
 * The single source of truth for "which Supabase project is this request
 * talking to" — every server-side Supabase client factory
 * (core/db/{server,service}-client.ts) calls this before picking
 * credentials, so there is exactly one place that reads the `admin-env`
 * cookie rather than each client re-implementing the same fallback.
 *
 * Missing/malformed cookie → DEV (DEFAULT_ADMIN_ENVIRONMENT), never PROD —
 * an admin who has never switched, or whose cookie was cleared, lands on
 * the non-live project, not on production data by accident.
 */
export async function getActiveAdminEnvironment(): Promise<AdminEnvironment> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(ADMIN_ENV_COOKIE)?.value;
  return isAdminEnvironment(raw) ? raw : DEFAULT_ADMIN_ENVIRONMENT;
}
