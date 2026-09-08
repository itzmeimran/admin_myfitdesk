/**
 * Mock data for the Overview dashboard — copied field-for-field from the
 * design canvas's `attention` / `tiles` / `mix` / `risk` / `limits` /
 * `signups` / `health` / `TREND` / `TREND_LABELS` arrays (read directly
 * from the design's `<script data-dc-script>` block, since design-audit.md
 * covered only the other 4 pages and Overview's data lived only in the raw
 * canvas HTML — see CLAUDE.md's "Completed" section).
 *
 * TODO(real-data): design-audit.md's Data mapping section, condensed —
 * - tiles/attention counts: organizations, organization_subscriptions
 *   joined to platform_packages (status derived from current_period_end +
 *   grace_days, never the stored `status` column), members, branches.
 * - trend: weekly MRR rollup, yearly packages normalised ÷ 12.
 * - mix: organization_subscriptions grouped by package, trialing/cancelled
 *   excluded from MRR.
 * - risk/limits: the same subscription-status derivation, joined to usage
 *   counts vs platform_packages caps.
 * - signups: organizations.created_at within the period.
 * - health (Billing pipeline): payment_provider_events (webhook inbox,
 *   currently unsurfaced — audit finding M-12) + platform_payments stuck
 *   at status 'created'.
 */

export type AttentionCell = {
  kind: string;
  count: string;
  detail: string;
  cta: string;
  /** Every cell here is ACCENT except "Trials ending" (INK) in the design. */
  accent: boolean;
  href: string;
};

export const ATTENTION: AttentionCell[] = [
  { kind: "In grace period", count: "4", detail: "Payment overdue, still writable. Read-only in 2–6 days.", cta: "Chase renewals", accent: true, href: "/admin/gyms?filter=Grace" },
  { kind: "Read-only", count: "2", detail: "Past grace. Staff can read but not record payments.", cta: "Review accounts", accent: true, href: "/admin/gyms?filter=Read-only" },
  { kind: "Failed charges", count: "3", detail: "₹1,747 across 3 gyms since 1 Sep. Razorpay declined.", cta: "Open invoices", accent: true, href: "/admin/revenue" },
  { kind: "Trials ending", count: "9", detail: "Within 7 days. 4 have recorded a payment already.", cta: "See trials", accent: false, href: "/admin/gyms?filter=Trialing" },
];

export type KpiTile = { label: string; value: string; hint: string; emphasis?: boolean; accentValue?: boolean };

export const TILES: KpiTile[] = [
  { label: "Gyms enrolled", value: "128", hint: "+6 in September" },
  { label: "Recurring revenue", value: "₹75,472", hint: "+₹4,190 vs August", emphasis: true },
  { label: "Members on platform", value: "41,382", hint: "Across 214 branches" },
  { label: "Paid gyms", value: "119", hint: "9 trialing · 2 read-only" },
  { label: "Renewals due in 7 days", value: "23", hint: "₹12,940 expected", accentValue: true },
];

export type MixRow = { name: string; price: string; gyms: string; mrr: string; pct: string; muted?: boolean };

export const MIX: MixRow[] = [
  { name: "Growth", price: "₹649 / mo · ₹6,490 / yr", gyms: "58", mrr: "₹36,128", pct: "45%" },
  { name: "Starter", price: "₹449 / mo · ₹4,490 / yr", gyms: "70", mrr: "₹30,756", pct: "38%" },
  { name: "Pro", price: "₹849 / mo · ₹8,490 / yr", gyms: "34", mrr: "₹27,309", pct: "34%" },
  { name: "No package (trialing)", price: "14-day trial", gyms: "9", mrr: "₹0", pct: "7%", muted: true },
];

export type RiskRow = {
  gym: string;
  owner: string;
  city: string;
  status: "Read-only" | "Grace" | "Cancelled" | "Trialing";
  package: string;
  amount: string;
  due: string;
  dueAccent: boolean;
  action: string;
};

export const RISK: RiskRow[] = [
  { gym: "Apex Athletic Club", owner: "Farhan Shaikh", city: "Nagpur", status: "Read-only", package: "Growth monthly", amount: "₹649", due: "Overdue 9 days", dueAccent: true, action: "Extend" },
  { gym: "Titan Strength Club", owner: "Imran Qureshi", city: "Kochi", status: "Grace", package: "Starter monthly", amount: "₹449", due: "Overdue 2 days", dueAccent: true, action: "Remind" },
  { gym: "Barbell & Co. Strength Studio", owner: "Yusuf Ali", city: "Lucknow", status: "Grace", package: "Pro monthly", amount: "₹849", due: "Overdue 1 day", dueAccent: true, action: "Remind" },
  { gym: "Momentum Fitness", owner: "Kavya Reddy", city: "Visakhapatnam", status: "Cancelled", package: "Growth monthly", amount: "₹649", due: "Ends 30 Sep", dueAccent: false, action: "Call" },
  { gym: "FlexZone Gym", owner: "Divya Nair", city: "Indore", status: "Trialing", package: "No package yet", amount: "—", due: "Trial ends 11 Sep", dueAccent: false, action: "Nudge" },
];

export type LimitRow = { gym: string; pctLabel: string; pct: number; accent: boolean; detail: string };

export const LIMITS: LimitRow[] = [
  { gym: "Iron Yard Fitness", pctLabel: "97%", pct: 97, accent: true, detail: "486 of 500 members on Growth · 3 of 3 branches used" },
  { gym: "Titan Strength Club", pctLabel: "96%", pct: 96, accent: true, detail: "288 of 300 members on Starter · single branch" },
  { gym: "Core Culture Fitness", pctLabel: "68%", pct: 68, accent: false, detail: "341 of 500 members · asked about a 4th branch on 2 Sep" },
];

export type SignupRow = { initials: string; gym: string; detail: string; pill: "Paid" | "Trial" };

export const SIGNUPS: SignupRow[] = [
  { initials: "SF", gym: "Steel City Gym", detail: "Growth monthly · Bhilai · 6 Sep", pill: "Paid" },
  { initials: "UF", gym: "Urban Fit Collective", detail: "Trial · Gurugram · 5 Sep", pill: "Trial" },
  { initials: "ZF", gym: "Zenith Fitness Kollam", detail: "Starter monthly · Kollam · 4 Sep", pill: "Paid" },
  { initials: "FZ", gym: "FlexZone Gym", detail: "Trial · Indore · 28 Aug", pill: "Trial" },
];

export type HealthRow = { label: string; value: string; warn?: boolean };

export const HEALTH: HealthRow[] = [
  { label: "Razorpay webhooks, 24h", value: "412 ok" },
  { label: "Signature failures", value: "0" },
  { label: "Orders stuck as created", value: "2", warn: true },
  { label: "Refunds this month", value: "₹649" },
];

export const TREND = [58.4, 60.9, 60.2, 63.8, 63.1, 66.7, 66.0, 69.9, 69.2, 71.6, 74.1, 75.5];
export const TREND_LABELS = ["16 Jun", "", "30 Jun", "", "14 Jul", "", "28 Jul", "", "11 Aug", "", "25 Aug", "1 Sep"];

export type TrendBar = { value: number; label: string; heightPct: number; last: boolean };

export function trendBars(): TrendBar[] {
  const max = Math.max(...TREND);
  return TREND.map((v, i) => ({
    value: v,
    label: TREND_LABELS[i] ?? "",
    heightPct: (v / max) * 100,
    last: i === TREND.length - 1,
  }));
}

export const PERIODS = ["This month", "Quarter", "Year"] as const;
export type Period = (typeof PERIODS)[number];
