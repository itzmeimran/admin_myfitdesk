/**
 * Mock data for the Gyms directory, copied verbatim (field-for-field) from
 * the design canvas's `GYMS` array (design-audit.md's Gyms section — 9
 * rows). Kept as a plain array + an async accessor so swapping this module
 * for src/features/gyms/queries.ts (a real Supabase read) is a one-file
 * change: every call site already awaits `listGyms()`.
 *
 * TODO(real-data): per design-audit.md's Data mapping section —
 * - Gyms enrolled: count(organizations) where deleted_at is null.
 * - Status pill: derived at read time from current_period_end and
 *   grace_days, never from organization_subscriptions.status directly
 *   (active → grace (within grace_days) → read-only (past grace)).
 * - Member usage: members vs the gym's platform_packages.max_members.
 * - Paid to date: sum of platform_payments for the gym.
 */

export type GymStatus = "Active" | "Trialing" | "Grace" | "Read-only" | "Cancelled" | "Suspended";

export type Gym = {
  name: string;
  owner: string;
  city: string;
  package: string;
  period: string;
  status: GymStatus;
  members: string;
  cap: string;
  /** Raw numeric percent (pre-"%" suffix), matching the design's own
   * GYMS[i].pct — used to drive the ≥90% ACCENT tone rule (`useTone`). */
  pct: number;
  branches: string;
  staff: string;
  /** Pre-formatted human string, e.g. "24 Sep", "Overdue 2d", "Trial ends
   * 11 Sep" — colored ACCENT when it starts with "Overdue" or "Trial". */
  renews: string;
  ltv: string;
  /** Not part of the design's mock shape — added for the subscription-
   * management actions (extend/change package/cancel/restore), which need
   * the real org and package ids the display strings above don't carry. */
  organizationId: string;
  packageId: string | null;
};

const GYMS: Gym[] = [
  { name: "Iron Yard Fitness", owner: "Rohit Malhotra", city: "Hyderabad", package: "Growth", period: "Monthly · ₹649", status: "Active", members: "486", cap: "500", pct: 97, branches: "3", staff: "7", renews: "24 Sep", ltv: "₹11,682", organizationId: "mock-1", packageId: null },
  { name: "Pulse Fitness Studio", owner: "Sneha Iyer", city: "Pune", package: "Pro", period: "Yearly · ₹8,490", status: "Active", members: "1,204", cap: "∞", pct: 34, branches: "6", staff: "14", renews: "12 Mar 27", ltv: "₹18,970", organizationId: "mock-2", packageId: null },
  { name: "Titan Strength Club", owner: "Imran Qureshi", city: "Kochi", package: "Starter", period: "Monthly · ₹449", status: "Grace", members: "288", cap: "300", pct: 96, branches: "1", staff: "3", renews: "Overdue 2d", ltv: "₹5,388", organizationId: "mock-3", packageId: null },
  { name: "Barbell & Co. Strength Studio", owner: "Yusuf Ali", city: "Lucknow", package: "Pro", period: "Monthly · ₹849", status: "Active", members: "892", cap: "∞", pct: 26, branches: "4", staff: "11", renews: "21 Sep", ltv: "₹7,641", organizationId: "mock-4", packageId: null },
  { name: "Apex Athletic Club", owner: "Farhan Shaikh", city: "Nagpur", package: "Growth", period: "Monthly · ₹649", status: "Read-only", members: "402", cap: "500", pct: 80, branches: "3", staff: "6", renews: "Overdue 9d", ltv: "₹9,086", organizationId: "mock-5", packageId: null },
  { name: "Core Culture Fitness", owner: "Aakash Bansal", city: "Jaipur", package: "Growth", period: "Yearly · ₹6,490", status: "Active", members: "341", cap: "500", pct: 68, branches: "2", staff: "5", renews: "2 Feb 27", ltv: "₹12,980", organizationId: "mock-6", packageId: null },
  { name: "FlexZone Gym", owner: "Divya Nair", city: "Indore", package: "Starter", period: "Trial · 14 days", status: "Trialing", members: "62", cap: "300", pct: 21, branches: "1", staff: "2", renews: "Trial ends 11 Sep", ltv: "₹0", organizationId: "mock-7", packageId: null },
  { name: "Ganesh Fitness Centre", owner: "Meera Krishnan", city: "Coimbatore", package: "Starter", period: "Monthly · ₹449", status: "Active", members: "143", cap: "300", pct: 48, branches: "1", staff: "2", renews: "18 Sep", ltv: "₹3,143", organizationId: "mock-8", packageId: null },
  { name: "Momentum Fitness", owner: "Kavya Reddy", city: "Visakhapatnam", package: "Growth", period: "Monthly · ₹649", status: "Cancelled", members: "210", cap: "500", pct: 42, branches: "2", staff: "4", renews: "Ends 30 Sep", ltv: "₹7,139", organizationId: "mock-9", packageId: null },
];

export async function listGyms(): Promise<Gym[]> {
  return GYMS;
}

export const GYM_FILTERS = ["All", "Active", "Trialing", "Grace", "Read-only", "Suspended"] as const;
export type GymFilter = (typeof GYM_FILTERS)[number];

export function isGymFilter(value: string | undefined): value is GymFilter {
  return !!value && (GYM_FILTERS as readonly string[]).includes(value);
}
