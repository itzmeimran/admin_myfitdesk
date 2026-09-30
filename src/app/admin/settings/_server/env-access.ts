import "server-only";
import { createServiceClientForEnvironment } from "@/core/db/service-client";
import type { AdminEnvironment } from "@/core/config/environments";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * "Does this admin also have access to the OTHER environment?"
 *
 * Development and Production are separate Supabase projects, so one project can
 * only answer for itself. To fill the roster's "Environment access" column we
 * ask the other project for exactly one thing — the status of the same email
 * addresses in ITS platform_admins table — using that project's service key
 * (RLS would otherwise hide it from a session that belongs to the first
 * project). Only email + status leave that query: no ids, no permissions, no
 * activity, nothing about gyms. The caller is already a Platform Owner (this is
 * only called from the owner-only Admins page).
 *
 * Any failure (no service key for that environment, migration not applied
 * there) yields "unknown" rather than a guess.
 */
export type OtherEnvironmentAccess = {
  environment: AdminEnvironment;
  /** lower-cased email -> status in the other environment */
  byEmail: Record<string, string>;
  available: boolean;
};

export async function getOtherEnvironmentAccess(
  current: AdminEnvironment,
  emails: string[],
): Promise<OtherEnvironmentAccess> {
  const other: AdminEnvironment = current === "prod" ? "dev" : "prod";
  const empty: OtherEnvironmentAccess = { environment: other, byEmail: {}, available: false };
  if (!emails.length) return { ...empty, available: true };

  try {
    const service = (await createServiceClientForEnvironment(other)) as unknown as SupabaseClient;
    const wanted = emails.map((e) => e.toLowerCase());

    let rows: { email: string; status?: string; revoked_at?: string | null }[] | null = null;
    const withStatus = await service.from("platform_admins").select("email,status,revoked_at").in("email", wanted);
    if (!withStatus.error) {
      rows = withStatus.data;
    } else {
      // The other project hasn't had the Settings migration yet: no status column.
      const legacy = await service.from("platform_admins").select("email,revoked_at").in("email", wanted);
      if (legacy.error) return empty;
      rows = legacy.data;
    }

    const byEmail: Record<string, string> = {};
    for (const row of rows ?? []) {
      byEmail[String(row.email).toLowerCase()] = row.status ?? (row.revoked_at ? "revoked" : "active");
    }
    return { environment: other, byEmail, available: true };
  } catch {
    return empty;
  }
}
