import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/core/db/database.types";

/**
 * Admin roster (CLAUDE.md's Plan, P2 #8 — the one Settings feature the
 * product owner chose to build out of the design's 4 candidates). Backed by
 * supabase/migrations/1007_admin_roster_rpcs.sql's admin_list_platform_admins().
 */

export type PlatformAdminRow = {
  userId: string;
  email: string;
  grantedByEmail: string | null;
  grantedAt: string;
  revokedAt: string | null;
  isSelf: boolean;
};

// The generated Args/Returns types for admin_list_platform_admins() don't
// mark granted_by_email/revoked_at as nullable — same codegen gap CLAUDE.md
// already documents for admin_create_package's nullable integer args
// (codegen narrows enums, not plain nullable columns or LEFT JOIN columns).
// granted_by_email is null whenever the granter's auth.users row can't be
// joined (there is none for the very first admin, granted outside the app);
// revoked_at is null for any live admin. Narrow local re-typing here rather
// than widening the generated client-wide types.
type AdminListRow = Database["public"]["Functions"]["admin_list_platform_admins"]["Returns"][number];
type NullableAdminListRow = Omit<AdminListRow, "granted_by_email" | "revoked_at"> & {
  granted_by_email: string | null;
  revoked_at: string | null;
};

export async function listPlatformAdmins(supabase: SupabaseClient<Database>): Promise<PlatformAdminRow[]> {
  const { data, error } = await supabase.rpc("admin_list_platform_admins");
  if (error) throw new Error(`Failed to load the admin roster: ${error.message}`);

  return ((data ?? []) as NullableAdminListRow[]).map((row) => ({
    userId: row.user_id,
    email: row.email,
    grantedByEmail: row.granted_by_email,
    grantedAt: row.granted_at,
    revokedAt: row.revoked_at,
    isSelf: row.is_self,
  }));
}
