import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/core/db/database.types";
import { formatShortDate } from "@/core/dates/format";

/** Activity/Audit tab (task brief §9) — `admin_gym_audit_log()` (supabase/
 * migrations/1006_admin_gym_detail.sql), scoped to admin_audit_log rows
 * targeting this one organization. Every row already exists (this tab adds
 * no new writer) — subscription changes (1004), suspend/reactivate and
 * profile edits (1006) all insert here in the same transaction as the
 * write itself. */
export type AuditRow = {
  id: number;
  action: string;
  actionLabel: string;
  adminEmail: string;
  detail: Record<string, unknown> | null;
  at: string;
};

export type AuditListParams = {
  search?: string;
  action?: string;
  actorId?: string;
  dateFrom?: string;
  dateTo?: string;
  sortDir?: "asc" | "desc";
  limit?: number;
  offset?: number;
};

type AdminGymAuditRow = {
  id: number;
  action: string;
  admin_id: string | null;
  admin_email: string | null;
  detail: Record<string, unknown> | null;
  at: string;
  total_count: number;
};

export const AUDIT_ACTION_LABEL: Record<string, string> = {
  "subscription.extend": "Subscription extended",
  "subscription.change_package": "Package changed",
  "subscription.cancel": "Subscription cancelled",
  "subscription.restore": "Subscription restored",
  "organization.suspend": "Gym suspended",
  "organization.reactivate": "Gym reactivated",
  "organization.update_profile": "Profile updated",
  "package.create": "Package created",
  "package.update": "Package updated",
  "package.archive": "Package archived",
  "package.restore": "Package restored",
};

export async function getGymAuditLog(
  supabase: SupabaseClient<Database>,
  organizationId: string,
  params: AuditListParams,
): Promise<{ rows: AuditRow[]; total: number }> {
  const { data, error } = await supabase.rpc("admin_gym_audit_log", {
    p_organization_id: organizationId,
    p_search: params.search || undefined,
    p_action: params.action || undefined,
    p_actor_id: params.actorId || undefined,
    p_date_from: params.dateFrom || undefined,
    p_date_to: params.dateTo || undefined,
    p_sort_dir: params.sortDir,
    p_limit: params.limit ?? 25,
    p_offset: params.offset ?? 0,
  });
  if (error) throw new Error(`Failed to load the activity log: ${error.message}`);

  const rows = (data ?? []) as AdminGymAuditRow[];
  const now = new Date();

  return {
    total: rows[0]?.total_count ?? 0,
    rows: rows.map((row) => ({
      id: row.id,
      action: row.action,
      actionLabel: AUDIT_ACTION_LABEL[row.action] ?? row.action,
      adminEmail: row.admin_email ?? "System",
      detail: row.detail,
      at: formatShortDate(new Date(row.at), now) + " " + new Date(row.at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
    })),
  };
}

export type AdminOption = { id: string; email: string };

/** Actor filter dropdown — every live platform admin, read directly
 * (platform_admins already has an admin-gated SELECT policy, 1001). */
export async function listAdminOptions(supabase: SupabaseClient<Database>): Promise<AdminOption[]> {
  const { data, error } = await supabase
    .from("platform_admins")
    .select("user_id, email")
    .is("revoked_at", null)
    .order("email");
  if (error) throw new Error(`Failed to load admins: ${error.message}`);
  return (data ?? []).map((row) => ({ id: row.user_id, email: row.email }));
}
