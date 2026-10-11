import { daysBetween } from "@/core/dates/format";
import { formatMinorWhole } from "@/core/money/format";
import { capitalizeBillingPeriod } from "@/core/text/billing-period";
import type { GymOverview } from "@/features/gyms/overview";
import type { MemberSummary } from "@/features/gyms/members";
import { lockLabel, type NoteRow, type OpsSummary, type TimelineEvent } from "@/features/gyms/ops/types";
import { relativeTime } from "@/features/gyms/ops/timeline-format";
import {
  buildAttentionItems,
  checkMemberCounts,
  classifyHealth,
  deriveWhatsAppStatus,
  HEALTH_LABEL,
  mailHref,
  telHref,
  type WhatsAppFacts,
} from "@/features/gyms/overview-rules";
import type { GymDetail } from "@/features/gyms/detail";
import type { GymTrend } from "@/features/gyms/trend-types";
import { SectionError } from "./ops-ui";
import { GymTrendChart } from "./gym-trend-chart";
import { NotesPanel } from "./notes-panel";
import { NeedsAttention, Panel, Stat, SummaryCard, TextLink, Unavailable } from "./overview-parts";
import { RecentActivity } from "./recent-activity";

export type Loaded<T> = { data: T | null; error: string | null };

export type OverviewData = {
  gym: GymDetail;
  overview: Loaded<GymOverview>;
  ops: Loaded<OpsSummary>;
  members: Loaded<MemberSummary>;
  notes: Loaded<NoteRow[]>;
  trend: Loaded<GymTrend>;
  activity: Loaded<{ rows: TimelineEvent[] }>;
  now: Date;
};

