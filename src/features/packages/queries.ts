import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/core/db/database.types";
import { formatMinorWhole } from "@/core/money/format";
import type { Package, PackageCap, PackageState } from "./mock-data";

/**
 * Real replacement for mock-data.ts's `listPackages()` — same output shape
 * (`Package[]`), so `PackagesView` needs no changes. Reads `platform_packages`
 * directly (RLS: platform_packages_select is `true` for any authenticated
 * user, platform_packages_admin_write additionally grants this app write —
 * unused this pass, see the task's read-only scope note) joined in-memory to
 * `public.admin_package_mix()` (supabase/migrations/1002_admin_read_
 * functions.sql) for gym_count/mrr_minor per tier.
 *
 * `database.types.ts` predates admin_package_mix(), hence the typed cast
 * below — same pattern as src/features/gyms/queries.ts.
 */
type AdminPackageMixRow = {
  package_id: string;
  code: string;
  name: string;
  billing_period: "monthly" | "yearly";
  price_minor: number;
  gym_count: number;
  mrr_minor: number;
};

export async function listPackages(
  supabase: SupabaseClient<Database>,
  period: "Monthly" | "Yearly",
): Promise<Package[]> {
  const billingPeriod = period === "Yearly" ? "yearly" : "monthly";

  const rpc = supabase.rpc as unknown as (
    fn: "admin_package_mix",
  ) => Promise<{ data: AdminPackageMixRow[] | null; error: { message: string } | null }>;

  const [{ data: rows, error: rowsError }, { data: mix, error: mixError }] = await Promise.all([
    supabase
      .from("platform_packages")
      .select(
        "id, code, name, description, price_minor, currency, billing_period, duration_days, max_branches, max_members, max_staff, status, sort_order",
      )
      .eq("billing_period", billingPeriod)
      .order("sort_order"),
    rpc("admin_package_mix"),
  ]);

  if (rowsError) throw new Error(`Failed to load the package catalogue: ${rowsError.message}`);
  if (mixError) throw new Error(`Failed to load the package mix: ${mixError.message}`);

  const mixRows = mix ?? [];
  const mixById = new Map(mixRows.map((m) => [m.package_id, m]));
  // Share is of platform recurring revenue as a WHOLE — the sum across
  // every package_mix row (both billing periods), not just this period's
  // subset — matching the design's own "% of platform recurring revenue"
  // copy (task brief, Package 1 step 4).
  const totalMrrMinor = mixRows.reduce((sum, m) => sum + m.mrr_minor, 0);

  return (rows ?? []).map((row) => {
    const m = mixById.get(row.id);
    const gymCount = m?.gym_count ?? 0;
    const mrrMinor = m?.mrr_minor ?? 0;
    const pct = totalMrrMinor > 0 ? Math.round((mrrMinor / totalMrrMinor) * 100) : 0;
    const state: PackageState = row.status === "archived" ? "Archived" : "Active";

    const caps: PackageCap[] = [
      { k: "Branches", v: row.max_branches === null ? "Unlimited" : String(row.max_branches) },
      { k: "Members", v: row.max_members === null ? "Unlimited" : String(row.max_members) },
      { k: "Staff logins", v: row.max_staff === null ? "Unlimited" : String(row.max_staff) },
    ];

    const pkg: Package = {
      name: row.name,
      code: row.code,
      price: formatMinorWhole(row.price_minor, row.currency),
      per: period === "Yearly" ? "/ year" : "/ month",
      desc: row.description ?? "",
      state,
      gyms: gymCount.toLocaleString("en-IN"),
      mrr: formatMinorWhole(mrrMinor, row.currency),
      share: `${pct}%`,
      caps,
      // TODO(product-decision): "featured tier" isn't a real column on
      // platform_packages — the design featured "Growth" with no stated
      // rule for why. Omitting `featured` entirely (no package featured)
      // rather than guessing a rule (e.g. "highest gym_count") that risks
      // being wrong. Add a `platform_packages.featured boolean` column if
      // this needs to come back.
      secondary: state === "Archived" ? "Restore" : "Archive",
      raw: {
        id: row.id,
        description: row.description ?? "",
        priceMinor: row.price_minor,
        currency: row.currency,
        durationDays: row.duration_days,
        maxBranches: row.max_branches,
        maxMembers: row.max_members,
        maxStaff: row.max_staff,
      },
    };
    return pkg;
  });
}
