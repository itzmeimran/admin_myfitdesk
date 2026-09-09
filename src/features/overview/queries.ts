import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/core/db/database.types";
import { formatMinorWhole } from "@/core/money/format";
import { formatShortDate } from "@/core/dates/format";
import { listGyms } from "@/features/gyms/queries";
import type { Gym } from "@/features/gyms/mock-data";
import type { AttentionCell, KpiTile, MixRow, RiskRow, LimitRow, SignupRow, HealthRow, TrendBar } from "./mock-data";

/**
 * Real replacement for every mock-data.ts array (ATTENTION/TILES/MIX/
 * RISK/LIMITS/SIGNUPS/TREND/HEALTH). HEALTH was the last one left on mock
 * data (see fetchBillingPipeline's docblock below for why it needed a new
 * RPC) — now wired via supabase/migrations/1005_admin_billing_pipeline.sql.
 * overview-view.tsx also gained a handful of new props for headline numbers
 * that were hardcoded directly in its JSX (gyms-enrolled count, the
 * attention-band caption, etc.) rather than passed as props — see that
 * file's diff.
 */

type OverviewStats = {
  tenant_counts: Partial<Record<"trialing" | "active" | "grace" | "read_only" | "cancelled", number>>;
  total_gyms: number;
  new_signups_current: number;
  new_signups_previous: number;
  total_branches: number;
  total_members: number;
  platform_revenue_current_minor: number;
  platform_revenue_previous_minor: number;
  mrr_minor: number;
  trials_ending_7d: number;
  renewals_due_7d: number;
  in_grace_count: number;
  read_only_count: number;
  failed_charges_current: { count: number; amount_minor: number };
  awaiting_settlement: { count: number; amount_minor: number };
};

type AdminPackageMixRow = {
  package_id: string;
  code: string;
  name: string;
  // Widened from "monthly" | "yearly" — a dynamic plan cycle (supabase/
  // migrations/1008_plans_schema_and_rpcs.sql) can carry any admin-defined
  // label. buildMix() below still special-cases "monthly"/"yearly" for its
  // 2-column display but no longer silently collides two different labels
  // into the same slot (see that function's own comment).
  billing_period: string;
  price_minor: number;
  gym_count: number;
  mrr_minor: number;
};

type AdminGymsNearCapRow = {
  organization_id: string;
  name: string;
  resource: "members" | "branches" | "staff";
  used_count: number;
  cap_count: number;
  pct: number;
};

type AdminRevenueTrendRow = { week_start: string; revenue_minor: number };

type AdminBillingPipeline = { webhooks_ok_24h: number; signature_failures_24h: number };

export type OverviewData = {
  attention: AttentionCell[];
  tiles: KpiTile[];
  mix: MixRow[];
  risk: RiskRow[];
  limits: LimitRow[];
  signups: SignupRow[];
  health: HealthRow[];
  trend: TrendBar[];
  /** New props overview-view.tsx needed for numbers that used to be typed
   * directly into its JSX (see that file). */
  gymsEnrolledCount: number;
  headerLine: string;
  attentionCaption: string;
  signupsCaption: string;
  trendHeaderValue: string;
  trendHeaderHint: string;
};

export type OverviewPeriod = "month" | "quarter" | "year";

/** Current vs previous window for each of the period toggle's 3 options —
 * admin_overview_stats() already takes arbitrary start/end bounds (it was
 * built accepting them from day one), so wiring Quarter/Year is this
 * function plus threading `period` through, not a new RPC. `label` feeds
 * every "N new in <label>" caption below. */
function periodRange(period: OverviewPeriod, now: Date): { start: Date; end: Date; prevStart: Date; prevEnd: Date; label: string } {
  if (period === "year") {
    const y = now.getFullYear();
    return {
      start: new Date(y, 0, 1),
      end: new Date(y + 1, 0, 1),
      prevStart: new Date(y - 1, 0, 1),
      prevEnd: new Date(y, 0, 1),
      label: String(y),
    };
  }
  if (period === "quarter") {
    const q = Math.floor(now.getMonth() / 3);
    const start = new Date(now.getFullYear(), q * 3, 1);
    return {
      start,
      end: new Date(now.getFullYear(), q * 3 + 3, 1),
      prevStart: new Date(now.getFullYear(), q * 3 - 3, 1),
      prevEnd: start,
      label: `Q${q + 1} ${now.getFullYear()}`,
    };
  }
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return {
    start,
    end: new Date(now.getFullYear(), now.getMonth() + 1, 1),
    prevStart: new Date(now.getFullYear(), now.getMonth() - 1, 1),
    prevEnd: start,
    label: now.toLocaleDateString("en-IN", { month: "long" }),
  };
}

