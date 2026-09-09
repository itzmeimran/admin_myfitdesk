import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/core/db/database.types";
import { formatShortDate } from "@/core/dates/format";

/** Branches tab (task brief §5) — `admin_gym_branches()` (supabase/
 * migrations/1009_admin_gym_detail.sql). "Status" is the branch's own
 * `branches.status` column (already app-defined, e.g. active/archived) —
 * not invented here. */
export type BranchRow = {
  id: string;
  name: string;
  status: string;
  timezone: string;
  currency: string;
  memberCount: number;
  staffCount: number;
  createdAt: string;
};

export type BranchListParams = {
  search?: string;
  status?: string;
  sortCol?: string;
  sortDir?: "asc" | "desc";
  limit?: number;
  offset?: number;
};

type AdminGymBranchRow = {
  id: string;
  name: string;
  status: string;
  timezone: string;
  currency: string;
  member_count: number;
  staff_count: number;
  created_at: string;
  total_count: number;
};

/** Branch options for the Staff/Members tabs' branch filter dropdown —
 * reuses `admin_gym_branches()` with a generous limit rather than a new RPC
 * (per the schema's own "usually one branch, rarely more than a handful"
 * fact — see CLAUDE.md's Hard schema facts — a plain page-sized read is a
 * real filter list here, not a truncated approximation). */
export async function listBranchOptions(
  supabase: SupabaseClient<Database>,
  organizationId: string,
): Promise<{ id: string; name: string }[]> {
  const { rows } = await getGymBranches(supabase, organizationId, { sortCol: "name", sortDir: "asc", limit: 200 });
  return rows.map((b) => ({ id: b.id, name: b.name }));
}

export async function getGymBranches(
  supabase: SupabaseClient<Database>,
  organizationId: string,
  params: BranchListParams,
): Promise<{ rows: BranchRow[]; total: number }> {
  const { data, error } = await supabase.rpc("admin_gym_branches", {
    p_organization_id: organizationId,
    p_search: params.search || undefined,
    p_status: params.status || undefined,
    p_sort_col: params.sortCol,
    p_sort_dir: params.sortDir,
    p_limit: params.limit ?? 25,
    p_offset: params.offset ?? 0,
  });
  if (error) throw new Error(`Failed to load branches: ${error.message}`);

  const rows = (data ?? []) as AdminGymBranchRow[];
  const now = new Date();

  return {
    total: rows[0]?.total_count ?? 0,
    rows: rows.map((row) => ({
      id: row.id,
      name: row.name,
      status: row.status,
      timezone: row.timezone,
      currency: row.currency,
      memberCount: row.member_count,
      staffCount: row.staff_count,
      createdAt: formatShortDate(new Date(row.created_at), now),
    })),
  };
}
