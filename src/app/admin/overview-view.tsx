"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { OverviewPeriod } from "@/features/overview/queries";
import type {
  AttentionCell,
  KpiTile,
  MixRow,
  RiskRow,
  LimitRow,
  SignupRow,
  HealthRow,
  TrendBar,
  Period,
} from "@/features/overview/mock-data";
import { PERIODS } from "@/features/overview/mock-data";
import { pillTone, PILL_CLASS } from "@/core/ui/status-style";
import {
  AddIcon,
  CalendarIcon,
  CalendarRangeIcon,
  CalendarCheckIcon,
  AlertIcon,
  ReadOnlyIcon,
  RevenueIcon,
  TrialsIcon,
  ExtendIcon,
  RemindIcon,
  CallIcon,
  NudgeIcon,
  PackagesIcon,
  GymsIcon,
  UsageIcon,
  type IconType,
} from "@/core/ui/icons";
import { ICON_SIZE } from "@/core/ui/icon-size";

const ACCENT = "var(--accent)";
const INK = "var(--ink)";

const PERIOD_ICON: Record<Period, IconType> = {
  "This month": CalendarIcon,
  Quarter: CalendarRangeIcon,
  Year: CalendarCheckIcon,
};

/** Display label (this file's own `Period`, from the design's mock-data.ts)
 * ↔ the `?period=` query value (`OverviewPeriod`, from queries.ts) the
 * Server Component actually re-fetches on. */
const PERIOD_TO_QUERY: Record<Period, OverviewPeriod> = {
  "This month": "month",
  Quarter: "quarter",
  Year: "year",
};
const QUERY_TO_PERIOD: Record<OverviewPeriod, Period> = {
  month: "This month",
  quarter: "Quarter",
  year: "Year",
};

const ATTENTION_ICON: IconType[] = [RemindIcon, ReadOnlyIcon, RevenueIcon, TrialsIcon];

const RISK_ACTION_ICON: Record<string, IconType> = {
  Extend: ExtendIcon,
  Remind: RemindIcon,
  Call: CallIcon,
  Nudge: NudgeIcon,
};

