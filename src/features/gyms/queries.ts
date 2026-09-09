import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/core/db/database.types";
import { formatMinorWhole } from "@/core/money/format";
import { formatShortDate, daysBetween } from "@/core/dates/format";
import { capitalizeBillingPeriod } from "@/core/text/billing-period";
import type { Gym, GymStatus } from "./mock-data";

/**
 * Real replacement for mock-data.ts's `listGyms()` — same output shape
 * (`Gym[]`), so `GymsView` (the client component with the filter/search
 * logic) needs no changes at all. Reads `public.admin_gym_directory()`,
 * a SECURITY DEFINER function (supabase/migrations/1002_admin_read_
 * functions.sql) that computes one row per organization — member/branch/
 * staff counts and lifetime platform revenue come from that function, not
 * from any RLS-readable table, so an admin session never gets row-level
 * access to another gym's `members` table (see 1002's header comment on
 * the platform-plane/tenant-plane boundary this app draws).
 *
 * The generated `admin_gym_directory` return type widens several columns to
 * plain `string`/`number` (Postgres text/int, no narrower codegen), so this
 * narrows them back to the actual value sets the function guarantees.
 */
type AdminGymRow = {
  organization_id: string;
  name: string;
  owner_name: string | null;
  city: string | null;
  package_id: string | null;
  package_name: string | null;
  package_code: string | null;
  // Widened from "monthly" | "yearly" — plans/plan-owned cycles (supabase/
  // migrations/1008_plans_schema_and_rpcs.sql) can carry any admin-defined
  // label ("Quarterly", "Annual", ...), not just the legacy two.
  billing_period: string | null;
  price_minor: number | null;
  currency: string | null;
  state: "trialing" | "active" | "grace" | "read_only" | "cancelled";
  current_period_end: string | null;
  grace_days: number | null;
  member_count: number;
  member_cap: number | null;
  branch_count: number;
  branch_cap: number | null;
  staff_count: number;
  staff_cap: number | null;
  lifetime_paid_minor: number;
  created_at: string;
};

const STATE_TO_STATUS: Record<AdminGymRow["state"], GymStatus> = {
  trialing: "Trialing",
  active: "Active",
  grace: "Grace",
  read_only: "Read-only",
  cancelled: "Cancelled",
};

function formatPeriod(row: AdminGymRow): string {
  if (!row.package_name || row.price_minor === null) {
    // No package yet — trialing on the 14-day default every organization
    // gets from app.create_default_subscription() (FitDeskApp migration
    // 0028). Computed from the actual dates rather than hardcoded, so a
    // manually-adjusted trial length still shows correctly.
    const start = new Date(row.created_at);
    const end = row.current_period_end ? new Date(row.current_period_end) : start;
    const days = Math.max(daysBetween(start, end), 0);
    return `Trial · ${days} days`;
  }
  // Was `row.billing_period === "yearly" ? "Yearly" : "Monthly"` — collapsed
  // any dynamic-plan label (e.g. "Quarterly") into "Monthly", silently
  // wrong. billing_period is already a display-ready label on the row
  // (admin-entered for a plan cycle, "monthly"/"yearly" verbatim for a
  // legacy one), so just capitalize it instead of matching against a fixed
  // 2-value set.
  const period = row.billing_period
    ? row.billing_period.charAt(0).toUpperCase() + row.billing_period.slice(1)
    : "Monthly";
  return `${period} · ${formatMinorWhole(row.price_minor, row.currency ?? "INR")}`;
}

function formatRenews(row: AdminGymRow, now: Date): string {
  if (!row.current_period_end) return "—";
  const end = new Date(row.current_period_end);

  switch (row.state) {
    case "trialing":
      return `Trial ends ${formatShortDate(end, now)}`;
    case "grace":
    case "read_only": {
      const overdue = daysBetween(end, now);
      return overdue > 0 ? `Overdue ${overdue}d` : formatShortDate(end, now);
    }
    case "cancelled":
      return `Ends ${formatShortDate(end, now)}`;
    default:
      return formatShortDate(end, now);
  }
}

