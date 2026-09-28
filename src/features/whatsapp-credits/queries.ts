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
