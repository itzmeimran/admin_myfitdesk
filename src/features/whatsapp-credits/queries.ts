import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/core/db/database.types";

export type WhatsAppCreditPackage = {
  id: string;
  code: string;
  name: string;
  credits: number;
  priceMinor: number;
  currency: string;
  status: "active" | "archived";
  sortOrder: number;
};

export type WhatsAppCreditGym = {
  organizationId: string;
  name: string;
  gymCode: string;
  city: string;
  integrationStatus: string;
  balance: number;
  purchasedTotal: number;
  usedTotal: number;
};

export type WhatsAppMetaCategory = "utility" | "marketing" | "authentication";

export type WhatsAppProfitabilityCategory = {
  category: WhatsAppMetaCategory;
  messages: number;
  delivered: number;
  unpriced: number;
  estimatedCostMinor: number;
  currentRateMinor: number | null;
  rateEffectiveFrom: string | null;
};

export type WhatsAppProfitability = {
  from: string;
  to: string;
  currency: string;
  rechargeIncomeMinor: number;
  creditsSold: number;
  rechargeCount: number;
  creditsUsed: number;
  creditChargeEvents: number;
  managedMessages: number;
  deliveredMessages: number;
  ownWabaMessages: number;
  estimatedMetaCostMinor: number;
  grossMarginMinor: number;
  marginPercent: number | null;
  unpricedMessages: number;
  categories: WhatsAppProfitabilityCategory[];
};

type ProfitabilityPayload = {
  from?: string;
  to?: string;
  currency?: string;
  recharge_income_minor?: number;
  credits_sold?: number;
  recharge_count?: number;
  credits_used?: number;
  credit_charge_events?: number;
  managed_messages?: number;
  delivered_messages?: number;
  own_waba_messages?: number;
  estimated_meta_cost_minor?: number;
  gross_margin_minor?: number;
  margin_percent?: number | null;
  unpriced_messages?: number;
  categories?: Array<{
    category?: string;
    messages?: number;
    delivered?: number;
    unpriced?: number;
    estimated_cost_minor?: number;
    current_rate_minor?: number | null;
    rate_effective_from?: string | null;
  }>;
};

const numberOrZero = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);

export async function getWhatsAppProfitability(
  supabase: SupabaseClient<Database>,
  range: { from: string; to: string; currency?: string },
): Promise<WhatsAppProfitability> {
  const { data, error } = await supabase.rpc("admin_whatsapp_profitability", {
    p_from: range.from,
    p_to: range.to,
    p_currency: range.currency ?? "INR",
  });
  if (error) throw new Error(`Failed to load WhatsApp profitability: ${error.message}`);

  const raw = (data ?? {}) as ProfitabilityPayload;
  const categoryOrder: WhatsAppMetaCategory[] = ["utility", "marketing", "authentication"];
  const byCategory = new Map((raw.categories ?? []).map((row) => [row.category, row]));

  return {
    from: raw.from ?? range.from,
    to: raw.to ?? range.to,
    currency: raw.currency ?? range.currency ?? "INR",
    rechargeIncomeMinor: numberOrZero(raw.recharge_income_minor),
    creditsSold: numberOrZero(raw.credits_sold),
    rechargeCount: numberOrZero(raw.recharge_count),
    creditsUsed: numberOrZero(raw.credits_used),
    creditChargeEvents: numberOrZero(raw.credit_charge_events),
    managedMessages: numberOrZero(raw.managed_messages),
    deliveredMessages: numberOrZero(raw.delivered_messages),
    ownWabaMessages: numberOrZero(raw.own_waba_messages),
    estimatedMetaCostMinor: numberOrZero(raw.estimated_meta_cost_minor),
    grossMarginMinor: numberOrZero(raw.gross_margin_minor),
    marginPercent: typeof raw.margin_percent === "number" ? raw.margin_percent : null,
    unpricedMessages: numberOrZero(raw.unpriced_messages),
    categories: categoryOrder.map((category) => {
      const row = byCategory.get(category);
      return {
        category,
        messages: numberOrZero(row?.messages),
        delivered: numberOrZero(row?.delivered),
        unpriced: numberOrZero(row?.unpriced),
        estimatedCostMinor: numberOrZero(row?.estimated_cost_minor),
        currentRateMinor: typeof row?.current_rate_minor === "number" ? row.current_rate_minor : null,
        rateEffectiveFrom: typeof row?.rate_effective_from === "string" ? row.rate_effective_from : null,
      };
    }),
  };
}

export async function listWhatsAppCreditPackages(
  supabase: SupabaseClient<Database>,
): Promise<WhatsAppCreditPackage[]> {
  const { data, error } = await supabase
    .from("whatsapp_credit_packages")
    .select("id, code, name, credits, price_minor, currency, status, sort_order")
    .order("sort_order")
    .order("created_at");

  if (error) throw new Error(`Failed to load WhatsApp credit packages: ${error.message}`);

  return (data ?? []).map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    credits: row.credits,
    priceMinor: row.price_minor,
    currency: row.currency,
    status: row.status === "archived" ? "archived" : "active",
    sortOrder: row.sort_order,
  }));
}

export async function listWhatsAppCreditGyms(
  supabase: SupabaseClient<Database>,
  params: { search?: string; limit: number; offset: number },
): Promise<{ rows: WhatsAppCreditGym[]; total: number }> {
  const { data, error } = await supabase.rpc("admin_whatsapp_credit_gyms", {
    p_search: params.search || undefined,
    p_limit: params.limit,
    p_offset: params.offset,
  });

  if (error) throw new Error(`Failed to load gym WhatsApp credits: ${error.message}`);
  const rows = data ?? [];

  return {
    rows: rows.map((row) => ({
      organizationId: row.organization_id,
      name: row.gym_name,
      gymCode: row.gym_code ?? "—",
      city: row.city ?? "—",
      integrationStatus: row.integration_status ?? "Not connected",
      balance: row.balance,
      purchasedTotal: row.purchased_total,
      usedTotal: row.used_total,
    })),
    total: rows[0]?.total_count ?? 0,
  };
}