function toGym(row: AdminGymRow, now: Date): Gym {
  const pct = row.member_cap ? Math.round((row.member_count / row.member_cap) * 100) : 0;

  return {
    name: row.name,
    owner: row.owner_name ?? "—",
    city: row.city ?? "—",
    package: row.package_name ?? "No package",
    period: formatPeriod(row),
    status: STATE_TO_STATUS[row.state],
    members: row.member_count.toLocaleString("en-IN"),
    cap: row.member_cap === null ? "∞" : row.member_cap.toLocaleString("en-IN"),
    pct,
    branches: String(row.branch_count),
    staff: String(row.staff_count),
    renews: formatRenews(row, now),
    ltv: formatMinorWhole(row.lifetime_paid_minor, row.currency ?? "INR"),
    organizationId: row.organization_id,
    packageId: row.package_id,
  };
}

async function fetchAdminGymRows(supabase: SupabaseClient<Database>): Promise<AdminGymRow[]> {
  const { data, error } = await supabase.rpc("admin_gym_directory");
  if (error) throw new Error(`Failed to load the gym directory: ${error.message}`);
  return (data ?? []) as AdminGymRow[];
}

export async function listGyms(supabase: SupabaseClient<Database>): Promise<Gym[]> {
  const rows = await fetchAdminGymRows(supabase);
  const now = new Date();
  return rows.map((row) => toGym(row, now));
}

export type GymsSummary = {
  enrolledCount: number;
  branchCount: number;
  memberCount: number;
};

/**
 * Gyms page header ("128 enrolled · 214 branches · 41,382 members") used to
 * be hardcoded straight from the design mock (design-audit.md's Data
 * mapping section flagged this as TODO(real-data) from the start). Derived
 * from the same admin_gym_directory() rows the table itself renders — one
 * RPC call, not a second query — branch_count/member_count per row already
 * match this function's own active-branches/non-deleted-members definition
 * (see that RPC's SQL), so summing them is exact, not an approximation.
 */
export async function getGymsDirectory(supabase: SupabaseClient<Database>): Promise<{ gyms: Gym[]; summary: GymsSummary }> {
  const rows = await fetchAdminGymRows(supabase);
  const now = new Date();

  const summary = rows.reduce<GymsSummary>(
    (acc, row) => ({
      enrolledCount: acc.enrolledCount + 1,
      branchCount: acc.branchCount + row.branch_count,
      memberCount: acc.memberCount + row.member_count,
    }),
    { enrolledCount: 0, branchCount: 0, memberCount: 0 },
  );

  return { gyms: rows.map((row) => toGym(row, now)), summary };
}

export type GymsStatusSummary = {
  total: number;
  active: number;
  trialing: number;
  grace: number;
  readOnly: number;
  cancelled: number;
  suspended: number;
  totalBranches: number;
  totalMembers: number;
};

type AdminGymsSummaryJson = {
  total: number;
  active: number;
  trialing: number;
  grace: number;
  read_only: number;
  cancelled: number;
  suspended: number;
  total_branches: number;
  total_members: number;
};

/** Status-breakdown tiles for the Gyms list header (Total/Active/Trialing/
 * Grace/Read-only/Cancelled/Suspended) — one aggregate RPC round trip, never
 * derived by summing the current page of rows (which would be wrong the
 * moment a filter or a page boundary is in play). */
export async function getGymsStatusSummary(supabase: SupabaseClient<Database>): Promise<GymsStatusSummary> {
  const { data, error } = await supabase.rpc("admin_gyms_summary");
  if (error) throw new Error(`Failed to load the gyms summary: ${error.message}`);

  const raw = (Array.isArray(data) ? data[0] : data) as AdminGymsSummaryJson | null;
  if (!raw) throw new Error("admin_gyms_summary returned an unexpected shape");

  return {
    total: raw.total,
    active: raw.active,
    trialing: raw.trialing,
    grace: raw.grace,
    readOnly: raw.read_only,
    cancelled: raw.cancelled,
    suspended: raw.suspended,
    totalBranches: raw.total_branches,
    totalMembers: raw.total_members,
  };
}

const LIST_STATE_TO_STATUS: Record<string, GymStatus> = {
  ...STATE_TO_STATUS,
  suspended: "Suspended",
};

export type GymListRow = {
  organizationId: string;
  name: string;
  ownerName: string;
  ownerEmail: string;
  city: string;
  packageId: string | null;
  packageName: string;
  period: string;
  status: GymStatus;
  members: string;
  cap: string;
  pct: number;
  branches: string;
  staff: string;
  renews: string;
  ltv: string;
  createdAt: string;
};

export type GymListParams = {
  search?: string;
  /** Raw derived-state value (trialing/active/grace/read_only/cancelled/
   * suspended), matching admin_gyms_list's p_status — never the display
   * label ("Read-only"). Callers map GYM_FILTERS labels to this. */
  status?: string;
  packageId?: string;
  billingPeriod?: string;
  minBranches?: number;
  sortCol?: string;
  sortDir?: "asc" | "desc";
  limit?: number;
  offset?: number;
};

