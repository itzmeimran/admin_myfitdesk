import { ButtonLink } from "@/components/ButtonLink";
import { NavigationPendingContent } from "@/components/NavigationPendingContent";
import { SectionHeader } from "@/components/SectionHeader";
import type { PeriodPreset } from "@/components/PeriodDropdown";
import { formatMinor, formatMinorWhole } from "@/core/money/format";
import { IST_TIME_ZONE, istDateKey } from "@/core/dates/ist";
import { AlertIcon, GymsIcon, PackagesIcon, RevenueIcon, CalendarIcon, ConfirmIcon } from "@/core/ui/icons";
import { resolveOverviewRange, type OverviewData, type FollowUp, type CapacityRow } from "@/features/overview/model";
import { OverviewCollectionsChart } from "./overview-collections-chart";
import { OverviewPeriodControl } from "./overview-period-control";
import { OverviewCollectionMonth } from "./overview-collection-month";
import { OverviewMetricSkeleton, OverviewChartSkeleton } from "./overview-skeleton";

function money(value: number | null, currency = "INR") { return value === null ? "Unavailable" : value % 100 ? formatMinor(value, currency) : formatMinorWhole(value, currency); }
function when(value: string, full = false) { return new Intl.DateTimeFormat("en-IN", { timeZone: IST_TIME_ZONE, ...(full ? { weekday: "long", day: "numeric", month: "short", year: "numeric" } : { day: "numeric", month: "short", year: "numeric" }) }).format(new Date(value)); }
export type OverviewPermissions = { gyms: boolean; revenue: boolean; packages: boolean };

const PRESETS = [["month", "This month"], ["quarter", "This quarter"], ["year", "This year"]] as const;
const CARD = "border border-line bg-paper";
const ROW_HOVER = "transition-colors duration-150 hover:bg-sand/50";