/** Everything the Overview shows, from already-loaded data (the page does the reads). */
export function OverviewView({ gym, overview, ops, members, notes, trend, activity, now }: OverviewData) {
  const base = `/admin/gyms/${gym.id}`;
  const tz = overview.data?.timezone ?? gym.defaultTimezone ?? "Asia/Kolkata";
  const currency = gym.defaultCurrency || "INR";
  const sub = gym.subscription;
  const expiry = sub?.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : null;
  const daysToExpiry = expiry ? daysBetween(now, expiry) : null;
  const o = overview.data;
  const s = ops.data;
  const m = members.data;

  const waFacts = o && s ? whatsAppFacts(o, s) : null;
  const waStatus = waFacts ? deriveWhatsAppStatus(waFacts, now) : null;

  const attention = buildAttentionItems({
    gymId: gym.id,
    now,
    suspended: gym.status === "Suspended",
    daysToExpiry,
    subscriptionLabel: gym.status === "Trialing" ? "Trial" : "Subscription",
    hasQueuedPackage: Boolean(sub?.pending),
    whatsapp: waFacts,
    restrictions: s ? s.locks.map((l) => lockLabel(l.lockType)) : [],
    jobsFailed: s?.jobs.failed ?? 0,
    jobsDegraded: s?.jobs.degraded ?? 0,
    reconciliationIssues: s?.payments.reconciliationIssues ?? 0,
    reconciliationCritical: s?.payments.reconciliationCritical ?? 0,
    openAlerts: s?.alerts.open ?? 0,
    criticalAlerts: s?.alerts.critical ?? 0,
    dataHealthIssues: s?.dataHealth.issues ?? 0,
    ownerLastActiveAt: s?.owner?.lastActiveAt ?? s?.owner?.lastSignInAt ?? null,
    ownerNeverSignedIn: Boolean(s?.owner && !s.owner.lastSignInAt && !s.owner.lastActiveAt),
    gymAgeDays: daysBetween(new Date(gym.createdAt), now),
    usage: [
      { label: "Members", used: gym.usage.memberCount, cap: gym.usage.memberCap },
      { label: "Branches", used: gym.usage.branchCount, cap: gym.usage.branchCap },
      { label: "Staff", used: gym.usage.staffCount, cap: gym.usage.staffCap },
    ],
  });
  const notChecked = [ops.data ? null : "operational status", overview.data ? null : "billing and WhatsApp figures"].filter(
    (x): x is string => x !== null,
  );

  const checkedAt = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", timeZone: tz, timeZoneName: "short" }).format(now);
  const monthPeriod = periodLabel(now, tz);
  const ownerPhone = gym.owner?.phone ?? null;
  const ownerEmail = gym.owner?.email ?? null;

  return (
    <div className="flex flex-col gap-4">
      <NeedsAttention items={attention} partial={notChecked} checkedAt={checkedAt} />

      <Panel title="At a glance" note={`Status as of ${checkedAt}`}>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 2xl:grid-cols-4">
          <SummaryCard
            label="Subscription"
            value={sub?.packageName ?? (gym.status === "Trialing" ? "Trial" : "No package")}
            chip={{ text: gym.status, tone: gym.status }}
            emphasis={daysToExpiry !== null && daysToExpiry < 0}
            lines={[
              expiry ? `${daysToExpiry !== null && daysToExpiry < 0 ? "Ended" : "Ends"} ${shortDate(expiry, tz)} · ${daysLabel(daysToExpiry)}` : "No end date set",
              sub?.billingPeriod ? capitalizeBillingPeriod(sub.billingPeriod) : null,
              sub?.pending ? `Next: ${sub.pending.packageName ?? "queued package"} from ${shortDate(new Date(sub.pending.periodStart), tz)}` : null,
            ]}
            link={{ label: "Subscription & billing", href: `${base}/billing` }}
          />

          {o && s && waFacts && waStatus ? (
            <WhatsAppCard gymId={gym.id} overview={o} ops={s} status={waStatus} facts={waFacts} now={now} />
          ) : (
            <UnavailableCard label="WhatsApp" reason={overview.error ?? ops.error} />
          )}

          {o ? (
            <SummaryCard
              label={`Gym collections · This month`}
              value={formatMinorWhole(o.gymRevenue.monthMinor, currency)}
              lines={[
                monthPeriod,
                `${o.gymRevenue.paymentsThisMonth.toLocaleString("en-IN")} ${o.gymRevenue.paymentsThisMonth === 1 ? "payment" : "payments"} received · last month ${formatMinorWhole(o.gymRevenue.previousMonthMinor, currency)}`,
                m && m.pendingPaymentAmountMinor > 0
                  ? `${formatMinorWhole(m.pendingPaymentAmountMinor, m.currency)} pending, not counted`
                  : null,
              ]}
              link={{ label: "Payment activity", href: `${base}/activity?category=payments` }}
            />
          ) : (
            <UnavailableCard label="Gym collections" reason={overview.error} />
          )}

          {s ? (
            <SummaryCard
              label="Owner activity"
              value={s.owner?.lastActiveAt ?? s.owner?.lastSignInAt ? relativeTime((s.owner?.lastActiveAt ?? s.owner?.lastSignInAt) as string, now) : "No activity recorded"}
              lines={[
                s.owner?.lastSignInAt ? `Last sign-in ${relativeTime(s.owner.lastSignInAt, now)}` : s.owner ? "Has not signed in yet" : "No owner account linked",
                s.owner ? `${s.owner.emailVerified ? "Email verified" : "Email not verified"} · ${s.owner.phoneVerified ? "phone verified" : "phone not verified"}` : null,
              ]}
              link={{ label: "Owner access", href: `${base}/operations?section=access` }}
            />
          ) : (
            <UnavailableCard label="Owner activity" reason={ops.error} />
          )}
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Panel title="Members" action={{ label: "View all members", href: `${base}/members` }}>
          {m ? <MemberSnapshot gymId={gym.id} summary={m} cap={gym.usage.memberCap} /> : <Unavailable what="Member summary" reason={members.error} />}
        </Panel>

        <Panel title="MyFitDesk revenue from this gym" note="What this gym pays MyFitDesk">
          {o ? (
            <div className="flex flex-col gap-2 border-[1.5px] border-line bg-paper p-3">
              <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-mute">This month · {monthPeriod}</span>
                  <strong className="font-display text-[22px] leading-none tracking-[-0.02em] text-ink">{formatMinorWhole(o.myFitDeskRevenue.monthMinor, currency)}</strong>
                </div>
                <div className="flex flex-col gap-0.5 text-right">
                  <span className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-mute">Lifetime</span>
                  <strong className="text-[15px] text-ink">{formatMinorWhole(o.myFitDeskRevenue.lifetimeMinor, currency)}</strong>
                </div>
              </div>
              <p className="text-[12px] leading-snug text-ink2">
                Subscription and WhatsApp credit purchases that succeeded.{" "}
                {o.myFitDeskRevenue.lastPaymentAt ? `Last payment ${relativeTime(o.myFitDeskRevenue.lastPaymentAt, now)}.` : "No payment received yet."}
              </p>
              <TextLink href={`${base}/billing`}>Invoices and payments</TextLink>
            </div>
          ) : (
            <Unavailable what="MyFitDesk revenue" reason={overview.error} />
          )}
        </Panel>
      </div>

      <Panel title="Payments & enrollments" note="Money members paid the gym and new sign-ups, in IST." id="trend">
        {trend.data ? <GymTrendChart trend={trend.data} currency={currency} /> : <SectionError title="Payments & enrollments" message={trend.error ?? "Unavailable."} />}
      </Panel>

      <Panel
        title="Recent activity"
        note="Latest events from admin actions, the gym's app, payments and system checks."
        action={{ label: "View all activity", href: `${base}/activity` }}
      >
        {activity.data ? <RecentActivity events={activity.data.rows} timeZone={tz} now={now} /> : <Unavailable what="Recent activity" reason="Open the Activity tab to retry." />}
      </Panel>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Gym contact">
          <dl className="grid grid-cols-1 border-[1.5px] border-line bg-paper sm:grid-cols-2">
            <ContactRow label="Owner" value={gym.owner?.name ?? "No owner assigned"} />
            <ContactRow label="Owner phone" value={ownerPhone} href={telHref(ownerPhone)} />
            <ContactRow label="Owner email" value={ownerEmail} href={mailHref(ownerEmail)} />
            <ContactRow label="Gym phone" value={gym.contactPhone} href={telHref(gym.contactPhone)} />
            <ContactRow label="Gym email" value={gym.contactEmail} href={mailHref(gym.contactEmail)} />
            <ContactRow label="Location" value={[gym.addressLine, gym.city, gym.state].filter(Boolean).join(", ") || null} />
          </dl>
        </Panel>

        <Panel title="Admin notes" note="Private to platform admins. Never shown to the gym.">
          {notes.data ? <NotesPanel organizationId={gym.id} notes={notes.data} timeZone={tz} /> : <SectionError title="Admin notes" message={notes.error ?? "Unavailable."} />}
        </Panel>
      </div>
    </div>
  );
}

