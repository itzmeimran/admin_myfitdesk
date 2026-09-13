import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/core/db/database.types";
import { TERMS, type TermKey } from "./terms";

/**
 * The dynamic Plans system (supabase/migrations/1008_plans_schema_and_rpcs.sql)
 * — additive alongside features/packages/* (the legacy Starter/Growth/Pro
 * catalogue, which this file never reads or writes). A `plans` row is the
 * parent; `platform_packages` rows with a non-null `plan_id` are its billing
 * cycles; `plan_features` and `plan_offers` (per-cycle) round it out.
 *
 * gym_count/mrr_minor per cycle reuse the same admin_package_mix() RPC
 * features/packages/queries.ts already calls — it returns every
 * platform_packages row, legacy and dynamic together, keyed by package_id.
 */

export type PlanOffer = {
  id: string;
  discountType: "percent" | "fixed";
  discountValue: number;
  startsAt: string | null;
  expiresAt: string | null;
  isEnabled: boolean;
};

export type PlanCycle = {
  id: string;
  billingPeriod: string;
  priceMinor: number;
  currency: string;
  durationDays: number;
  maxBranches: number | null;
  maxMembers: number | null;
  maxStaff: number | null;
  status: "active" | "archived";
  isPurchasable: boolean;
  sortOrder: number;
  gymCount: number;
  mrrMinor: number;
  offers: PlanOffer[];
};

export type PlanFeature = {
  id: string;
  name: string;
  description: string | null;
  isEnabled: boolean;
  sortOrder: number;
};

export type Plan = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: "active" | "archived";
  isPurchasable: boolean;
  sortOrder: number;
  cycles: PlanCycle[];
  features: PlanFeature[];
  gymCount: number;
  mrrMinor: number;
};

type PlanMixRow = {
  package_id: string;
  gym_count: number;
  mrr_minor: number;
};

type PlanRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: "active" | "archived";
  is_purchasable: boolean;
  sort_order: number;
  platform_packages: {
    id: string;
    billing_period: string;
    price_minor: number;
    currency: string;
    duration_days: number;
    max_branches: number | null;
    max_members: number | null;
    max_staff: number | null;
    status: "active" | "archived";
    is_purchasable: boolean;
    sort_order: number;
    plan_offers: {
      id: string;
      discount_type: "percent" | "fixed";
      discount_value: number;
      starts_at: string | null;
      expires_at: string | null;
      is_enabled: boolean;
    }[];
  }[];
  plan_features: {
    id: string;
    name: string;
    description: string | null;
    is_enabled: boolean;
    sort_order: number;
  }[];
};

export async function listPlans(supabase: SupabaseClient<Database>): Promise<Plan[]> {
  const [{ data: rows, error: rowsError }, { data: mix, error: mixError }] = await Promise.all([
    supabase
      .from("plans")
      .select(
        "id, code, name, description, status, is_purchasable, sort_order, " +
          "platform_packages(id, billing_period, price_minor, currency, duration_days, max_branches, max_members, max_staff, status, is_purchasable, sort_order, " +
          "plan_offers(id, discount_type, discount_value, starts_at, expires_at, is_enabled)), " +
          "plan_features(id, name, description, is_enabled, sort_order)",
      )
      .order("sort_order", { ascending: true }),
    supabase.rpc("admin_package_mix"),
  ]);

  if (rowsError) throw new Error(`Failed to load plans: ${rowsError.message}`);
  if (mixError) throw new Error(`Failed to load the package mix: ${mixError.message}`);

  const mixById = new Map((mix as PlanMixRow[] | null ?? []).map((m) => [m.package_id, m]));
  const planRows = (rows ?? []) as unknown as PlanRow[];

  return planRows.map((row) => {
    const cycles: PlanCycle[] = (row.platform_packages ?? [])
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((c) => {
        const m = mixById.get(c.id);
        return {
          id: c.id,
          billingPeriod: c.billing_period,
          priceMinor: c.price_minor,
          currency: c.currency,
          durationDays: c.duration_days,
          maxBranches: c.max_branches,
          maxMembers: c.max_members,
          maxStaff: c.max_staff,
          status: c.status,
          isPurchasable: c.is_purchasable,
          sortOrder: c.sort_order,
          gymCount: m?.gym_count ?? 0,
          mrrMinor: m?.mrr_minor ?? 0,
          offers: (c.plan_offers ?? []).map((o) => ({
            id: o.id,
            discountType: o.discount_type,
            discountValue: o.discount_value,
            startsAt: o.starts_at,
            expiresAt: o.expires_at,
            isEnabled: o.is_enabled,
          })),
        };
      });

    const features: PlanFeature[] = (row.plan_features ?? [])
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((f) => ({
        id: f.id,
        name: f.name,
        description: f.description,
        isEnabled: f.is_enabled,
        sortOrder: f.sort_order,
      }));

    return {
      id: row.id,
      code: row.code,
      name: row.name,
      description: row.description,
      status: row.status,
      isPurchasable: row.is_purchasable,
      sortOrder: row.sort_order,
      cycles,
      features,
      gymCount: cycles.reduce((sum, c) => sum + c.gymCount, 0),
      mrrMinor: cycles.reduce((sum, c) => sum + c.mrrMinor, 0),
    };
  });
}

