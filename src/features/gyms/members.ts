import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/core/db/database.types";
import { formatShortDate } from "@/core/dates/format";

/** Members tab (task brief §7) — `admin_gym_members()` (supabase/
 * migrations/1009_admin_gym_detail.sql). Real PII per the product owner's
 * explicit reversal of the platform-admin PII boundary for this feature. */
export type MemberRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  branchName: string;
  status: string;
  joinedOn: string;
  planName: string;
  expiryLabel: string;
  expiryState: "none" | "active" | "expiring_soon" | "expired";
};

export type MemberListParams = {
  search?: string;
  status?: string;
  branchId?: string;
  planName?: string;
  expiryState?: string;
  sortCol?: string;
  sortDir?: "asc" | "desc";
  limit?: number;
  offset?: number;
};

type AdminGymMemberRow = {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone_e164: string | null;
  branch_id: string | null;
  branch_name: string | null;
  status: string;
  joined_on: string;
  created_at: string;
  plan_name: string | null;
  subscription_end_date: string | null;
  expiry_state: "none" | "active" | "expiring_soon" | "expired";
  total_count: number;
};

const EXPIRY_LABEL: Record<AdminGymMemberRow["expiry_state"], string> = {
  none: "No plan",
  active: "Active",
  expiring_soon: "Expiring soon",
  expired: "Expired",
};

/** Overview tab's "Gym activity snapshot" tiles — three cheap total_count-
 * only reads (limit 1) over the same `admin_gym_members()` RPC the Members
 * tab uses, bucketed by `expiry_state` rather than a new aggregate RPC.
 * Real data, no new migration: `admin_gym_members()` already computes
 * `expiry_state` and `total_count` per call. */
export async function getMemberExpirySnapshot(
  supabase: SupabaseClient<Database>,
  organizationId: string,
): Promise<{ activeMembershipCount: number; expiringSoonCount: number; expiredCount: number }> {
  const [active, expiringSoon, expired] = await Promise.all([
    getGymMembers(supabase, organizationId, { expiryState: "active", limit: 1 }),
    getGymMembers(supabase, organizationId, { expiryState: "expiring_soon", limit: 1 }),
    getGymMembers(supabase, organizationId, { expiryState: "expired", limit: 1 }),
  ]);
  return {
    activeMembershipCount: active.total,
    expiringSoonCount: expiringSoon.total,
    expiredCount: expired.total,
  };
}

export async function getGymMembers(
  supabase: SupabaseClient<Database>,
  organizationId: string,
  params: MemberListParams,
): Promise<{ rows: MemberRow[]; total: number }> {
  const { data, error } = await supabase.rpc("admin_gym_members", {
    p_organization_id: organizationId,
    p_search: params.search || undefined,
    p_status: params.status || undefined,
    p_branch_id: params.branchId || undefined,
    p_plan_name: params.planName || undefined,
    p_expiry_state: params.expiryState || undefined,
    p_sort_col: params.sortCol,
    p_sort_dir: params.sortDir,
    p_limit: params.limit ?? 25,
    p_offset: params.offset ?? 0,
  });
  if (error) throw new Error(`Failed to load members: ${error.message}`);

  const rows = (data ?? []) as AdminGymMemberRow[];
  const now = new Date();

  return {
    total: rows[0]?.total_count ?? 0,
    rows: rows.map((row) => ({
      id: row.id,
      name: [row.first_name, row.last_name].filter(Boolean).join(" "),
      email: row.email,
      phone: row.phone_e164,
      branchName: row.branch_name ?? "—",
      status: row.status,
      joinedOn: formatShortDate(new Date(row.joined_on), now),
      planName: row.plan_name ?? "No plan",
      expiryLabel: row.subscription_end_date
        ? `${EXPIRY_LABEL[row.expiry_state]} · ${formatShortDate(new Date(row.subscription_end_date), now)}`
        : EXPIRY_LABEL[row.expiry_state],
      expiryState: row.expiry_state,
    })),
  };
}