export type GymListResult = { rows: GymListRow[]; total: number };

type AdminGymsListRow = AdminGymRow & { owner_email: string | null; suspended_at: string | null; total_count: number };

/**
 * Server-side search + filter + sort + pagination for the Gyms table —
 * reads `admin_gyms_list()` (supabase/migrations/1009_admin_gym_detail.sql),
 * which does the filtering, the allowlisted ORDER BY, and the LIMIT/OFFSET
 * in SQL and returns the filtered total via `count(*) over()` in the same
 * round trip. This is the real replacement for the old client-side
 * `useMemo` filter over `listGyms()`'s full table — the whole point of
 * P0/§12 in the task brief (never load the entire dataset just to filter or
 * paginate it in the browser).
 */
export async function listGymsPage(
  supabase: SupabaseClient<Database>,
  params: GymListParams,
): Promise<GymListResult> {
  const { data, error } = await supabase.rpc("admin_gyms_list", {
    p_search: params.search || undefined,
    p_status: params.status || undefined,
    p_package_id: params.packageId || undefined,
    p_billing_period: params.billingPeriod || undefined,
    p_min_branches: params.minBranches,
    p_sort_col: params.sortCol,
    p_sort_dir: params.sortDir,
    p_limit: params.limit ?? 25,
    p_offset: params.offset ?? 0,
  });
  if (error) throw new Error(`Failed to load the gyms list: ${error.message}`);

  const rows = (data ?? []) as AdminGymsListRow[];
  const now = new Date();
  const total = rows[0]?.total_count ?? 0;

  return {
    total,
    rows: rows.map((row) => {
      const gym = toGym(row, now);
      return {
        organizationId: row.organization_id,
        name: gym.name,
        ownerName: gym.owner,
        ownerEmail: row.owner_email ?? "—",
        city: gym.city,
        packageId: row.package_id,
        packageName: gym.package,
        period: gym.period,
        status: LIST_STATE_TO_STATUS[row.state] ?? gym.status,
        members: gym.members,
        cap: gym.cap,
        pct: gym.pct,
        branches: gym.branches,
        staff: gym.staff,
        renews: gym.renews,
        ltv: gym.ltv,
        createdAt: row.created_at,
      };
    }),
  };
}

export type PackageFilterOption = { id: string; label: string };

/** Every package (active AND archived) for the Gyms list's "Plan" filter —
 * unlike listAssignablePackages (active tiers only, for reassigning a
 * subscription), a filter needs to still find a gym sitting on a tier
 * that's since been archived. */
export async function listPackagesForFilter(supabase: SupabaseClient<Database>): Promise<PackageFilterOption[]> {
  const { data, error } = await supabase
    .from("platform_packages")
    .select("id, name, billing_period, status")
    .order("sort_order");
  if (error) throw new Error(`Failed to load packages: ${error.message}`);

  return (data ?? []).map((row) => ({
    id: row.id,
    label: `${row.name} (${capitalizeBillingPeriod(row.billing_period)})${row.status === "archived" ? " · archived" : ""}`,
  }));
}

export type AssignablePackage = {
  id: string;
  name: string;
  code: string;
  // Widened from "monthly" | "yearly" — see AdminGymRow's billing_period
  // above for why (dynamic plan cycles carry an arbitrary admin label).
  billingPeriod: string;
  price: string;
};

/** Backs the "change package" select in the Gyms manage-subscription sheet
 * — active tiers only, matching what a gym could newly buy today (an
 * archived tier stays valid for gyms already on it, but an admin
 * reassigning a subscription shouldn't be able to move a gym onto one).
 * Deliberately unfiltered by plan_id — an admin can reassign a gym onto
 * either a legacy package or a dynamic plan cycle, whichever is right for
 * that gym, independent of which one is globally live for new buyers. */
export async function listAssignablePackages(supabase: SupabaseClient<Database>): Promise<AssignablePackage[]> {
  const { data, error } = await supabase
    .from("platform_packages")
    .select("id, name, code, billing_period, price_minor, currency")
    .eq("status", "active")
    .order("sort_order");
  if (error) throw new Error(`Failed to load packages: ${error.message}`);

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    code: row.code,
    billingPeriod: row.billing_period,
    price: formatMinorWhole(row.price_minor, row.currency),
  }));
}