/** First letters of up to 2 words, uppercased — this app's own derivation
 * (not literal to the design's SF/UF sample values, which aren't
 * reconstructable from a gym name alone; see the task brief). */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const chars = words.slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  return chars || "—";
}

/** "Monthly"/"Yearly" read off the front of Gym.period ("Monthly · ₹649"),
 * lowercased — reused by both the risk and signups package labels below
 * rather than re-deriving billing_period from scratch. */
function billingWord(period: string): string {
  const head = period.split(" · ")[0]?.toLowerCase();
  return head === "monthly" || head === "yearly" ? head : "";
}

function riskPackageLabel(gym: Gym): string {
  if (gym.package === "No package") return "No package yet";
  const word = billingWord(gym.period);
  return word ? `${gym.package} ${word}` : gym.package;
}

function riskAmount(gym: Gym): string {
  if (gym.package === "No package") return "—";
  const parts = gym.period.split(" · ");
  return parts[1] ?? "—";
}

/** Inverse of formatMinorWhole, for a display string this module produced
 * itself (e.g. "₹649") — used only to sum a handful of already-formatted
 * Gym.period prices for the attention-band "at risk" caption below. */
function parseRupeeStringToMinor(displayValue: string): number {
  const digits = displayValue.replace(/[^\d]/g, "");
  return digits ? Number(digits) * 100 : 0;
}

async function fetchOverviewStats(
  supabase: SupabaseClient<Database>,
  start: Date,
  end: Date,
  prevStart: Date,
  prevEnd: Date,
): Promise<OverviewStats> {
  const { data, error } = await supabase.rpc("admin_overview_stats", {
    p_period_start: start.toISOString(),
    p_period_end: end.toISOString(),
    p_prev_start: prevStart.toISOString(),
    p_prev_end: prevEnd.toISOString(),
  });
  if (error) throw new Error(`Failed to load overview stats: ${error.message}`);

  // admin_overview_stats RETURNS jsonb (a scalar), not SETOF/TABLE, so
  // PostgREST — and therefore supabase-js's .rpc() — hands back the parsed
  // object directly as `data`, unlike the TABLE-returning functions below
  // which come back as an array of rows. Normalises both possible shapes
  // defensively rather than assuming, now confirmed live (see the
  // this-binding fix above — this whole function never actually ran
  // end-to-end before that fix, so this defensive check earns its keep).
  const raw = Array.isArray(data) ? data[0] : data;
  if (!raw || typeof raw !== "object") {
    throw new Error("admin_overview_stats returned an unexpected shape");
  }
  return raw as OverviewStats;
}

async function fetchPackageMix(supabase: SupabaseClient<Database>): Promise<AdminPackageMixRow[]> {
  const { data, error } = await supabase.rpc("admin_package_mix");
  if (error) throw new Error(`Failed to load package mix: ${error.message}`);
  return (data ?? []) as AdminPackageMixRow[];
}

async function fetchGymsNearCap(
  supabase: SupabaseClient<Database>,
  limit: number,
): Promise<AdminGymsNearCapRow[]> {
  const { data, error } = await supabase.rpc("admin_gyms_near_cap", { p_limit: limit });
  if (error) throw new Error(`Failed to load gyms near their package caps: ${error.message}`);
  return (data ?? []) as AdminGymsNearCapRow[];
}

async function fetchRevenueTrend(
  supabase: SupabaseClient<Database>,
  weeks: number,
): Promise<AdminRevenueTrendRow[]> {
  const { data, error } = await supabase.rpc("admin_revenue_trend", { p_weeks: weeks });
  if (error) throw new Error(`Failed to load the revenue trend: ${error.message}`);
  return (data ?? []) as AdminRevenueTrendRow[];
}

/**
 * The only piece of the "Billing pipeline" panel that actually needs a new
 * RPC — payment_provider_events (the Razorpay webhook inbox) has zero RLS
 * policies (confirmed live), service-role-only by design. The other 2 rows
 * (orders stuck as created, refunds this month) come from platform_payments
 * directly below, same table revenue/queries.ts's getRevenueTiles() already
 * reads via its existing admin-select policy — no RPC needed for those.
 */
