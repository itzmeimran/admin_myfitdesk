import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/core/db/database.types";
import { formatShortDate } from "@/core/dates/format";

/** Users & Staff tab (task brief §6) — `admin_gym_staff()` (supabase/
 * migrations/1009_admin_gym_detail.sql). Real PII per the product owner's
 * explicit reversal of the platform-admin PII boundary for this feature
 * (see that migration's header). No `last_login` field: nothing in this
 * schema tracks it (neither staff_memberships nor an auth.users read is
 * used here), so the UI shows "Not tracked" rather than inventing a date. */
export type StaffRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  branchName: string;
  phone: string | null;
  status: string;
  createdAt: string;
};

export type StaffListParams = {
  search?: string;
  role?: string;
  branchId?: string;
  status?: string;
  sortCol?: string;
  sortDir?: "asc" | "desc";
  limit?: number;
  offset?: number;
};

type AdminGymStaffRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  role: string;
  branch_id: string | null;
  branch_name: string | null;
  phone_e164: string | null;
  status: string;
  created_at: string;
  total_count: number;
};

const STATUS_LABEL: Record<string, string> = { active: "Active", pending_removal: "Pending removal" };

export async function getGymStaff(
  supabase: SupabaseClient<Database>,
  organizationId: string,
  params: StaffListParams,
): Promise<{ rows: StaffRow[]; total: number }> {
  const { data, error } = await supabase.rpc("admin_gym_staff", {
    p_organization_id: organizationId,
    p_search: params.search || undefined,
    p_role: params.role || undefined,
    p_branch_id: params.branchId || undefined,
    p_status: params.status || undefined,
    p_sort_col: params.sortCol,
    p_sort_dir: params.sortDir,
    p_limit: params.limit ?? 25,
    p_offset: params.offset ?? 0,
  });
  if (error) throw new Error(`Failed to load staff: ${error.message}`);

  const rows = (data ?? []) as AdminGymStaffRow[];
  const now = new Date();

  return {
    total: rows[0]?.total_count ?? 0,
    rows: rows.map((row) => ({
      id: row.id,
      name: [row.first_name, row.last_name].filter(Boolean).join(" ") || row.email,
      email: row.email,
      role: row.role,
      branchName: row.branch_name ?? "All branches",
      phone: row.phone_e164,
      status: STATUS_LABEL[row.status] ?? row.status,
      createdAt: formatShortDate(new Date(row.created_at), now),
    })),
  };
}
