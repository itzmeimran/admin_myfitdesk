import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/core/db/database.types";
import { formatMinorWhole } from "@/core/money/format";
import { formatShortDate, daysBetween } from "@/core/dates/format";
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
  billing_period: "monthly" | "yearly" | null;
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
  const period = row.billing_period === "yearly" ? "Yearly" : "Monthly";
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

export async function listGyms(supabase: SupabaseClient<Database>): Promise<Gym[]> {
  const { data, error } = await supabase.rpc("admin_gym_directory");
  if (error) throw new Error(`Failed to load the gym directory: ${error.message}`);

  const now = new Date();
  return ((data ?? []) as AdminGymRow[]).map((row) => toGym(row, now));
}

export type AssignablePackage = {
  id: string;
  name: string;
  code: string;
  billingPeriod: "monthly" | "yearly";
  price: string;
};

/** Backs the "change package" select in the Gyms manage-subscription sheet
 * — active tiers only, matching what a gym could newly buy today (an
 * archived tier stays valid for gyms already on it, but an admin
 * reassigning a subscription shouldn't be able to move a gym onto one). */
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
    // billing_period is `text` with a CHECK constraint, not a native enum —
    // see the same note on platform_payments.status in revenue/queries.ts.
    billingPeriod: row.billing_period as "monthly" | "yearly",
    price: formatMinorWhole(row.price_minor, row.currency),
  }));
}
