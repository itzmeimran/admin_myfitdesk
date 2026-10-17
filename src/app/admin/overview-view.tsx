import { PeriodSelector } from "@/components/PeriodSelector";
import { ButtonLink } from "@/components/ButtonLink";
import { NavigationPendingContent } from "@/components/NavigationPendingContent";
import { formatMinor, formatMinorWhole } from "@/core/money/format";
import { IST_TIME_ZONE } from "@/core/dates/ist";
import { AlertIcon, GymsIcon, PackagesIcon, RevenueIcon, CalendarIcon, UsageIcon, ConfirmIcon } from "@/core/ui/icons";
import type { OverviewData, FollowUp, CapacityRow } from "@/features/overview/model";
import { OverviewCollectionsChart } from "./overview-collections-chart";
import { OverviewMetricSkeleton, OverviewChartSkeleton } from "./overview-skeleton";

function money(value: number | null, currency = "INR") { return value === null ? "Unavailable" : value % 100 ? formatMinor(value, currency) : formatMinorWhole(value, currency); }
function when(value: string, full = false) { return new Intl.DateTimeFormat("en-IN", { timeZone: IST_TIME_ZONE, ...(full ? { weekday: "short", day: "numeric", month: "short", year: "numeric" } : { day: "numeric", month: "short", year: "numeric" }) }).format(new Date(value)); }
export type OverviewPermissions = { gyms: boolean; revenue: boolean; packages: boolean };

