import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/core/db/database.types";
import { loose } from "@/core/db/loose-client";
import type { AdminStatus } from "@/core/auth/permissions";
import { loaded, loadedFailure, type Loaded } from "./rpc-result";

/**
 * Platform admin roster and roles. Backed by admin_list_platform_admins(),
 * admin_platform_admin_detail() and admin_list_platform_roles()
 * (supabase/migrations/20260930180000_platform_settings.sql) — each re-checks
 * the caller's permission inside the database.
 */

export type PlatformAdminRow = {
  userId: string;
  email: string;
  displayName: string | null;
  role: string;
  roleLabel: string;
  status: AdminStatus;
  grantedByEmail: string | null;
  grantedAt: string;
  invitedAt: string | null;
  inviteExpiresAt: string | null;
  activatedAt: string | null;
  suspendedAt: string | null;
  revokedAt: string | null;
  lastSignInAt: string | null;
  lastActiveAt: string | null;
  mfaEnabled: boolean;
  isSelf: boolean;
};

type AdminRpcRow = {
  user_id: string;
  email: string;
  display_name: string | null;
  role: string;
  role_label: string;
  status: AdminStatus;
  granted_by_email: string | null;
  granted_at: string;
  invited_at: string | null;
  invite_expires_at: string | null;
  activated_at: string | null;
  suspended_at: string | null;
  revoked_at: string | null;
  last_sign_in_at: string | null;
  last_active_at: string | null;
  mfa_enabled: boolean;
  is_self: boolean;
};

export async function listPlatformAdmins(supabase: SupabaseClient<Database>): Promise<Loaded<PlatformAdminRow[]>> {
  const { data, error } = await loose(supabase).rpc("admin_list_platform_admins");
  if (error) return loadedFailure(error);

  return loaded(
    ((data ?? []) as AdminRpcRow[]).map((row) => ({
      userId: row.user_id,
      email: row.email,
      displayName: row.display_name,
      role: row.role,
      roleLabel: row.role_label,
      status: row.status,
      grantedByEmail: row.granted_by_email,
      grantedAt: row.granted_at,
      invitedAt: row.invited_at,
      inviteExpiresAt: row.invite_expires_at,
      activatedAt: row.activated_at,
      suspendedAt: row.suspended_at,
      revokedAt: row.revoked_at,
      lastSignInAt: row.last_sign_in_at,
      lastActiveAt: row.last_active_at,
      mfaEnabled: row.mfa_enabled,
      isSelf: row.is_self,
    })),
  );
}

export type PlatformRole = { role: string; label: string; description: string; permissions: string[] };

export async function listPlatformRoles(supabase: SupabaseClient<Database>): Promise<Loaded<PlatformRole[]>> {
  const { data, error } = await loose(supabase).rpc("admin_list_platform_roles");
  if (error) return loadedFailure(error);
  return loaded((data ?? []) as PlatformRole[]);
}

export type AdminActivity = { id: number; action: string; at: string; environment: string | null; entity_type: string | null };

export type AdminDetail = {
  permissions: string[];
  sessionCount: number;
  suspendedByEmail: string | null;
  revokedByEmail: string | null;
  recentActivity: AdminActivity[];
};

export async function getAdminDetail(supabase: SupabaseClient<Database>, userId: string): Promise<Loaded<AdminDetail>> {
  const { data, error } = await loose(supabase).rpc("admin_platform_admin_detail", { p_user_id: userId });
  if (error) return loadedFailure(error);

  const raw = data as {
    permissions: string[];
    session_count: number;
    suspended_by_email: string | null;
    revoked_by_email: string | null;
    recent_activity: AdminActivity[];
  };
  return loaded({
    permissions: raw.permissions ?? [],
    sessionCount: Number(raw.session_count ?? 0),
    suspendedByEmail: raw.suspended_by_email,
    revokedByEmail: raw.revoked_by_email,
    recentActivity: raw.recent_activity ?? [],
  });
}