async function fetchBillingPipeline(supabase: SupabaseClient<Database>): Promise<AdminBillingPipeline> {
  const { data, error } = await supabase.rpc("admin_billing_pipeline");
  if (error) throw new Error(`Failed to load the billing pipeline: ${error.message}`);

  const raw = Array.isArray(data) ? data[0] : data;
  if (!raw || typeof raw !== "object") {
    throw new Error("admin_billing_pipeline returned an unexpected shape");
  }
  return raw as AdminBillingPipeline;
}

/** "Orders stuck as created" / "Refunds this month" — same cutoff and
 * calendar-month window revenue/queries.ts's getRevenueTiles() uses for its
 * Awaiting settlement/Net of refunds tiles, recomputed here rather than
 * imported since this panel always means calendar month (its own label
 * says so) regardless of Overview's separate period toggle above it. */
async function fetchMonthlyPaymentHealth(
  supabase: SupabaseClient<Database>,
  now: Date,
): Promise<{ stuckCount: number; refundedCount: number; refundedMinor: number; currency: string }> {
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const { data, error } = await supabase
    .from("platform_payments")
    .select("amount_minor, currency, status, created_at")
    .gte("created_at", start.toISOString())
    .lt("created_at", end.toISOString());
  if (error) throw new Error(`Failed to load this month's payment health: ${error.message}`);

  const rows = data ?? [];
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const stuck = rows.filter((r) => r.status === "created" && new Date(r.created_at) < oneHourAgo);
  const refunded = rows.filter((r) => r.status === "refunded");

  return {
    stuckCount: stuck.length,
    refundedCount: refunded.length,
    refundedMinor: refunded.reduce((sum, r) => sum + r.amount_minor, 0),
    currency: rows[0]?.currency ?? "INR",
  };
}

function buildHealth(
  pipeline: AdminBillingPipeline,
  paymentHealth: { stuckCount: number; refundedMinor: number; currency: string },
): HealthRow[] {
  return [
    { label: "Razorpay webhooks, 24h", value: `${pipeline.webhooks_ok_24h} ok` },
    {
      label: "Signature failures",
      value: String(pipeline.signature_failures_24h),
      warn: pipeline.signature_failures_24h > 0,
    },
    {
      label: "Orders stuck as created",
      value: String(paymentHealth.stuckCount),
      warn: paymentHealth.stuckCount > 0,
    },
    { label: "Refunds this month", value: formatMinorWhole(paymentHealth.refundedMinor, paymentHealth.currency) },
  ];
}

function buildTiles(stats: OverviewStats, periodLabel: string): KpiTile[] {
  const trialing = stats.tenant_counts.trialing ?? 0;
  const paidGyms = stats.total_gyms - trialing;

  return [
    { label: "Gyms enrolled", value: String(stats.total_gyms), hint: `+${stats.new_signups_current} in ${periodLabel}` },
    {
      label: "Recurring revenue",
      value: formatMinorWhole(stats.mrr_minor),
      // Deliberately not a "vs last period" delta — admin_overview_stats
      // doesn't compute a previous-period MRR figure (only current), and
      // fabricating one wasn't worth the risk (task brief).
      hint: `${stats.new_signups_current} new in ${periodLabel}`,
      emphasis: true,
    },
    {
      label: "Members on platform",
      value: stats.total_members.toLocaleString("en-IN"),
      hint: `Across ${stats.total_branches} branches`,
    },
    {
      label: "Paid gyms",
      value: String(paidGyms),
      hint: `${trialing} trialing · ${stats.read_only_count} read-only`,
    },
    {
      label: "Renewals due in 7 days",
      value: String(stats.renewals_due_7d),
      hint: "Active or grace, period ending soon",
      accentValue: stats.renewals_due_7d > 0,
    },
  ];
}

function buildAttention(stats: OverviewStats): AttentionCell[] {
  return [
    {
      kind: "In grace period",
      count: String(stats.in_grace_count),
      detail: "Payment overdue, still writable. Read-only in 2–6 days.",
      cta: "Chase renewals",
      accent: true,
      href: "/admin/gyms?filter=Grace",
    },
    {
      kind: "Read-only",
      count: String(stats.read_only_count),
      detail: "Past grace. Staff can read but not record payments.",
      cta: "Review accounts",
      accent: true,
      href: "/admin/gyms?filter=Read-only",
    },
    {
      kind: "Failed charges",
      count: String(stats.failed_charges_current.count),
      detail: `${formatMinorWhole(stats.failed_charges_current.amount_minor)} across ${stats.failed_charges_current.count} gyms`,
      cta: "Open invoices",
      accent: true,
      href: "/admin/revenue",
    },
    {
      kind: "Trials ending",
      count: String(stats.trials_ending_7d),
      detail: "Within 7 days.",
      cta: "See trials",
      accent: false,
      href: "/admin/gyms?filter=Trialing",
    },
  ];
}

