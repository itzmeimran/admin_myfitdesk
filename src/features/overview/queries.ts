import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/core/db/database.types";
import { formatMinorWhole } from "@/core/money/format";
import { formatShortDate } from "@/core/dates/format";
import { listGyms } from "@/features/gyms/queries";
import type { Gym } from "@/features/gyms/mock-data";
import type { AttentionCell, KpiTile, MixRow, RiskRow, LimitRow, SignupRow, TrendBar } from "./mock-data";

/**
 * Real replacement for most of mock-data.ts's arrays (ATTENTION/TILES/MIX/
 * RISK/LIMITS/SIGNUPS/TREND) — HEALTH stays mock, see the comment at the
 * bottom of this file. overview-view.tsx also gained a handful of new props
 * for headline numbers that were hardcoded directly in its JSX (gyms-
 * enrolled count, the attention-band caption, etc.) rather than passed as
 * props — see that file's diff. Every RPC call below uses the same typed-
 * cast pattern as src/features/gyms/queries.ts, since database.types.ts
 * predates all of supabase/migrations/1002_admin_read_functions.sql.
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
  in_grace_count: number;
  read_only_count: number;
  failed_charges_current: { count: number; amount_minor: number };
  awaiting_settlement: { count: number; amount_minor: number };
};

type AdminPackageMixRow = {
  package_id: string;
  code: string;
  name: string;
  billing_period: "monthly" | "yearly";
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

export type OverviewData = {
  attention: AttentionCell[];
  tiles: KpiTile[];
  mix: MixRow[];
  risk: RiskRow[];
  limits: LimitRow[];
  signups: SignupRow[];
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

function monthRange(now: Date): { start: Date; end: Date; prevStart: Date; prevEnd: Date } {
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return { start, end, prevStart, prevEnd: start };
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
  // Cast `supabase` itself, not `supabase.rpc` — extracting the method
  // detaches it from `this` and breaks at runtime (supabase-js's rpc()
  // reads `this.rest` internally). See core/auth/get-platform-admin.ts's
  // comment on the same fix for the full story — this file had all 4 of
  // its RPC calls written the broken way originally.
  const typedSupabase = supabase as unknown as {
    rpc(
      fn: "admin_overview_stats",
      args: {
        p_period_start: string;
        p_period_end: string;
        p_prev_start: string;
        p_prev_end: string;
      },
    ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
  };

  const { data, error } = await typedSupabase.rpc("admin_overview_stats", {
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
  const typedSupabase = supabase as unknown as {
    rpc(fn: "admin_package_mix"): PromiseLike<{ data: AdminPackageMixRow[] | null; error: { message: string } | null }>;
  };
  const { data, error } = await typedSupabase.rpc("admin_package_mix");
  if (error) throw new Error(`Failed to load package mix: ${error.message}`);
  return data ?? [];
}

async function fetchGymsNearCap(
  supabase: SupabaseClient<Database>,
  limit: number,
): Promise<AdminGymsNearCapRow[]> {
  const typedSupabase = supabase as unknown as {
    rpc(
      fn: "admin_gyms_near_cap",
      args: { p_limit: number },
    ): PromiseLike<{ data: AdminGymsNearCapRow[] | null; error: { message: string } | null }>;
  };
  const { data, error } = await typedSupabase.rpc("admin_gyms_near_cap", { p_limit: limit });
  if (error) throw new Error(`Failed to load gyms near their package caps: ${error.message}`);
  return data ?? [];
}

async function fetchRevenueTrend(
  supabase: SupabaseClient<Database>,
  weeks: number,
): Promise<AdminRevenueTrendRow[]> {
  const typedSupabase = supabase as unknown as {
    rpc(
      fn: "admin_revenue_trend",
      args: { p_weeks: number },
    ): PromiseLike<{ data: AdminRevenueTrendRow[] | null; error: { message: string } | null }>;
  };
  const { data, error } = await typedSupabase.rpc("admin_revenue_trend", { p_weeks: weeks });
  if (error) throw new Error(`Failed to load the revenue trend: ${error.message}`);
  return data ?? [];
}

function buildTiles(stats: OverviewStats, monthName: string): KpiTile[] {
  const trialing = stats.tenant_counts.trialing ?? 0;
  const paidGyms = stats.total_gyms - trialing;

  return [
    { label: "Gyms enrolled", value: String(stats.total_gyms), hint: `+${stats.new_signups_current} in ${monthName}` },
    {
      label: "Recurring revenue",
      value: formatMinorWhole(stats.mrr_minor),
      // Deliberately not a "vs last month" delta — admin_overview_stats
      // doesn't compute a previous-period MRR figure (only current), and
      // fabricating one wasn't worth the risk (task brief).
      hint: `${stats.new_signups_current} new this month`,
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
      // TODO(missing-metric): admin_overview_stats has no distinct count
      // of non-trial subscriptions renewing within 7 days — only
      // trials_ending_7d, which is trial-specific and already surfaced in
      // the "Needs attention today" band. Misusing that number here would
      // silently mislabel it, so this tile shows a flagged placeholder
      // instead. Fixing it needs a new jsonb key on admin_overview_stats:
      // count(organization_subscriptions) where the derived state is
      // 'active'/'grace' and current_period_end falls within 7 days —
      // small, but a live-project migration wasn't applied for it this
      // pass without more confidence under time pressure (task brief,
      // option (a)).
      value: "—",
      hint: "Not tracked yet",
      accentValue: true,
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

  const byName = new Map<string, { monthly?: AdminPackageMixRow; yearly?: AdminPackageMixRow }>();
  for (const row of mixRows) {
    const entry = byName.get(row.name) ?? {};
    if (row.billing_period === "yearly") entry.yearly = row;
    else entry.monthly = row;
    byName.set(row.name, entry);
  }

  const rows: MixRow[] = Array.from(byName.entries()).map(([name, { monthly, yearly }]) => {
    const gyms = (monthly?.gym_count ?? 0) + (yearly?.gym_count ?? 0);
    const mrrMinor = (monthly?.mrr_minor ?? 0) + (yearly?.mrr_minor ?? 0);
    const pct = totalMrrMinor > 0 ? Math.round((mrrMinor / totalMrrMinor) * 100) : 0;

    const priceParts: string[] = [];
    if (monthly) priceParts.push(`${formatMinorWhole(monthly.price_minor)} / mo`);
    if (yearly) priceParts.push(`${formatMinorWhole(yearly.price_minor)} / yr`);

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

function buildSignups(
  gyms: Gym[],
  orgRows: { name: string; created_at: string }[],
  now: Date,
): SignupRow[] {
  const createdAtByName = new Map(orgRows.map((o) => [o.name, o.created_at]));
  const sevenDaysAgoMs = now.getTime() - 7 * 24 * 60 * 60 * 1000;

  return gyms
    .map((gym) => ({ gym, createdAt: createdAtByName.get(gym.name) }))
    .filter(
      (x): x is { gym: Gym; createdAt: string } =>
        !!x.createdAt && new Date(x.createdAt).getTime() >= sevenDaysAgoMs,
    )
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 4)
    .map(({ gym, createdAt }) => {
      const label = gym.package === "No package" ? "Trial" : riskPackageLabel(gym);
      return {
        initials: initials(gym.name),
        gym: gym.name,
        detail: `${label} · ${gym.city} · ${formatShortDate(new Date(createdAt), now)}`,
        pill: gym.package === "No package" ? "Trial" : "Paid",
      };
    });
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

export async function getOverviewData(supabase: SupabaseClient<Database>): Promise<OverviewData> {
  const now = new Date();
  const { start, end, prevStart, prevEnd } = monthRange(now);

  const [stats, mixRows, nearCapRows, trendRows, gyms, orgRows] = await Promise.all([
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
  ]);

  const monthName = now.toLocaleDateString("en-IN", { month: "long" });

  const atRiskGyms = gyms.filter((g) => g.status === "Grace" || g.status === "Read-only");
  const atRiskAmountMinor = atRiskGyms.reduce(
    (sum, g) => sum + parseRupeeStringToMinor(riskAmount(g)),
    0,
  );

  return {
    attention: buildAttention(stats),
    tiles: buildTiles(stats, monthName),
    mix: buildMix(mixRows, stats),
    risk: buildRisk(gyms),
    limits: buildLimits(nearCapRows),
    signups: buildSignups(gyms, orgRows, now),
    trend: buildTrend(trendRows, now),
    gymsEnrolledCount: stats.total_gyms,
    headerLine: `${now.toLocaleDateString("en-IN", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    })} · ${stats.total_gyms} gyms enrolled · Asia/Kolkata`,
    attentionCaption: `${stats.in_grace_count + stats.read_only_count} gyms · ${formatMinorWhole(atRiskAmountMinor)} at risk`,
    signupsCaption: `${stats.new_signups_current} in ${monthName}`,
    trendHeaderValue: formatMinorWhole(stats.mrr_minor),
    trendHeaderHint: `${stats.new_signups_current} new this month`,
  };
}

// TODO(needs-service-role-or-new-rpc): the "Billing pipeline" dark panel
// (HEALTH in mock-data.ts) is intentionally left on mock data — its real
// source per design-audit.md is `payment_provider_events` (the Razorpay
// webhook inbox), which has no admin-readable RLS policy by design
// (service-role only, see that table's own migration comment; 1002 does
// not add one). Surfacing it for real needs either a new SECURITY DEFINER
// aggregate RPC (counts only, same pattern as admin_overview_stats etc.)
// or a route handler reading it via the service client — not a plain
// RLS-scoped read from this module. Flagging rather than guessing at a
// migration for this under time pressure.