export function OverviewView({ data, permissions, searchParams = {} }: { data: OverviewData; permissions: OverviewPermissions; searchParams?: Record<string, string | string[] | undefined> }) {
  const periods = ([['month', 'This month'], ['quarter', 'Quarter'], ['year', 'Year']] as const).map(([value, label]) => {
    const params = new URLSearchParams();
    for (const [key, raw] of Object.entries(searchParams)) if (raw !== undefined && key !== 'page') params.set(key, Array.isArray(raw) ? raw[0] : raw);
    params.set('period', value); return { value, label, href: '/admin?' + params };
  });
  const collections = data.collections, health = data.monitoring, webhooks = health.webhooks;
  const webhookIssues = webhooks ? webhooks.signatureFailures + webhooks.processingFailures : null;
  return <div className="flex min-w-0 flex-col gap-4">
    <header className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="font-display text-[24px] tracking-tight md:text-[26px]">Platform overview</h1><p className="mt-1 text-[12px] text-mute">{when(data.asOf, true)} · IST</p></div><PeriodSelector value={data.period} options={periods} ariaLabel="Collection period" /></header>
    {data.notices.length ? <div role="status" className="border-l-2 border-accent pl-3 text-[12px] text-mute">{data.notices.map(note => <p key={note}>{note}</p>)}</div> : null}
    <section aria-label="Main platform metrics" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Metric label="Total gyms" value={data.totalGyms.toLocaleString('en-IN')} hint="Current platform snapshot" />
      <Metric label="Paying gyms" value={data.payingGyms.toLocaleString('en-IN')} hint="Paid plans with active or grace access" />
      <Metric label="Monthly recurring revenue" value={money(data.mrrMinor, data.mrrCurrency)} hint="Current paid coverage · per month" dark />
      <NavigationPendingContent pathname="/admin" fallback={<OverviewMetricSkeleton />}><Metric label="Collections" value={money(collections.grossMinor, collections.currency)} hint={'Gross subscription receipts · ' + data.periodLabel} /></NavigationPendingContent>
    </section>
    <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-mute"><p>{data.members.toLocaleString('en-IN')} members · {data.branches.toLocaleString('en-IN')} branches</p><p>Current totals · period filter applies to collections</p></div>
    <section aria-labelledby="overview-follow-ups" className="border border-line bg-paper">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"><div className="flex items-center gap-2"><AlertIcon size={15} className="text-accent" aria-hidden /><h2 id="overview-follow-ups" className="text-[14px] font-bold">Follow-ups needing attention</h2>{data.followUps.length ? <span className="text-[12px] text-mute">{data.followUps.length} issues</span> : null}</div><span className="text-[12px] text-mute">Current subscriptions · failed attempts, last 30 days</span></div>
      {data.followUps.length ? <><FollowUpList rows={data.followUps.slice(0,6)} canViewGyms={permissions.gyms} />{data.followUps.length>6 ? <details className="border-t border-line px-4 py-3 text-[12px]"><summary className="cursor-pointer text-mute">Show {data.followUps.length-6} more follow-ups</summary><FollowUpList rows={data.followUps.slice(6)} canViewGyms={permissions.gyms} /></details> : null}</> : <p className="flex items-center gap-2 border-t border-line px-4 py-3 text-[12px] text-mute"><ConfirmIcon size={15} aria-hidden />No accounts need attention today</p>}
    </section>
    <div className="grid min-w-0 items-start gap-4 lg:grid-cols-3">
      <div className="min-w-0 lg:col-span-2"><NavigationPendingContent pathname="/admin" fallback={<OverviewChartSkeleton />}><section aria-labelledby="overview-collections" className="min-w-0 border border-line bg-paper p-4">
        <div className="mb-2 flex flex-wrap items-start justify-between gap-2"><div><h2 id="overview-collections" className="text-[14px] font-bold">Collections · {data.periodLabel}</h2><p className="mt-1 text-[12px] text-mute">{data.grouping.charAt(0).toUpperCase() + data.grouping.slice(1)} · paid dates in IST · through {when(data.asOf)}</p></div><strong className="font-display text-[23px]">{money(collections.grossMinor, collections.currency)}</strong></div>
        {collections.error ? <p role="status" className="py-6 text-[12px] text-mute">Collections are unavailable. Review the payment connection and payment records in platform revenue.</p> : collections.paymentCount ? <OverviewCollectionsChart key={data.period} buckets={collections.buckets} currency={collections.currency} /> : <div className="flex min-h-36 flex-col items-center justify-center gap-2 text-center"><RevenueIcon size={22} className="text-mute" aria-hidden /><p className="text-[13px] font-semibold">No subscription payments collected in {data.periodLabel}</p><p className="text-[12px] text-mute">Only settled subscription receipts count. Pending and failed payments are excluded.</p></div>}
        <div className="mt-3 border-t border-line pt-3 text-[12px] text-mute"><p>Recorded refunds on these receipts: {money(collections.refundsMinor, collections.currency)} · Net retained: {money(collections.netMinor, collections.currency)}</p><p className="mt-1">Refund processing dates are not retained here; these are refunds against the selected receipt cohort. WhatsApp credits are excluded.</p></div>
        {permissions.revenue ? <ButtonLink href="/admin/revenue" variant="text" icon={RevenueIcon} className="mt-3">View platform revenue</ButtonLink> : null}
      </section></NavigationPendingContent></div>
      <section aria-labelledby="overview-recent" className="min-w-0 border border-line bg-paper"><div className="px-4 py-3"><h2 id="overview-recent" className="text-[14px] font-bold">Recently added gyms</h2><p className="mt-1 text-[12px] text-mute">Last 7 calendar days · IST · {data.recentCount} added</p></div>
        {data.recentGyms.length ? <ul>{data.recentGyms.map(gym => <li key={gym.id} className="flex items-start justify-between gap-3 border-t border-line px-4 py-3"><div className="min-w-0">{permissions.gyms ? <ButtonLink href={'/admin/gyms/' + gym.id} variant="text" className="max-w-full justify-start text-left !text-ink">{gym.name}</ButtonLink> : <strong className="text-[12px]">{gym.name}</strong>}<p className="mt-1 text-[12px] text-mute">Joined {when(gym.joinedAt)}</p></div><span className="shrink-0 bg-sand px-2 py-1 text-[12px]">{gym.status}</span></li>)}</ul> : <p className="border-t border-line px-4 py-4 text-[12px] text-mute">No gyms joined in the last 7 days.</p>}
        {permissions.gyms ? <div className="border-t border-line px-4 py-3"><ButtonLink href="/admin/gyms" variant="text" icon={GymsIcon}>View all gyms</ButtonLink></div> : null}
      </section>
    </div>
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <section aria-labelledby="overview-plans" className="min-w-0 border border-line bg-paper"><div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"><h2 id="overview-plans" className="text-[14px] font-bold">Plan breakdown</h2>{permissions.packages ? <ButtonLink variant="text" icon={PackagesIcon} href="/admin/packages">Manage packages</ButtonLink> : null}</div>
        <div className="flex justify-between gap-3 border-t border-line px-4 py-2 text-[12px] text-mute"><span>Current gyms by assigned plan</span><span>MRR contribution / month</span></div>
        {data.plans.length ? <ul>{data.plans.map(plan => <li key={plan.id} className="flex items-start justify-between gap-3 border-t border-line px-4 py-2.5 text-[12px]"><div className="min-w-0"><strong>{plan.name}</strong><p className="mt-0.5 text-mute">{plan.gyms} {plan.gyms === 1 ? 'gym' : 'gyms'}{plan.unavailable ? ' · ' + plan.unavailable + ' price unavailable' : ''}</p></div><span className="shrink-0 font-semibold tabular-nums">{money(plan.mrrMinor, plan.currency)}</span></li>)}</ul> : <p className="px-4 py-3 text-[12px] text-mute">No assigned plans yet.</p>}
        <div className="border-t border-line px-4 py-3 text-[12px] text-mute"><p className="mb-1 flex justify-between gap-2 font-semibold text-ink"><span>Total MRR</span><span>{money(data.mrrMinor, data.mrrCurrency)}</span></p><p>{data.mrrNote}</p></div>
      </section>
      <section aria-labelledby="overview-capacity" className="border border-line bg-paper"><div className="flex items-center gap-2 px-4 py-3"><UsageIcon size={15} className="text-mute" aria-hidden /><h2 id="overview-capacity" className="text-[14px] font-bold">Capacity summary</h2></div>
        {data.capacity.length ? <><CapacityList rows={data.capacity.slice(0,5)} />{data.capacity.length>5 ? <details className="border-t border-line px-4 py-3 text-[12px]"><summary className="cursor-pointer text-mute">Show {data.capacity.length-5} more capacity entries</summary><CapacityList rows={data.capacity.slice(5)} /></details> : null}</> : <p className="border-t border-line px-4 py-4 text-[12px] text-mute">No member or branch limits need attention. Unlimited and empty capacity is omitted.</p>}
      </section>
    </div>
    <section aria-labelledby="overview-system" className="border-t border-line pt-3"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="overview-system" className="text-[13px] font-bold">Billing pipeline</h2><p className="mt-1 text-[12px] text-mute">{webhooks === null ? 'Webhook monitoring unavailable for this account or environment.' : webhooks.total === 0 ? 'No webhook events in the last 24 hours' : webhookIssues ? webhooks.signatureFailures + ' signature failures · ' + webhooks.processingFailures + ' processing failures in 24 hours' : webhooks.total + ' webhook events in 24 hours · no recorded failures'}</p><p className="mt-1 text-[12px] text-mute">{health.stuckOrders === null ? 'Pending-order check unavailable' : health.stuckOrders + ' orders awaiting settlement for over an hour'} · {health.recentFailedGyms === null ? 'Failed-payment check unavailable' : health.recentFailedGyms + (health.recentFailedGyms === 1 ? ' gym with an unresolved recent payment failure' : ' gyms with an unresolved recent payment failure')}</p></div>{permissions.revenue ? <ButtonLink href="/admin/revenue" variant="text" icon={RevenueIcon}>Platform revenue</ButtonLink> : null}</div>
      <details className="mt-2 text-[12px] text-mute"><summary className="cursor-pointer">Webhook details</summary><dl className="mt-2 grid gap-2 border-t border-line pt-2 sm:grid-cols-3"><div><dt>Events received · 24h</dt><dd className="font-semibold text-ink">{webhooks?.total ?? 'Unavailable'}</dd></div><div><dt>Signature failures · 24h</dt><dd className="font-semibold text-ink">{webhooks?.signatureFailures ?? 'Unavailable'}</dd></div><div><dt>Processing failures · 24h</dt><dd className="font-semibold text-ink">{webhooks?.processingFailures ?? 'Unavailable'}</dd></div></dl><p className="mt-2">Zero events alone does not establish pipeline health. Monitoring is independent of the collection period.</p></details>
    </section>
  </div>;
}