export function OverviewView({ data, permissions }: { data: OverviewData; permissions: OverviewPermissions }) {
  const now = new Date(data.asOf);
  const presets: PeriodPreset[] = PRESETS.map(([value, label]) => ({ value, label, hint: resolveOverviewRange(value, now).text }));
  const collections = data.collections, health = data.monitoring, webhooks = health.webhooks;
  const webhookIssues = webhooks ? webhooks.signatureFailures + webhooks.processingFailures : null;
  const planTotal = data.plans.reduce((sum, plan) => sum + (plan.mrrMinor ?? 0), 0);
  return <div className="flex min-w-0 max-w-[1320px] flex-col gap-6">
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div className="min-w-0">
        <p className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.16em] text-mute2">Platform</p>
        <h1 className="font-display text-[28px] leading-none tracking-tight md:text-[38px]">Overview</h1>
        <p className="mt-2 text-[12.5px] text-mute">{when(data.asOf, true)} · IST · {data.members.toLocaleString("en-IN")} members across {data.branches.toLocaleString("en-IN")} {data.branches === 1 ? "branch" : "branches"}</p>
      </div>
      <div className="flex w-full flex-col gap-1.5 sm:w-auto sm:items-end">
        <OverviewPeriodControl value={data.period} presets={presets} rangeFrom={data.rangeFrom} rangeTo={data.rangeTo} rangeText={data.rangeText} today={istDateKey(now)} />
        <p className="text-[11px] text-mute2">Period applies to collections only</p>
      </div>
    </header>

    {data.notices.length ? <div role="status" className="border-l-2 border-accent pl-3 text-[12px] text-mute">{data.notices.map(note => <p key={note}>{note}</p>)}</div> : null}

    <section aria-label="Main platform metrics" className="grid grid-cols-2 gap-px border border-line bg-line lg:grid-cols-4">
      <div className="col-span-2 flex min-w-0 flex-col gap-2.5 bg-ink p-5 text-paper lg:col-span-1">
        <h2 className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-mute3">Monthly recurring revenue</h2>
        <p className="flex flex-wrap items-baseline gap-x-2"><strong className="font-display text-[30px] leading-none tracking-tight tabular-nums md:text-[34px]">{money(data.mrrMinor, data.mrrCurrency)}</strong><span className="text-[12px] text-mute3">/ month</span></p>
        <p className="text-[12px] leading-relaxed text-mute3">Current paid coverage · live</p>
      </div>
      <NavigationPendingContent pathname="/admin" fallback={<OverviewMetricSkeleton />}>
        <Metric label="Collections" tag={data.periodLabel} value={money(collections.grossMinor, collections.currency)} hint="Gross settled subscription receipts" />
      </NavigationPendingContent>
      <Metric label="Paying gyms" value={data.payingGyms.toLocaleString("en-IN")} hint="Active or in grace · paid plans" />
      <Metric className="col-span-2 lg:col-span-1" label="Total gyms" value={data.totalGyms.toLocaleString("en-IN")} hint={`${data.members.toLocaleString("en-IN")} members · ${data.branches.toLocaleString("en-IN")} branches`} />
    </section>

    <section aria-labelledby="overview-follow-ups" className={data.followUps.length ? CARD : "border border-live/30 bg-live/10"}>
      {data.followUps.length ? <>
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"><div className="flex items-center gap-2"><AlertIcon size={15} className="text-accent" aria-hidden /><h2 id="overview-follow-ups" className="text-[14px] font-bold">Follow-ups needing attention</h2><span className="text-[12px] text-mute">{data.followUps.length} {data.followUps.length === 1 ? "issue" : "issues"}</span></div><span className="text-[12px] text-mute">Current subscriptions · failed attempts, last 30 days</span></div>
        <FollowUpList rows={data.followUps.slice(0, 6)} canViewGyms={permissions.gyms} />
        {data.followUps.length > 6 ? <details className="group border-t border-line px-4 py-3 text-[12px]"><summary className="cursor-pointer text-mute transition-colors hover:text-ink">Show {data.followUps.length - 6} more follow-ups</summary><FollowUpList rows={data.followUps.slice(6)} canViewGyms={permissions.gyms} /></details> : null}
      </> : <div className="flex flex-wrap items-center gap-3.5 px-5 py-3.5">
        <span className="grid h-7 w-7 flex-shrink-0 place-items-center bg-live text-paper"><ConfirmIcon size={15} aria-hidden /></span>
        <div className="min-w-0 flex-1"><h2 id="overview-follow-ups" className="text-[14px] font-bold">No accounts need follow-up</h2><p className="text-[12px] text-mute">Checked current subscriptions and failed payment attempts in the last 30 days</p></div>
      </div>}
    </section>

    <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <section aria-labelledby="overview-collections" className="flex min-w-0 flex-col gap-3.5">
        <SectionHeader id="overview-collections" aside={<OverviewCollectionMonth from={data.rangeFrom} to={data.rangeTo} label={data.periodLabel} today={istDateKey(now)} monthly={data.period === "month"} />}>Collections</SectionHeader>
        <NavigationPendingContent pathname="/admin" fallback={<OverviewChartSkeleton />}>
          <div className={CARD}>
            <div className="flex flex-wrap items-end justify-between gap-3 p-5 pb-0">
              <div><strong className="font-display text-[28px] leading-none tracking-tight tabular-nums">{money(collections.grossMinor, collections.currency)}</strong><p className="mt-1.5 text-[12px] text-mute">{data.grouping.charAt(0).toUpperCase() + data.grouping.slice(1)} · settled dates in IST · {data.rangeText}</p></div>
              {permissions.revenue ? <ButtonLink href="/admin/revenue" variant="text" icon={RevenueIcon}>Platform revenue</ButtonLink> : null}
            </div>
            <div className="p-5 pt-4">
              {collections.error ? <p role="status" className="py-6 text-[12px] text-mute">Collections are unavailable. Review the payment connection and payment records in platform revenue.</p>
                : collections.paymentCount ? <OverviewCollectionsChart key={`${data.period}:${data.rangeFrom}:${data.rangeTo}`} buckets={collections.buckets} currency={collections.currency} />
                : <div className="flex min-h-36 flex-col items-center justify-center gap-2 text-center"><RevenueIcon size={22} className="text-mute" aria-hidden /><p className="text-[13px] font-semibold">No settled receipts in {data.periodLabel}</p><p className="text-[12px] text-mute">Pending and failed payments don&apos;t count.</p></div>}
            </div>
            <dl className="grid grid-cols-3 border-t border-line bg-sand/40">
              {([["Gross", collections.grossMinor], ["Refunded", collections.refundsMinor], ["Net retained", collections.netMinor]] as const).map(([label, value], index) => <div key={label} className={`min-w-0 px-5 py-3.5 ${index ? "border-l border-line" : ""}`}><dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-mute2">{label}</dt><dd className="mt-1 truncate text-[15px] font-bold tabular-nums">{money(value, collections.currency)}</dd></div>)}
            </dl>
            <p className="border-t border-line px-5 py-3 text-[11.5px] leading-relaxed text-mute2">Refunds are matched to this receipt cohort, not dated by when they were processed. WhatsApp credits excluded.</p>
          </div>
        </NavigationPendingContent>
      </section>

      <div className="flex min-w-0 flex-col gap-6">
        <section aria-labelledby="overview-recent" className="flex flex-col gap-3.5">
          <SectionHeader id="overview-recent" aside={`Last 7 days · ${data.recentCount}`}>New gyms</SectionHeader>
          <div className={CARD}>
            {data.recentGyms.length ? <ul>{data.recentGyms.map(gym => <li key={gym.id} className={`flex items-center gap-3.5 border-b border-line px-5 py-3.5 ${ROW_HOVER}`}>
              <span aria-hidden className="grid h-9 w-9 flex-shrink-0 place-items-center bg-sand text-[12px] font-bold text-mute">{gym.name.split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase()}</span>
              <div className="min-w-0 flex-1">{permissions.gyms ? <ButtonLink href={"/admin/gyms/" + gym.id} variant="text" className="max-w-full justify-start text-left !text-ink">{gym.name}</ButtonLink> : <strong className="text-[13px]">{gym.name}</strong>}<p className="mt-0.5 text-[12px] text-mute">Joined {when(gym.joinedAt)}</p></div>
              <span className="flex-shrink-0 border border-line px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-mute">{gym.status}</span>
            </li>)}</ul> : <p className="border-b border-line px-5 py-4 text-[12px] text-mute">No gyms joined in the last 7 days.</p>}
            {permissions.gyms ? <div className="px-5 py-2.5"><ButtonLink href="/admin/gyms" variant="text" icon={GymsIcon}>All gyms</ButtonLink></div> : null}
          </div>
        </section>

        <section aria-labelledby="overview-capacity" className="flex flex-col gap-3.5">
          <SectionHeader id="overview-capacity" aside={data.capacity.length ? <span className="text-accent">{data.capacity.length} at limit</span> : "Within limits"}>Capacity</SectionHeader>
          <div className={CARD}>
            {data.capacity.length ? <><CapacityList rows={data.capacity.slice(0, 5)} />{data.capacity.length > 5 ? <details className="border-t border-line px-5 py-3 text-[12px]"><summary className="cursor-pointer text-mute transition-colors hover:text-ink">Show {data.capacity.length - 5} more capacity entries</summary><CapacityList rows={data.capacity.slice(5)} /></details> : null}</>
              : <p className="px-5 py-4 text-[12px] text-mute">No member or branch limits need attention. Unlimited and empty capacity is omitted.</p>}
          </div>
        </section>
      </div>
    </div>

    <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <section aria-labelledby="overview-plans" className="flex min-w-0 flex-col gap-3.5">
        <SectionHeader id="overview-plans" aside={permissions.packages ? <ButtonLink href="/admin/packages" variant="text" icon={PackagesIcon}>Manage packages</ButtonLink> : null}>MRR by plan</SectionHeader>
        <div className={CARD}>
          {data.plans.length ? <ul>{data.plans.map(plan => <li key={plan.id} className={`flex flex-col gap-2 border-b border-line px-5 py-4 ${ROW_HOVER}`}>
            <div className="flex items-baseline gap-3"><strong className="min-w-0 flex-1 truncate text-[14px]">{plan.name}</strong><span className="text-[12px] text-mute2">{plan.gyms} {plan.gyms === 1 ? "gym" : "gyms"}{plan.unavailable ? ` · ${plan.unavailable} price unavailable` : ""}</span><span className="min-w-[90px] text-right text-[14px] font-bold tabular-nums">{money(plan.mrrMinor, plan.currency)}</span></div>
            <Bar value={plan.mrrMinor ?? 0} total={planTotal} label={`${plan.name} share of recurring revenue`} />
          </li>)}</ul> : <p className="border-b border-line px-5 py-4 text-[12px] text-mute">No assigned plans yet.</p>}
          <div className="flex items-baseline gap-3 bg-sand/40 px-5 py-4"><span className="flex-1 text-[10.5px] font-bold uppercase tracking-[0.14em] text-mute2">Total MRR</span><strong className="text-[17px] tabular-nums">{money(data.mrrMinor, data.mrrCurrency)}</strong></div>
          <p className="border-t border-line px-5 py-3 text-[11.5px] leading-relaxed text-mute2">{data.mrrNote}</p>
        </div>
      </section>

      <section aria-labelledby="overview-system" className="flex min-w-0 flex-col gap-3.5">
        <SectionHeader id="overview-system" aside="Last 24 h">Billing pipeline</SectionHeader>
        <div className={CARD}>
          {webhooks === null || webhooks.total === 0 || webhookIssues ? <div role="status" className="flex items-start gap-3 border-b border-line bg-hi/15 px-5 py-4"><span aria-hidden className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-hi" /><div className="min-w-0"><p className="text-[13.5px] font-bold">{webhooks === null ? "Webhook monitoring unavailable" : webhookIssues ? `${webhooks.signatureFailures} signature · ${webhooks.processingFailures} processing failures` : "No webhook events received"}</p><p className="mt-0.5 text-[12px] leading-relaxed text-mute">{webhooks === null ? "Unavailable for this account or environment." : webhookIssues ? "Review these in platform revenue." : "Quiet isn't proof of health — confirm the gateway is sending."}</p></div></div>
            : <p className="border-b border-line px-5 py-3.5 text-[12.5px] text-mute">{webhooks.total} webhook events in 24 hours · no recorded failures</p>}
          <dl>
            <PipelineRow label="Orders awaiting settlement > 1 h" value={health.stuckOrders} />
            <PipelineRow label="Gyms with unresolved payment failure" value={health.recentFailedGyms} />
          </dl>
          <details className="group border-t border-line">
            <summary className="flex cursor-pointer items-center gap-2 px-5 py-3.5 text-[12.5px] font-bold text-mute transition-colors hover:text-ink"><CalendarIcon size={13} aria-hidden className="transition-transform duration-200 group-open:rotate-12" />Webhook details</summary>
            <dl className="grid grid-cols-3 border-t border-line bg-sand/40">
              {([["Received", webhooks?.total], ["Signature fail", webhooks?.signatureFailures], ["Processing fail", webhooks?.processingFailures]] as const).map(([label, value], index) => <div key={label} className={`min-w-0 px-4 py-3.5 ${index ? "border-l border-line" : ""}`}><dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-mute2">{label}</dt><dd className="mt-1 text-[15px] font-bold tabular-nums">{value ?? "—"}</dd></div>)}
            </dl>
            <p className="border-t border-line px-5 py-3 text-[11.5px] leading-relaxed text-mute2">Zero events alone does not establish pipeline health. Monitoring is independent of the collection period.</p>
          </details>
          {permissions.revenue ? <div className="border-t border-line px-5 py-2.5"><ButtonLink href="/admin/revenue" variant="text" icon={RevenueIcon}>Platform revenue</ButtonLink></div> : null}
        </div>
      </section>
    </div>
  </div>;
}

function Metric({ label, value, hint, tag, className = "" }: { label: string; value: string; hint: string; tag?: string; className?: string }) {
  return <div className={`flex min-w-0 flex-col gap-2.5 bg-paper p-5 ${className}`}>
    <h2 className="flex flex-wrap items-center gap-2 text-[10.5px] font-bold uppercase tracking-[0.16em] text-mute2">{label}{tag ? <span className="bg-hi px-1.5 py-0.5 text-[10px] tracking-[0.08em] text-on-hi">{tag}</span> : null}</h2>
    <strong className="font-display text-[24px] leading-none tracking-tight tabular-nums md:text-[27px]">{value}</strong>
    <p className="text-[12px] leading-relaxed text-mute">{hint}</p>
  </div>;
}

/** Share bar that grows from zero on mount; static for reduced-motion users. */
function Bar({ value, total, label, tone = "bg-ink" }: { value: number; total: number; label: string; tone?: string }) {
  const pct = total > 0 ? Math.min(100, Math.max(0, value / total * 100)) : 0;
  return <div role="img" aria-label={`${label}: ${Math.round(pct)}%`} className="h-1.5 bg-sand"><div className={`h-full origin-left ${tone} motion-safe:animate-[bar-grow_0.6s_cubic-bezier(0.22,1,0.36,1)]`} style={{ width: `${pct}%` }} /></div>;
}

function PipelineRow({ label, value }: { label: string; value: number | null }) {
  return <div className={`flex items-center gap-3 border-b border-line px-5 py-3 ${ROW_HOVER}`}><dt className="min-w-0 flex-1 text-[12.5px] text-mute">{label}</dt><dd className="text-[15px] font-bold tabular-nums">{value ?? "Unavailable"}</dd></div>;
}

function FollowUpList({ rows, canViewGyms }: { rows: FollowUp[]; canViewGyms: boolean }) {
  return <ul>{rows.map(row => <li key={row.id} className={`grid gap-2 border-t border-line px-4 py-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_minmax(0,.7fr)_auto] md:items-center ${ROW_HOVER}`}>
    <div className="min-w-0">{canViewGyms ? <ButtonLink variant="text" href={"/admin/gyms/" + row.organizationId} className="max-w-full justify-start text-left !text-ink">{row.gym}</ButtonLink> : <strong className="text-[12px]">{row.gym}</strong>}</div>
    <p className="text-[12px]">{row.reason}</p><p className="text-[12px] text-mute">{when(row.date)}<span className="block">{row.timing}</span></p>
    {canViewGyms ? <ButtonLink href={row.href} icon={row.action === "Review failed payment" ? RevenueIcon : CalendarIcon} variant="secondary" size="sm" className="justify-self-start md:justify-self-end">{row.action}</ButtonLink> : <span className="text-[12px] text-mute">Gym access required</span>}
  </li>)}</ul>;
}

function CapacityList({ rows }: { rows: CapacityRow[] }) {
  return <ul>{rows.map(row => <li key={row.id} className={`flex flex-col gap-2 border-b border-line px-5 py-4 last:border-b-0 ${ROW_HOVER}`}>
    <div className="flex items-baseline gap-3"><strong className="min-w-0 flex-1 truncate text-[14px]">{row.gym}</strong><span className="text-[12.5px] font-bold tabular-nums">{row.used} / {row.cap} {row.resource}</span></div>
    <Bar value={row.used} total={row.cap} label={`${row.gym} ${row.resource} used`} tone={row.over || row.used >= row.cap ? "bg-accent" : "bg-ink"} />
    <p className={`text-[12px] ${row.over ? "text-accent" : "text-mute"}`}>{row.detail}</p>
  </li>)}</ul>;
}
