import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/core/db/database.types";
import { loose } from "@/core/db/loose-client";
import { DAY_MS } from "@/core/dates/ist";
import { buildOverview, resolveOverviewRange, type CustomRange, type OverviewGym, type OverviewPackage, type OverviewPayment, type OverviewPeriod, type OverviewSubscription, type WebhookTelemetry } from "./model";
export type { CustomRange, OverviewData, OverviewPeriod } from "./model";

type OverviewStats = { total_gyms: number; in_grace_count: number; read_only_count: number };
type PageResult<T> = { data: T[] | null; error: { message: string } | null };
const PAGE_SIZE = 500;
const PAYMENT_FIELDS = "id,organization_id,package_id,amount_minor,currency,status,paid_at,created_at,period_start,period_end,refunded_minor:provider_metadata->>amount_refunded,pricing_review_required";

/** Page every read explicitly; PostgREST's default row cap must not truncate
 * aggregate totals or silently omit the latest financial evidence. */
async function allRows<T>(page: (from: number, to: number) => PromiseLike<PageResult<T>>): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const result = await page(offset, offset + PAGE_SIZE - 1);
    if (result.error) throw new Error(result.error.message);
    rows.push(...result.data ?? []);
    if ((result.data?.length ?? 0) < PAGE_SIZE) return rows;
  }
}

export async function getOverviewData(supabase: SupabaseClient<Database>, period: OverviewPeriod = "month", webhooks: WebhookTelemetry | null = null, now = new Date(), custom: CustomRange | null = null) {
  const db = loose(supabase);
  const range = resolveOverviewRange(period, now, custom);
  const through = new Date(Math.min(+range.end, +now + 1)).toISOString();
  const [gyms, subscriptions, packages] = await Promise.all([
    allRows<OverviewGym>((from, to) => db.rpc("admin_gym_directory").order("organization_id").range(from, to)),
    allRows<OverviewSubscription>((from, to) => db.from("organization_subscriptions").select("organization_id,package_id,status,current_period_start,current_period_end,grace_days").order("organization_id").range(from, to)),
    allRows<OverviewPackage>((from, to) => db.from("platform_packages").select("id,plan_id,name,price_minor,currency,duration_days").order("id").range(from, to)),
  ]);
  const eligibleIds = new Set(gyms.filter(gym => ["active", "grace"].includes(gym.state)).map(gym => gym.organization_id));
  const current = subscriptions.filter(sub => sub.package_id && sub.status !== "trialing" && sub.status !== "cancelled" && eligibleIds.has(sub.organization_id));
  const batches = Array.from({ length: Math.ceil(current.length / 100) }, (_, index) => current.slice(index * 100, (index + 1) * 100));
  const currentRead = Promise.all(batches.map(batch => {
    const firstEnd = new Date(Math.min(...batch.map(sub => Date.parse(sub.current_period_end)))).toISOString();
    return allRows<OverviewPayment>((from, to) => db.from("platform_payments").select(PAYMENT_FIELDS).in("organization_id", batch.map(sub => sub.organization_id)).in("status", ["succeeded", "refunded"]).gte("period_end", firstEnd).order("id").range(from, to));
  })).then(pages => pages.flat());
  const [currentPayments, periodPayments, attempts, stuck] = await Promise.allSettled([
    currentRead,
    allRows<OverviewPayment>((from, to) => db.from("platform_payments").select(PAYMENT_FIELDS).in("status", ["succeeded", "refunded"]).not("package_id", "is", null).gte("paid_at", range.start.toISOString()).lt("paid_at", through).order("id").range(from, to)),
    allRows<OverviewPayment>((from, to) => db.from("platform_payments").select(PAYMENT_FIELDS).in("status", ["failed", "succeeded", "refunded"]).or(`created_at.gte.${new Date(+now - 30 * DAY_MS).toISOString()},paid_at.gte.${new Date(+now - 30 * DAY_MS).toISOString()}`).lte("created_at", now.toISOString()).order("id").range(from, to)),
    db.from("platform_payments").select("id", { count: "exact", head: true }).eq("status", "created").lt("created_at", new Date(+now - 60 * 60 * 1000).toISOString()),
  ]);
  const notices: string[] = [];
  if (currentPayments.status === "rejected") notices.push("Current subscription receipts could not be loaded. MRR is unavailable for affected plans.");
  if (periodPayments.status === "rejected") notices.push("Collections could not be loaded for this period. Other snapshot information is still available.");
  if (attempts.status === "rejected") notices.push("Recent failed-payment follow-ups could not be loaded; subscription follow-ups are still shown.");
  return buildOverview({ gyms, subscriptions, packages, period, custom, now, webhooks, notices,
    currentPayments: currentPayments.status === "fulfilled" ? currentPayments.value : null,
    periodPayments: periodPayments.status === "fulfilled" ? periodPayments.value : null,
    attempts: attempts.status === "fulfilled" ? attempts.value : null,
    stuckOrders: stuck.status === "fulfilled" && !stuck.value.error ? stuck.value.count : null,
  });
}

export type AdminChromeCounts = {
  /** Total organizations — backs the Gyms nav item's badge (previously a
   * hardcoded "18" in nav-items.ts). */
  gymsCount: number;
  /** Grace + read-only subscriptions — the same "needs attention now"
   * signal Overview's attention band uses (attentionCaption above), reused
   * here for the header bell's badge (previously a hardcoded "5"). Both
   * fields are period-independent point-in-time counts, unlike
   * failed_charges_current/trials_ending_7d, so they don't need a real
   * date range — deliberately not folding those two in, since doing that
   * honestly would require the bell to carry the same "this month" period
   * semantics the rest of Overview has, for a badge with no dropdown behind
   * it yet to explain that scoping. */
  alertsCount: number;
};

/** Rendered in the admin layout on every page, not just Overview — reuses
 * admin_overview_stats() rather than a new RPC, passing a zero-width period
 * window since neither field this reads depends on it. */
export async function getAdminChromeCounts(supabase: SupabaseClient<Database>): Promise<AdminChromeCounts> {
  const now = new Date().toISOString();
  const { data, error } = await supabase.rpc("admin_overview_stats", {
    p_period_start: now,
    p_period_end: now,
    p_prev_start: now,
    p_prev_end: now,
  });
  if (error) throw new Error(`Failed to load admin chrome counts: ${error.message}`);

  const raw = (Array.isArray(data) ? data[0] : data) as Pick<OverviewStats, "total_gyms" | "in_grace_count" | "read_only_count"> | null;
  if (!raw) throw new Error("admin_overview_stats returned an unexpected shape");

  return { gymsCount: raw.total_gyms, alertsCount: raw.in_grace_count + raw.read_only_count };
}