function Metric({ label, value, hint, dark = false }: { label: string; value: string; hint: string; dark?: boolean }) {
  return <div className={'flex min-h-[112px] min-w-0 flex-col justify-between gap-2 border p-4 ' + (dark ? 'border-ink bg-ink text-paper' : 'border-line bg-paper')}><h2 className={'text-[12px] font-medium ' + (dark ? 'text-hi' : 'text-mute')}>{label}</h2><strong className="font-display text-[25px] leading-tight tracking-tight tabular-nums">{value}</strong><p className={'text-[12px] ' + (dark ? 'text-mute3' : 'text-mute')}>{hint}</p></div>;
}

function FollowUpList({rows,canViewGyms}:{rows:FollowUp[];canViewGyms:boolean}) { return <ul>{rows.map(row => <li key={row.id} className="grid gap-2 border-t border-line px-4 py-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_minmax(0,.7fr)_auto] md:items-center">
        <div className="min-w-0">{canViewGyms ? <ButtonLink variant="text" href={'/admin/gyms/' + row.organizationId} className="max-w-full justify-start text-left !text-ink">{row.gym}</ButtonLink> : <strong className="text-[12px]">{row.gym}</strong>}</div>
        <p className="text-[12px]">{row.reason}</p><p className="text-[12px] text-mute">{when(row.date)}<span className="block">{row.timing}</span></p>
        {canViewGyms ? <ButtonLink href={row.href} icon={row.action === 'Review failed payment' ? RevenueIcon : CalendarIcon} variant="secondary" size="sm" className="justify-self-start md:justify-self-end">{row.action}</ButtonLink> : <span className="text-[12px] text-mute">Gym access required</span>}
      </li>)}</ul>; }
function CapacityList({rows}:{rows:CapacityRow[]}) { return <ul>{rows.map(row => <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-3 text-[12px]"><span className="font-semibold">{row.gym}</span><span className={row.over ? 'text-accent' : 'text-mute'}>{row.detail}</span></li>)}</ul>; }