function buildMix(mixRows: AdminPackageMixRow[], stats: OverviewStats): MixRow[] {
  const totalMrrMinor = mixRows.reduce((sum, m) => sum + m.mrr_minor, 0);

  // monthly/yearly stay their own named slots (the legacy convention this
  // was originally built for); anything else — a dynamic plan's "Quarterly"
  // etc — goes into `others` rather than being force-fit into one of those
  // two and silently overwriting a genuine monthly/yearly row sharing the
  // same plan name. Not a full generalization of this widget to N arbitrary
  // cycles (out of scope for this pass — Overview is read-only reporting,
  // not a purchase path) but no longer capable of losing data.
  const byName = new Map<
    string,
    { monthly?: AdminPackageMixRow; yearly?: AdminPackageMixRow; others: AdminPackageMixRow[] }
  >();
  for (const row of mixRows) {
    const entry = byName.get(row.name) ?? { others: [] };
    if (row.billing_period === "yearly") entry.yearly = row;
    else if (row.billing_period === "monthly") entry.monthly = row;
    else entry.others.push(row);
    byName.set(row.name, entry);
  }

  const rows: MixRow[] = Array.from(byName.entries()).map(([name, { monthly, yearly, others }]) => {
    const gyms =
      (monthly?.gym_count ?? 0) + (yearly?.gym_count ?? 0) + others.reduce((sum, r) => sum + r.gym_count, 0);
    const mrrMinor =
      (monthly?.mrr_minor ?? 0) + (yearly?.mrr_minor ?? 0) + others.reduce((sum, r) => sum + r.mrr_minor, 0);
    const pct = totalMrrMinor > 0 ? Math.round((mrrMinor / totalMrrMinor) * 100) : 0;

    const priceParts: string[] = [];
    if (monthly) priceParts.push(`${formatMinorWhole(monthly.price_minor)} / mo`);
    if (yearly) priceParts.push(`${formatMinorWhole(yearly.price_minor)} / yr`);
    for (const other of others) {
      priceParts.push(`${formatMinorWhole(other.price_minor)} / ${other.billing_period.toLowerCase()}`);
    }

    return {
      name,
      price: priceParts.join(" · "),
      gyms: gyms.toLocaleString("en-IN"),
      mrr: formatMinorWhole(mrrMinor),
      pct: `${pct}%`,
    };
  });

  rows.sort((a, b) => parseRupeeStringToMinor(b.mrr) - parseRupeeStringToMinor(a.mrr));

  const trialing = stats.tenant_counts.trialing ?? 0;
  rows.push({
    name: "No package (trialing)",
    price: "14-day trial",
    gyms: trialing.toLocaleString("en-IN"),
    mrr: "₹0",
    pct: "0%",
    muted: true,
  });

  return rows;
}

const RISK_ORDER: RiskRow["status"][] = ["Read-only", "Grace", "Cancelled", "Trialing"];
const RISK_ACTION: Record<RiskRow["status"], string> = {
  "Read-only": "Extend",
  Grace: "Remind",
  Cancelled: "Call",
  Trialing: "Nudge",
};

function buildRisk(gyms: Gym[]): RiskRow[] {
  return gyms
    .filter((g): g is Gym & { status: RiskRow["status"] } => g.status !== "Active")
    .sort((a, b) => RISK_ORDER.indexOf(a.status) - RISK_ORDER.indexOf(b.status))
    .slice(0, 5)
    .map((g) => ({
      gym: g.name,
      owner: g.owner,
      city: g.city,
      status: g.status,
      package: riskPackageLabel(g),
      amount: riskAmount(g),
      due: g.renews,
      dueAccent: g.status === "Grace" || g.status === "Read-only",
      action: RISK_ACTION[g.status],
    }));
}

function buildLimits(rows: AdminGymsNearCapRow[]): LimitRow[] {
  return rows.map((r) => {
    const pct = Math.round(r.pct);
    return {
      gym: r.name,
      pctLabel: `${pct}%`,
      pct,
      accent: pct >= 90,
      detail: `${r.used_count} of ${r.cap_count} ${r.resource}`,
    };
  });
}