function whatsAppFacts(o: GymOverview, s: OpsSummary): WhatsAppFacts {
  return {
    connectionStatus: o.whatsapp.connectionStatus,
    connectionError: o.whatsapp.connectionError,
    lastSenderMode: o.whatsapp.lastSenderMode,
    balance: o.whatsapp.balance,
    lowCreditThreshold: o.whatsapp.lowCreditThreshold,
    failedMonth: o.whatsapp.failedMonth,
    stuckCount: o.whatsapp.stuckCount,
    paused: s.whatsapp.paused,
    failureRate: s.whatsapp.failureRate,
    sent30d: s.whatsapp.sent30d,
    lastSuccessAt: s.whatsapp.lastSuccessAt,
  };
}

function WhatsAppCard({
  gymId,
  overview,
  ops,
  status,
  facts,
  now,
}: {
  gymId: string;
  overview: GymOverview;
  ops: OpsSummary;
  status: ReturnType<typeof deriveWhatsAppStatus>;
  facts: WhatsAppFacts;
  now: Date;
}) {
  // Evidence-based wording only: a run, a failure count, or "no runs due".
  const automation = classifyHealth(
    {
      configured: null,
      tracked: true,
      failuresRecent: overview.health.automationFailuresMonth + overview.health.scheduledFailures,
      lastRunAt: overview.health.lastAutomationAt,
      lastSuccessAt: null,
      cadenceHours: null,
      hasUpcoming: false,
    },
    now,
  );
  const tone = { attention: "Attention", working: "Active", idle: "No data", unused: "No data" }[status.state];
  return (
    <SummaryCard
      label="WhatsApp"
      value={`${facts.balance.toLocaleString("en-IN")} credits`}
      chip={{ text: status.label, tone }}
      emphasis={status.state === "attention"}
      lines={[
        status.sender.label,
        ops.whatsapp.lastSuccessAt ? `Last delivered ${relativeTime(ops.whatsapp.lastSuccessAt, now)}` : "No message delivered yet",
        facts.failedMonth > 0 ? `${facts.failedMonth.toLocaleString("en-IN")} failed this month` : null,
        `Automations: ${HEALTH_LABEL[automation.state]}${overview.health.lastAutomationAt ? ` · last ${relativeTime(overview.health.lastAutomationAt, now)}` : ""}`,
      ]}
      link={{ label: "WhatsApp messages", href: `/admin/gyms/${gymId}/whatsapp` }}
    />
  );
}

