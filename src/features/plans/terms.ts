/**
 * The four billing terms this product sells. One package, four terms,
 * a longer term costs less per month — that's the whole pricing model, and
 * this array is the single place it is spelled out.
 *
 * Each term is one `platform_packages` row with a non-null `plan_id` (see
 * supabase/migrations/1008_plans_schema_and_rpcs.sql). A term's row is
 * matched by `duration_days`, not by its `billing_period` label: the label
 * is display text an earlier session could have typed differently, while
 * duration_days is what every piece of real period math (settlement,
 * renewal, MRR normalisation in admin_package_mix) already keys off.
 *
 * Half-Yearly is 180 days (6 × 30), not a calendar-accurate 182/183 — kept
 * on the same 30-day-per-month convention Quarterly (90 = 3 × 30) and
 * Annual (365, the one exception — a real year) already use, so the
 * derived list-price ladder (monthly × months) stays internally consistent.
 */

export type TermKey = "monthly" | "quarterly" | "half_yearly" | "annual";

export type Term = {
  key: TermKey;
  /** Stored in platform_packages.billing_period and shown to gym owners. */
  label: string;
  /** How many months of access the term buys — drives the derived list price. */
  months: number;
  /** Stored in platform_packages.duration_days; also the row's identity here. */
  durationDays: number;
};

export const TERMS: readonly Term[] = [
  { key: "monthly", label: "Monthly", months: 1, durationDays: 30 },
  { key: "quarterly", label: "Quarterly", months: 3, durationDays: 90 },
  { key: "half_yearly", label: "Half-Yearly", months: 6, durationDays: 180 },
  { key: "annual", label: "Annual", months: 12, durationDays: 365 },
] as const;

export function termFromDurationDays(durationDays: number): Term | undefined {
  return TERMS.find((t) => t.durationDays === durationDays);
}

/** List price before any discount: the monthly price × the term's months.
 * Deliberately derived rather than typed per term — the admin sets one
 * monthly price and a discount per longer term, which is the whole point of
 * this screen being simpler than the catalogue it replaced. */
export function listPriceMinor(monthlyPriceMinor: number, term: Term): number {
  return monthlyPriceMinor * term.months;
}

/** What a gym actually pays, after the term's percentage discount. Mirrors
 * `plan_effective_price()` in SQL (round half away from zero, never below
 * one minor unit) — that function, not this one, is what a real charge is
 * computed from; this is for display and for sanity-checking the ladder. */
export function effectivePriceMinor(listMinor: number, discountPercent: number): number {
  if (discountPercent <= 0) return listMinor;
  const discounted = Math.round(listMinor * (1 - discountPercent / 100));
  return Math.max(1, Math.min(listMinor, discounted));
}

/** A slug usable as a `plans.code` / `platform_packages.code` fragment. */
export function slugifyCode(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return slug || "package";
}