/**
 * Returns both the (top-4) rows to render AND the true count of last-7-day
 * signups — the caption above this list ("New this week") needs the real
 * total, not the period toggle's count (that's a different window: the
 * toggle can be Quarter/Year while this section always means "last 7
 * days," so reusing stats.new_signups_current here would mislabel it).
 */
function buildSignups(
  gyms: Gym[],
  orgRows: { name: string; created_at: string }[],
  now: Date,
): { rows: SignupRow[]; count: number } {
  const createdAtByName = new Map(orgRows.map((o) => [o.name, o.created_at]));
  const sevenDaysAgoMs = now.getTime() - 7 * 24 * 60 * 60 * 1000;

  const recent = gyms
    .map((gym) => ({ gym, createdAt: createdAtByName.get(gym.name) }))
    .filter(
      (x): x is { gym: Gym; createdAt: string } =>
        !!x.createdAt && new Date(x.createdAt).getTime() >= sevenDaysAgoMs,
    )
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const rows: SignupRow[] = recent.slice(0, 4).map(({ gym, createdAt }) => {
    const label = gym.package === "No package" ? "Trial" : riskPackageLabel(gym);
    return {
      initials: initials(gym.name),
      gym: gym.name,
      detail: `${label} · ${gym.city} · ${formatShortDate(new Date(createdAt), now)}`,
      pill: gym.package === "No package" ? "Trial" : "Paid",
    };
  });

  return { rows, count: recent.length };
}

function buildTrend(rows: AdminRevenueTrendRow[], now: Date): TrendBar[] {
  // TrendBar.value is thousands of rupees (overview-view.tsx renders it as
  // "₹{Math.round(w.value)}k") — revenue_minor is paise, so ÷100 for rupees
  // and ÷1000 again for thousands.
  const values = rows.map((r) => r.revenue_minor / 100_000);
  const max = Math.max(0, ...values) || 1;

  return rows.map((r, i) => {
    const value = r.revenue_minor / 100_000;
    return {
      value,
      label: formatShortDate(new Date(r.week_start), now),
      heightPct: (value / max) * 100,
      last: i === rows.length - 1,
    };
  });
}

export async function getOverviewData(supabase: SupabaseClient<Database>, period: OverviewPeriod = "month"): Promise<OverviewData> {
  const now = new Date();
  const { start, end, prevStart, prevEnd, label: periodLabel } = periodRange(period, now);

  const [stats, mixRows, nearCapRows, trendRows, gyms, orgRows, pipeline, paymentHealth] = await Promise.all([
    fetchOverviewStats(supabase, start, end, prevStart, prevEnd),
    fetchPackageMix(supabase),
    fetchGymsNearCap(supabase, 3),
    fetchRevenueTrend(supabase, 12),
    listGyms(supabase),
    supabase
      .from("organizations")
      .select("name, created_at")
      .then(({ data, error }) => {
        if (error) throw new Error(`Failed to load organizations: ${error.message}`);
        return data ?? [];
      }),
    fetchBillingPipeline(supabase),
    fetchMonthlyPaymentHealth(supabase, now),
  ]);

  const atRiskGyms = gyms.filter((g) => g.status === "Grace" || g.status === "Read-only");
  const atRiskAmountMinor = atRiskGyms.reduce(
    (sum, g) => sum + parseRupeeStringToMinor(riskAmount(g)),
    0,
  );

  const signups = buildSignups(gyms, orgRows, now);

  return {
    attention: buildAttention(stats),
    tiles: buildTiles(stats, periodLabel),
    mix: buildMix(mixRows, stats),
    risk: buildRisk(gyms),
    limits: buildLimits(nearCapRows),
    signups: signups.rows,
    health: buildHealth(pipeline, paymentHealth),
    trend: buildTrend(trendRows, now),
    gymsEnrolledCount: stats.total_gyms,
    headerLine: `${now.toLocaleDateString("en-IN", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    })} · ${stats.total_gyms} gyms enrolled · Asia/Kolkata`,
    attentionCaption: `${stats.in_grace_count + stats.read_only_count} gyms · ${formatMinorWhole(atRiskAmountMinor)} at risk`,
    signupsCaption: `${signups.count} in the last 7 days`,
    trendHeaderValue: formatMinorWhole(stats.mrr_minor),
    trendHeaderHint: `${stats.new_signups_current} new in ${periodLabel}`,
  };
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