function UnavailableCard({ label, reason }: { label: string; reason: string | null }) {
  return (
    <div className="flex flex-col gap-1.5 border-[1.5px] border-dashed border-line bg-paper p-3">
      <span className="mfd-micro-label">{label}</span>
      <Unavailable what={label} reason={reason} />
    </div>
  );
}

function MemberSnapshot({ gymId, summary, cap }: { gymId: string; summary: MemberSummary; cap: number | null }) {
  const base = `/admin/gyms/${gymId}/members`;
  const check = checkMemberCounts({
    total: summary.totalMembers,
    active: summary.activeMemberships,
    expiringSoon: summary.expiringSoon,
    expired: summary.expiredMemberships,
    noPlan: summary.noActivePlan,
    newThisMonth: summary.newMembersMonth,
  });
  const n = (value: number) => value.toLocaleString("en-IN");
  return (
    <div className="flex flex-col gap-2.5 border-[1.5px] border-line bg-paper p-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <strong className="font-display text-[22px] leading-none tracking-[-0.02em] text-ink">{n(summary.totalMembers)}</strong>
        <span className="text-[12.5px] text-ink2">
          members{cap !== null ? ` · plan limit ${n(cap)}` : ""}
        </span>
      </div>
      {check.consistent ? (
        <div className="grid grid-cols-2 gap-y-2.5 sm:flex sm:flex-wrap">
          <Stat label="Active" value={n(summary.activeMemberships)} href={base} note="incl. expiring, frozen" />
          {summary.expiringSoon > 0 ? <Stat label="Expiring ≤7 days" value={n(summary.expiringSoon)} href={`${base}?state=expiring_soon`} /> : null}
          {summary.expiredMemberships > 0 ? <Stat label="Expired" value={n(summary.expiredMemberships)} href={`${base}?state=expired`} /> : null}
          {summary.noActivePlan > 0 ? <Stat label="No active plan" value={n(summary.noActivePlan)} href={`${base}?state=none`} /> : null}
          <Stat label="New this month" value={n(summary.newMembersMonth)} />
        </div>
      ) : (
        <p role="alert" className="border-[1.5px] border-accent bg-accent/5 px-2.5 py-2 text-[12px] leading-snug text-ink">
          These member counts don&apos;t agree, so they are not shown. {check.problem} Open the member list to check them.
        </p>
      )}
      <p className="text-[11.5px] leading-snug text-mute">
        Counts people, not membership records: a member with several memberships is counted once, by their most relevant one. Deleted members are excluded.
      </p>
    </div>
  );
}

function ContactRow({ label, value, href }: { label: string; value: string | null | undefined; href?: string | null }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 border-b border-line p-2.5 last:border-b-0 sm:odd:border-r">
      <dt className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-mute">{label}</dt>
      <dd className="break-words text-[13px] font-medium text-ink">
        {value ? (
          href ? (
            <a href={href} className="underline decoration-line underline-offset-2 hover:text-accent hover:decoration-accent">
              {value}
            </a>
          ) : (
            value
          )
        ) : (
          <span className="font-normal text-mute">Not provided</span>
        )}
      </dd>
    </div>
  );
}

function shortDate(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone }).format(date);
}

function periodLabel(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `1–${get("day")} ${get("month")} ${get("year")}`;
}

function daysLabel(days: number | null) {
  if (days === null) return "";
  if (days < 0) return `${Math.abs(days)} ${Math.abs(days) === 1 ? "day" : "days"} overdue`;
  if (days === 0) return "today";
  return `${days} ${days === 1 ? "day" : "days"} left`;
}
