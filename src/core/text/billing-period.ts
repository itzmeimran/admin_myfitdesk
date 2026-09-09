/**
 * `platform_packages.billing_period` widened from a 2-value "monthly"/
 * "yearly" CHECK to an arbitrary admin-defined label once dynamic Plans
 * (supabase/migrations/1008_plans_schema_and_rpcs.sql) let a plan cycle be
 * "Quarterly", "Annual", or anything else an admin types — the legacy rows
 * still say "monthly"/"yearly" verbatim. Every screen that used to do
 * `billingPeriod === "yearly" ? "Yearly" : "Monthly"` needs to stop
 * assuming there are only two possible values; this just capitalizes
 * whatever label is actually on the row, matching
 * features/gyms/queries.ts's own `formatPeriod` fix for the same issue.
 */
export function capitalizeBillingPeriod(billingPeriod: string | null | undefined): string {
  if (!billingPeriod) return "—";
  return billingPeriod.charAt(0).toUpperCase() + billingPeriod.slice(1);
}