export function OverviewView({
  period: periodParam,
  attention,
  tiles,
  mix,
  risk,
  limits,
  signups,
  health,
  trend,
  gymsEnrolledCount,
  headerLine,
  attentionCaption,
  signupsCaption,
  trendHeaderValue,
  trendHeaderHint,
}: {
  /** From the `?period=` query param (admin/page.tsx) — this is what
   * actually drove this render's data, unlike the old local `useState`
   * that only relabeled the button while every number stayed on "This
   * month". */
  period: OverviewPeriod;
  attention: AttentionCell[];
  tiles: KpiTile[];
  mix: MixRow[];
  risk: RiskRow[];
  limits: LimitRow[];
  signups: SignupRow[];
  health: HealthRow[];
  trend: TrendBar[];
  /** Real-data additions — these numbers used to be typed directly into
   * this file's JSX (mock values like "128 gyms enrolled"), so wiring the
   * rest of the page to real data left them stale unless they came in as
   * props too (src/features/overview/queries.ts computes each of these
   * from the same admin_overview_stats() call that backs `tiles`). */
  gymsEnrolledCount: number;
  headerLine: string;
  attentionCaption: string;
  signupsCaption: string;
  trendHeaderValue: string;
  trendHeaderHint: string;
}) {
  const router = useRouter();
  const period = QUERY_TO_PERIOD[periodParam];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto flex min-w-0 flex-col gap-1">
          <h1 className="font-display text-[24px] tracking-[-0.02em] md:text-[26px]">Platform overview</h1>
          <p className="text-[12.5px] text-mute">{headerLine}</p>
        </div>
        <div className="flex" role="group" aria-label="Period">
          {PERIODS.map((p) => {
            const Icon = PERIOD_ICON[p];
            const on = period === p;
            return (
              <button
                key={p}
                type="button"
                aria-pressed={on}
                onClick={() => router.push(`/admin?period=${PERIOD_TO_QUERY[p]}`)}
                className={`-ml-[1.5px] flex min-h-[36px] items-center gap-1.5 border-[1.5px] border-ink px-3 text-[11.5px] font-bold first:ml-0 ${
                  on ? "bg-ink text-hi" : "bg-paper text-ink"
                }`}
              >
                <Icon size={14} aria-hidden />
                {p}
              </button>
            );
          })}
        </div>
        <Link
          href="/admin/packages?new=1"
          className="flex min-h-[36px] items-center gap-2 bg-ink px-3.5 text-[11.5px] font-bold uppercase tracking-[0.09em] text-hi"
        >
          <AddIcon size={ICON_SIZE.button} aria-hidden />
          New package
        </Link>
      </div>

      {/* Needs attention today */}
      <section aria-labelledby="mfd-attn" className="border-[1.5px] border-ink bg-sand">
        <div className="flex items-center gap-2 border-b-[1.5px] border-ink bg-ink px-3.5 py-2.5 text-paper">
          <AlertIcon size={15} className="text-hi" aria-hidden />
          <h2 id="mfd-attn" className="text-[11px] font-bold uppercase tracking-[0.14em]">
            Needs attention today
          </h2>
          <span className="ml-auto text-[11.5px] text-mute3">{attentionCaption}</span>
        </div>
        <div className="flex flex-wrap">
          {attention.map((a, i) => {
            const Icon = ATTENTION_ICON[i];
            const tone = a.accent ? ACCENT : INK;
            return (
              <div
                key={a.kind}
                className="flex flex-1 flex-col gap-1.5 border-r border-line bg-paper p-3.5"
                style={{ flexBasis: 210, minWidth: 0 }}
              >
                <span className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.12em]" style={{ color: tone }}>
                  <span className="h-[7px] w-[7px] flex-shrink-0" style={{ background: tone }} aria-hidden />
                  {a.kind}
                </span>
                <span className="font-display text-[22px] leading-none tracking-[-0.02em]" style={{ color: tone }}>
                  {a.count}
                </span>
                <span className="text-[12px] leading-snug text-mute">{a.detail}</span>
                <Link
                  href={a.href}
                  className="mt-0.5 flex items-center gap-1.5 self-start text-[11.5px] font-bold text-accent"
                >
                  <Icon size={14} aria-hidden />
                  {a.cta}
                </Link>
              </div>
            );
          })}
        </div>
      </section>

      {/* KPI tiles */}
      <section aria-label="Platform totals" className="flex flex-wrap gap-2.5">
        {tiles.map((t) => (
          <div
            key={t.label}
            className={`mfd-kpi-tile flex min-h-[104px] flex-col gap-1.5 border-[1.5px] p-3.5 ${
              t.emphasis ? "border-ink bg-ink" : "border-line bg-paper"
            }`}
          >
            <span className={`text-[10.5px] font-bold uppercase tracking-[0.12em] ${t.emphasis ? "text-hi" : "text-mute"}`}>
              {t.label}
            </span>
            <span
              className={`font-display text-[26px] tracking-[-0.02em] ${
                t.emphasis ? "text-paper" : t.accentValue ? "text-accent" : "text-ink"
              }`}
            >
              {t.value}
            </span>
            <span className={`text-[11.5px] ${t.emphasis ? "text-mute3" : "text-mute"}`}>{t.hint}</span>
          </div>
        ))}
      </section>

      <div className="flex flex-wrap items-start gap-3.5">
        {/* Left column */}
        <div className="flex flex-1 flex-col gap-3.5" style={{ flexBasis: 470, minWidth: 0 }}>
          <section aria-labelledby="mfd-trend" className="border-[1.5px] border-line bg-paper p-4">
            <div className="mb-4 flex flex-wrap items-end gap-2.5">
              <div className="mr-auto flex flex-col gap-1">
                <h2 id="mfd-trend" className="text-[11px] font-bold uppercase tracking-[0.14em] text-mute">
                  Recurring revenue · last 12 weeks
                </h2>
                <span className="flex items-baseline gap-2">
                  <span className="font-display text-[26px] tracking-[-0.02em]">{trendHeaderValue}</span>
                  <span className="text-[12px] font-bold">{trendHeaderHint}</span>
                </span>
              </div>
              <span className="text-[11.5px] text-mute2">Yearly packages normalised to a monthly figure</span>
            </div>
            <div className="flex items-end gap-1 border-b-[1.5px] border-ink pb-0" style={{ height: 176 }}>
              {trend.map((w) => (
                <div key={w.label + w.value} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                  <span className="text-[10px] font-bold" style={{ color: w.last ? INK : "var(--mute2)" }}>
                    ₹{Math.round(w.value)}k
                  </span>
                  <span
                    className="block w-full"
                    style={{ height: `${w.heightPct}%`, background: w.last ? "var(--hi)" : INK }}
                    title={`Week of ${w.label || "—"}: ₹${w.value.toFixed(1)}k recurring`}
                  />
                </div>
              ))}
            </div>
            <div className="mt-1.5 flex gap-1">
              {trend.map((w, i) => (
                <span key={i} className="flex-1 truncate text-center text-[10px] text-mute2">
                  {w.label}
                </span>
              ))}
            </div>
            {/* TODO(missing-narrative): the mock's per-week movement
                sentence ("Growth came from 6 new gyms and 2 Starter→Growth
                upgrades...") isn't derivable from admin_revenue_trend,
                which returns a revenue total per week, not per-subscription
                events — would need real week-over-week subscription-change
                tracking. Left as a generic, non-fabricated note instead of
                inventing specifics the data can't support (task brief). */}
            <p className="mt-3 text-[11.5px] leading-relaxed text-mute2">
              The most recent week is still in progress — its bar will keep rising as more
              invoices settle.
            </p>
          </section>

          <section aria-labelledby="mfd-mix" className="flex flex-col gap-3.5 border-[1.5px] border-line bg-paper p-4">
            <div className="flex items-baseline gap-2.5">
              <h2 id="mfd-mix" className="text-[11px] font-bold uppercase tracking-[0.14em] text-mute">
                Package mix
              </h2>
              <Link href="/admin/packages" className="ml-auto flex items-center gap-1.5 text-[11.5px] font-bold text-accent">
                <PackagesIcon size={14} aria-hidden />
                Manage packages
              </Link>
            </div>
            <div className="flex flex-col gap-3">
              {mix.map((m) => (
                <div key={m.name} className="flex flex-col gap-1.5">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-[13px] font-bold">{m.name}</span>
                    <span className="text-[11.5px] text-mute">{m.price}</span>
                    <span className="ml-auto text-[13px] font-bold">{m.gyms} gyms</span>
                    <span style={{ minWidth: 74 }} className="text-right text-[12px] text-mute">
                      {m.mrr}
                    </span>
                  </div>
                  <span className="block h-[10px] bg-sand">
                    <span
                      className="block h-[10px]"
                      style={{ width: m.pct, background: m.muted ? "var(--mute3)" : INK }}
                    />
                  </span>
                </div>
              ))}
            </div>
            {/* TODO(missing-narrative): the mock's "2 gyms remain on the
                archived Pro annual (legacy) tier" line named a specific
                archived tier by name. admin_package_mix() doesn't return
                each package's `status` (active/archived), so this section
                can't cheaply tell which of the grouped-by-name rows above
                are archived without a second platform_packages fetch —
                dropped rather than left stale/fabricated; the Packages
                page itself (src/features/packages/queries.ts) is the
                source of truth for archived tiers. */}
          </section>

          <section aria-labelledby="mfd-risk" className="border-[1.5px] border-line bg-paper">
            <div className="flex flex-wrap items-center gap-2.5 border-b-[1.5px] border-line px-4 py-3">
              <h2 id="mfd-risk" className="text-[11px] font-bold uppercase tracking-[0.14em] text-mute">
                Accounts at risk
              </h2>
              <Link href="/admin/gyms" className="ml-auto flex items-center gap-1.5 text-[11.5px] font-bold text-accent">
                <GymsIcon size={14} aria-hidden />
                All {gymsEnrolledCount} gyms
              </Link>
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="w-full border-collapse text-[12.5px]">
                <thead>
                  <tr className="text-left">
                    <th scope="col" className="mfd-micro-label border-b border-line px-4 py-2.5">Gym</th>
                    <th scope="col" className="mfd-micro-label border-b border-line px-2.5 py-2.5">Status</th>
                    <th scope="col" className="mfd-micro-label border-b border-line px-2.5 py-2.5">Package</th>
                    <th scope="col" className="mfd-micro-label border-b border-line px-2.5 py-2.5 text-right">Due</th>
                    <th scope="col" className="mfd-micro-label border-b border-line px-4 py-2.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {risk.map((r) => {
                    const ActionIcon = RISK_ACTION_ICON[r.action];
                    return (
                      <tr key={r.gym} className="mfd-table-row">
                        <td className="max-w-[230px] border-b border-line px-4 py-2.5">
                          <span className="block truncate font-bold">{r.gym}</span>
                          <span className="block truncate text-[11px] text-mute2">
                            {r.owner} · {r.city}
                          </span>
                        </td>
                        <td className="border-b border-line px-2.5 py-2.5">
                          <span className={PILL_CLASS} style={pillTone(r.status)}>
                            {r.status}
                          </span>
                        </td>
                        <td className="whitespace-nowrap border-b border-line px-2.5 py-2.5">{r.package}</td>
                        <td className="whitespace-nowrap border-b border-line px-2.5 py-2.5 text-right">
                          <span className="font-bold">{r.amount}</span>
                          <span className="block text-[11px]" style={{ color: r.dueAccent ? ACCENT : "var(--mute)" }}>
                            {r.due}
                          </span>
                        </td>
                        <td className="border-b border-line px-4 py-2.5 text-right">
                          <button
                            type="button"
                            disabled
                            title="Not implemented yet"
                            className="inline-flex min-h-[32px] items-center gap-1.5 border-[1.5px] border-ink bg-transparent px-2.5 text-[11px] font-bold text-ink disabled:cursor-not-allowed disabled:opacity-70"
                          >
                            <ActionIcon size={14} aria-hidden />
                            {r.action}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col md:hidden">
              {risk.map((r) => {
                const ActionIcon = RISK_ACTION_ICON[r.action];
                return (
                  <div key={r.gym} className="flex flex-col gap-2 border-b border-line px-3.5 py-3 last:border-b-0">
                    <div className="flex items-start gap-2.5">
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate text-[13.5px] font-bold">{r.gym}</span>
                        <span className="text-[11.5px] text-mute2">
                          {r.owner} · {r.package}
                        </span>
                      </span>
                      <span className={`${PILL_CLASS} flex-shrink-0`} style={pillTone(r.status)}>
                        {r.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <span className="text-[12.5px] text-mute">
                        <span className="font-bold text-ink">{r.amount}</span> · {r.due}
                      </span>
                      <button
                        type="button"
                        disabled
                        title="Not implemented yet"
                        className="ml-auto inline-flex min-h-[38px] items-center gap-1.5 border-[1.5px] border-ink bg-transparent px-3 text-[11.5px] font-bold text-ink disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        <ActionIcon size={15} aria-hidden />
                        {r.action}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        {/* Right column */}
        <div className="flex flex-1 flex-col gap-3.5" style={{ flexBasis: 296, minWidth: 0 }}>
          <section aria-labelledby="mfd-limits" className="flex flex-col gap-3 border-[1.5px] border-line bg-paper p-4">
            <h2 id="mfd-limits" className="text-[11px] font-bold uppercase tracking-[0.14em] text-mute">
              Hitting package limits
            </h2>
            <p className="text-[12px] leading-relaxed text-mute">
              These gyms are close to a cap that blocks new members or branches. Each one is an
              upgrade conversation.
            </p>
            {limits.map((l) => (
              <div key={l.gym} className="flex flex-col gap-1.5 border-t border-line pt-3">
                <div className="flex items-baseline gap-2">
                  <span className="min-w-0 truncate text-[13px] font-bold">{l.gym}</span>
                  <span
                    className="ml-auto flex-shrink-0 text-[11.5px] font-bold"
                    style={{ color: l.accent ? ACCENT : INK }}
                  >
                    {l.pctLabel}
                  </span>
                </div>
                <span className="block h-[8px] bg-sand">
                  <span
                    className="block h-[8px]"
                    style={{ width: `${l.pct}%`, background: l.accent ? ACCENT : INK }}
                  />
                </span>
                <span className="text-[11.5px] text-mute">{l.detail}</span>
              </div>
            ))}
            <Link
              href="/admin/gyms"
              className="flex min-h-[38px] items-center justify-center gap-2 border-[1.5px] border-ink text-[11px] font-bold uppercase tracking-[0.09em] text-ink"
            >
              <UsageIcon size={14} aria-hidden />
              See usage across all gyms
            </Link>
          </section>

          <section aria-labelledby="mfd-signups" className="flex flex-col gap-3 border-[1.5px] border-line bg-paper p-4">
            <div className="flex items-baseline gap-2">
              <h2 id="mfd-signups" className="text-[11px] font-bold uppercase tracking-[0.14em] text-mute">
                New this week
              </h2>
              <span className="ml-auto text-[11.5px] text-mute2">{signupsCaption}</span>
            </div>
            {signups.map((s) => (
              <div key={s.gym} className="flex items-center gap-2.5 border-t border-line pt-2.5">
                <span className="flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center bg-sand text-[11.5px] font-bold">
                  {s.initials}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-[13px] font-bold">{s.gym}</span>
                  <span className="truncate text-[11.5px] text-mute2">{s.detail}</span>
                </span>
                <span
                  className="flex-shrink-0 px-[7px] py-[4px] text-[9.5px] font-bold uppercase tracking-[0.1em]"
                  style={s.pill === "Paid" ? { background: "var(--sand)", color: INK } : { background: "var(--hi)", color: "var(--on-hi)" }}
                >
                  {s.pill}
                </span>
              </div>
            ))}
          </section>

          <section aria-labelledby="mfd-health" className="flex flex-col gap-3 border-[1.5px] border-ink bg-ink p-4 text-paper">
            <h2 id="mfd-health" className="text-[11px] font-bold uppercase tracking-[0.14em] text-hi">
              Billing pipeline
            </h2>
            {health.map((h) => (
              <div key={h.label} className="flex items-baseline gap-2.5 border-t border-inkline pt-2.5">
                <span className="min-w-0 flex-1 text-[12.5px] text-mute3">{h.label}</span>
                <span className="text-[14px] font-bold" style={{ color: h.warn ? "var(--hi)" : "var(--paper)" }}>
                  {h.value}
                </span>
              </div>
            ))}
            <Link
              href="/admin/revenue"
              className="flex min-h-[38px] items-center justify-center gap-2 border border-inkline text-[11px] font-bold uppercase tracking-[0.09em] text-hi"
            >
              <RevenueIcon size={14} aria-hidden />
              Open platform revenue
            </Link>
          </section>
        </div>
      </div>
    </div>
  );
}