// ───────────────────────────────────────────────────────────────────────
// The simplified /admin/packages view of the same data.
//
// The plans schema is deliberately general (many plans × many cycles ×
// many offers). This product sells exactly one package on three terms, so
// everything below flattens that generality into the shape the screen
// actually renders: one package, one monthly price, one discount per
// longer term. Nothing is hidden from the database — a cycle that doesn't
// match one of the three terms still surfaces, as `extraTerms`, so an
// operator can see and retire it rather than wonder where it went.
// ───────────────────────────────────────────────────────────────────────

export type PackageTerm = {
  key: TermKey;
  label: string;
  months: number;
  durationDays: number;
  /** null when this term has no platform_packages row yet. */
  cycleId: string | null;
  listPriceMinor: number;
  /** 0 when there is no enabled percentage offer on this term. */
  discountPercent: number;
  offerId: string | null;
  isPurchasable: boolean;
  status: "active" | "archived";
  gymCount: number;
};

export type SimplePackage = {
  id: string;
  code: string;
  name: string;
  description: string;
  status: "active" | "archived";
  currency: string;
  monthlyPriceMinor: number;
  maxBranches: number | null;
  maxMembers: number | null;
  maxStaff: number | null;
  features: PlanFeature[];
  terms: PackageTerm[];
  /** Cycles whose duration_days isn't 30/90/365 — legacy of the older, more
   * general Plans screen. Shown read-only so they can be retired. */
  extraTerms: PlanCycle[];
  gymCount: number;
  mrrMinor: number;
};

/** The one enabled percentage offer on a cycle, if any. `plan_effective_price`
 * picks the largest active discount when an admin somehow books more than
 * one; this mirrors that tie-break so the screen shows the price buyers get. */
function activePercentOffer(cycle: PlanCycle): PlanOffer | null {
  const candidates = cycle.offers.filter((o) => o.isEnabled && o.discountType === "percent");
  if (candidates.length === 0) return null;
  return candidates.reduce((best, o) => (o.discountValue > best.discountValue ? o : best));
}

function toSimplePackage(plan: Plan): SimplePackage {
  const byDuration = new Map<number, PlanCycle>();
  for (const cycle of plan.cycles) {
    if (!byDuration.has(cycle.durationDays)) byDuration.set(cycle.durationDays, cycle);
  }

  const monthlyCycle = byDuration.get(30) ?? null;
  // Caps are plan-wide (admin_set_plan_caps writes every cycle of the plan
  // at once), so any cycle is an equally good source — prefer the monthly
  // row so a plan whose monthly term hasn't been created yet still reads.
  const capSource = monthlyCycle ?? plan.cycles[0] ?? null;

  const terms: PackageTerm[] = TERMS.map((term) => {
    const cycle = byDuration.get(term.durationDays) ?? null;
    const offer = cycle ? activePercentOffer(cycle) : null;
    return {
      key: term.key,
      label: term.label,
      months: term.months,
      durationDays: term.durationDays,
      cycleId: cycle?.id ?? null,
      listPriceMinor: cycle?.priceMinor ?? 0,
      discountPercent: offer?.discountValue ?? 0,
      offerId: offer?.id ?? null,
      isPurchasable: cycle?.isPurchasable ?? false,
      status: cycle?.status ?? "archived",
      gymCount: cycle?.gymCount ?? 0,
    };
  });

  const knownDurations = new Set(TERMS.map((t) => t.durationDays));

  return {
    id: plan.id,
    code: plan.code,
    name: plan.name,
    description: plan.description ?? "",
    status: plan.status,
    currency: capSource?.currency ?? "INR",
    monthlyPriceMinor: monthlyCycle?.priceMinor ?? 0,
    maxBranches: capSource?.maxBranches ?? null,
    maxMembers: capSource?.maxMembers ?? null,
    maxStaff: capSource?.maxStaff ?? null,
    features: plan.features,
    terms,
    extraTerms: plan.cycles.filter((c) => !knownDurations.has(c.durationDays)),
    gymCount: plan.gymCount,
    mrrMinor: plan.mrrMinor,
  };
}

/**
 * The single package this screen manages, or null when none has been set up
 * yet. If more than one plan row exists (built through the older general
 * Plans screen), the active one with the lowest sort_order wins — the screen
 * says so rather than silently picking.
 */
export async function getSimplePackage(
  supabase: SupabaseClient<Database>,
): Promise<{ pkg: SimplePackage | null; otherPlanCount: number }> {
  const plans = await listPlans(supabase);
  const active = plans.filter((p) => p.status === "active");
  const chosen = active[0] ?? plans[0] ?? null;

  return {
    pkg: chosen ? toSimplePackage(chosen) : null,
    otherPlanCount: Math.max(0, plans.length - (chosen ? 1 : 0)),
  };
}
