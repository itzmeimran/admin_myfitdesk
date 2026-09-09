import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/core/db/database.types";
import { formatMinorWhole } from "@/core/money/format";
import { formatShortDate } from "@/core/dates/format";
import type { RevenueTile, Invoice, InvoiceStatus } from "./mock-data";

/**
 * Real replacement for mock-data.ts's `listInvoices()`/`getRevenueTiles()` —
 * same output shapes, so revenue/page.tsx (which renders everything inline,
 * no separate client view) is the only other file this pass touches. Reads
 * `platform_payments` directly (RLS: platform_payments_admin_select,
 * supabase/migrations/1002_admin_read_functions.sql) — MyFitDesk's own
 * charges to gym owners, never the tenant `payments` table.
 */

const STATUS_MAP: Record<"created" | "succeeded" | "failed" | "refunded", InvoiceStatus> = {
  succeeded: "Succeeded",
  failed: "Failed",
  refunded: "Refunded",
  created: "Pending",
};

function formatInvoicePeriod(start: string | null, end: string | null, now: Date): string {
  if (!start || !end) return "—";
  return `${formatShortDate(new Date(start), now)} – ${formatShortDate(new Date(end), now)}`;
}

function currentMonthRange(now: Date): { start: Date; end: Date } {
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { start, end };
}

export async function listInvoices(supabase: SupabaseClient<Database>): Promise<Invoice[]> {
  const { data, error } = await supabase
    .from("platform_payments")
    .select(
      "id, invoice_number, amount_minor, currency, status, period_start, period_end, organizations(name), platform_packages(name, billing_period)",
    )
    .order("created_at", { ascending: false })
    .limit(6);

  if (error) throw new Error(`Failed to load invoices: ${error.message}`);

  const now = new Date();
  return (data ?? []).map((p) => {
    // Embed pattern copied from FitDeskApp/src/features/billing/queries.ts
    // (getOrganizationSubscription/listPlatformPayments) — database.types.ts
    // has empty `Relationships` for these hand-authored tables, so the
    // embed's shape isn't inferred; cast it explicitly instead.
    const row = p as typeof p & {
      organizations: { name: string } | null;
      // billing_period widened to plain string — a dynamic plan cycle
      // (supabase/migrations/1008_plans_schema_and_rpcs.sql) can carry any
      // admin-defined label. This is a pure display join ("Growth monthly"
      // / "Business Quarterly"), nothing branches on the value here.
      platform_packages: { name: string; billing_period: string } | null;
    };
    return {
      no: row.invoice_number ?? "—",
      gym: row.organizations?.name ?? "—",
      package: row.platform_packages
        ? `${row.platform_packages.name} ${row.platform_packages.billing_period}`
        : "—",
      period: formatInvoicePeriod(row.period_start, row.period_end, now),
      // platform_payments.status is `text` with a CHECK constraint limiting
      // it to these 4 values, not a native Postgres enum — codegen can only
      // narrow enum columns, so this is `string` in database.types.ts even
      // though the DB guarantees the narrower set.
      status: STATUS_MAP[row.status as keyof typeof STATUS_MAP],
      amount: formatMinorWhole(row.amount_minor, row.currency),
    };
  });
}

/** Backs the "Latest 6 of N this month" caption — total count of
 * platform_payments rows created this calendar month (not limited to 6,
 * unlike listInvoices' own latest-6 read). */
export async function getInvoiceCountThisMonth(supabase: SupabaseClient<Database>): Promise<number> {
  const { start, end } = currentMonthRange(new Date());
  const { count, error } = await supabase
    .from("platform_payments")
    .select("*", { count: "exact", head: true })
    .gte("created_at", start.toISOString())
    .lt("created_at", end.toISOString());

  if (error) throw new Error(`Failed to count this month's invoices: ${error.message}`);
  return count ?? 0;
}

export async function getRevenueTiles(supabase: SupabaseClient<Database>): Promise<RevenueTile[]> {
  const now = new Date();
  const { start, end } = currentMonthRange(now);

  const { data, error } = await supabase
    .from("platform_payments")
    .select("amount_minor, currency, status, created_at")
    .gte("created_at", start.toISOString())
    .lt("created_at", end.toISOString());

  if (error) throw new Error(`Failed to load this month's platform payments: ${error.message}`);

  const rows = data ?? [];
  const currency = rows[0]?.currency ?? "INR";
  const succeeded = rows.filter((r) => r.status === "succeeded");
  const refunded = rows.filter((r) => r.status === "refunded");
  const failed = rows.filter((r) => r.status === "failed");
  // Same "abandoned checkout vs still settling" cutoff admin_overview_stats'
  // awaiting_settlement uses (1002's migration) — replicated here on the
  // rows already fetched rather than a second RPC round trip.
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const awaitingSettlement = rows.filter(
    (r) => r.status === "created" && new Date(r.created_at) < oneHourAgo,
  );

  const collectedMinor = succeeded.reduce((sum, r) => sum + r.amount_minor, 0);
  const refundedMinor = refunded.reduce((sum, r) => sum + r.amount_minor, 0);
  const failedMinor = failed.reduce((sum, r) => sum + r.amount_minor, 0);
  const awaitingMinor = awaitingSettlement.reduce((sum, r) => sum + r.amount_minor, 0);

  const monthName = now.toLocaleDateString("en-IN", { month: "long" });
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

  return [
    {
      label: `Collected in ${monthName}`,
      value: formatMinorWhole(collectedMinor, currency),
      hint: `${plural(succeeded.length, "succeeded invoice")}`,
      emphasis: true,
    },
    {
      label: "Net of refunds",
      value: formatMinorWhole(collectedMinor - refundedMinor, currency),
      // Deliberately factual, not narrative — the mock's "One Growth
      // refund on cancellation" is color the real data can't support.
      hint: `${plural(refunded.length, "refund")} this month`,
    },
    {
      label: "Failed",
      value: formatMinorWhole(failedMinor, currency),
      hint: `${plural(failed.length, "failed charge")}`,
      accentValue: true,
    },
    {
      label: "Awaiting settlement",
      value: formatMinorWhole(awaitingMinor, currency),
      hint: `${plural(awaitingSettlement.length, "order")} created, not captured`,
    },
  ];
}
