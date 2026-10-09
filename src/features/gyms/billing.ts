import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/core/db/database.types";
import { formatMinorWhole } from "@/core/money/format";
import { formatShortDate } from "@/core/dates/format";
import type { InvoiceStatus } from "../revenue/mock-data";
import { paymentMethodLabel } from "./payment-method";

/** Subscription & Billing tab (task brief §4) — platform_payments scoped to
 * one organization, via `admin_gym_billing_history()` (supabase/migrations/
 * 1009_admin_gym_detail.sql). Same status vocabulary as the Revenue page
 * (revenue/queries.ts's STATUS_MAP) — platform_payments.status is a 5-value
 * CHECK constraint the generated types can't narrow, hence the same
 * `as keyof typeof STATUS_MAP` cast used there. */
const STATUS_MAP: Record<"created" | "succeeded" | "failed" | "refunded" | "cancelled", InvoiceStatus> = {
  succeeded: "Succeeded",
  failed: "Failed",
  refunded: "Refunded",
  created: "Pending",
  cancelled: "Cancelled",
};

export type BillingHistoryRow = {
  id: string;
  invoiceNumber: string;
  amount: string;
  status: InvoiceStatus;
  provider: string;
  /** "Cash"/"UPI"/etc. for a manually-recorded payment (features/gyms/
   * payment-method.ts), "Online" for a razorpay row (method is always null
   * there — the gateway itself is that row's "method"). */
  method: string;
  paidAt: string | null;
  period: string;
  packageName: string;
  createdAt: string;
};

export type BillingHistoryParams = {
  status?: string;
  provider?: string;
  method?: string;
  dateFrom?: string;
  dateTo?: string;
  sortCol?: string;
  sortDir?: "asc" | "desc";
  limit?: number;
  offset?: number;
};

type AdminGymBillingHistoryRow = {
  id: string;
  invoice_number: string | null;
  amount_minor: number;
  currency: string;
  status: string;
  provider: string;
  method: string | null;
  paid_at: string | null;
  period_start: string | null;
  period_end: string | null;
  package_name: string | null;
  created_at: string;
  total_count: number;
};

export type UnappliedPayment = {
  paymentId: string;
  invoiceNumber: string;
  packageName: string;
  billingPeriod: string;
  amount: string;
  paidAt: string | null;
  coverageEnd: string;
};

/** Paid-for packages the subscription never received (migration 1031). A
 * missing function (migration not applied yet) reads as "none" rather than
 * breaking the Billing tab. */
export async function getUnappliedPayments(
  supabase: SupabaseClient<Database>,
  organizationId: string,
): Promise<UnappliedPayment[]> {
  const { data, error } = await supabase.rpc("admin_unapplied_payments", { p_organization_id: organizationId });
  if (error) {
    if (error.code === "PGRST202") return [];
    throw new Error(`Failed to check unapplied payments: ${error.message}`);
  }
  return (data ?? []).map((row) => ({
    paymentId: row.payment_id,
    invoiceNumber: row.invoice_number ?? "—",
    packageName: row.package_name,
    billingPeriod: row.billing_period,
    amount: formatMinorWhole(row.amount_minor, row.currency),
    paidAt: row.paid_at,
    coverageEnd: row.period_end,
  }));
}

export async function getGymBillingHistory(
  supabase: SupabaseClient<Database>,
  organizationId: string,
  params: BillingHistoryParams,
): Promise<{ rows: BillingHistoryRow[]; total: number }> {
  const { data, error } = await supabase.rpc("admin_gym_billing_history", {
    p_organization_id: organizationId,
    p_status: params.status || undefined,
    p_provider: params.provider || undefined,
    p_date_from: params.dateFrom || undefined,
    p_date_to: params.dateTo || undefined,
    p_method: params.method || undefined,
    p_sort_col: params.sortCol,
    p_sort_dir: params.sortDir,
    p_limit: params.limit ?? 25,
    p_offset: params.offset ?? 0,
  });
  if (error) throw new Error(`Failed to load billing history: ${error.message}`);

  const rows = (data ?? []) as AdminGymBillingHistoryRow[];
  const now = new Date();

  return {
    total: rows[0]?.total_count ?? 0,
    rows: rows.map((row) => ({
      id: row.id,
      invoiceNumber: row.invoice_number ?? "—",
      amount: formatMinorWhole(row.amount_minor, row.currency),
      status: STATUS_MAP[row.status as keyof typeof STATUS_MAP] ?? "Pending",
      provider: row.provider,
      method: paymentMethodLabel(row.method),
      paidAt: row.paid_at ? formatShortDate(new Date(row.paid_at), now) : null,
      period:
        row.period_start && row.period_end
          ? `${formatShortDate(new Date(row.period_start), now)} – ${formatShortDate(new Date(row.period_end), now)}`
          : "—",
      packageName: row.package_name ?? "—",
      createdAt: row.created_at,
    })),
  };
}
