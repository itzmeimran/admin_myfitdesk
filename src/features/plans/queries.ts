import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/core/db/database.types";

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
