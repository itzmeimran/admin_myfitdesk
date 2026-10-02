import { ButtonLink } from "@/components/ButtonLink";
import { IST_TIME_ZONE } from "@/core/dates/ist";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/core/db/server-client";
import { getGymDetail, type GymDetail } from "@/features/gyms/detail";
import { getGymOverview, type GymOverview, type OverviewMessage } from "@/features/gyms/overview";
import { formatMinorWhole } from "@/core/money/format";
import { daysBetween } from "@/core/dates/format";
import { capitalizeBillingPeriod } from "@/core/text/billing-period";
import { PILL_CLASS, pillTone } from "@/core/ui/status-style";
import { AlertIcon } from "@/core/ui/icons";
import { UsageBar } from "@/components/UsageBar";
import { NotesPanel } from "./notes-panel";
import { CommandCenter } from "./command-center";
import { SectionError } from "./ops-ui";
import { getNotes, getOpsSummary } from "@/features/gyms/ops/queries";
import type { NoteRow, OpsSummary } from "@/features/gyms/ops/types";
import { AUDIT_ACTION_LABEL } from "@/features/gyms/audit";

type Alert = { tone: "critical" | "warning"; text: string };

export default async function GymOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [gym, overviewResult, summaryResult, notesResult] = await Promise.all([
    getGymDetail(supabase, id),
    getGymOverview(supabase, id)
      .then((data) => ({ data, error: null as string | null }))
      .catch((error: unknown) => ({ data: null, error: error instanceof Error ? error.message : "Overview unavailable" })),
    getOpsSummary(supabase, id)
      .then((data) => ({ data, error: null as string | null }))
      .catch((error: unknown) => ({
        data: null as OpsSummary | null,
        error: error instanceof Error ? error.message : "Command center unavailable",
      })),
    getNotes(supabase, id)
      .then((data) => ({ data, error: null as string | null }))
      .catch((error: unknown) => ({
        data: null as NoteRow[] | null,
        error: error instanceof Error ? error.message : "Notes unavailable",
      })),
  ]);
  if (!gym) notFound();

  const commandCenter = summaryResult.data ? (
    <CommandCenter gym={gym} summary={summaryResult.data} overview={overviewResult.data} />
  ) : (
    <SectionError title="Command center" message={summaryResult.error ?? "Unavailable."} />
  );

  if (!overviewResult.data) {
    return (
      <div className="flex flex-col gap-5">
      {commandCenter}
      <section className="flex flex-col gap-3 border-[1.5px] border-accent bg-paper p-5">
        <div className="flex items-center gap-2 text-accent">
          <AlertIcon size={16} aria-hidden />
          <h2 className="font-bold">Overview data couldn&apos;t be loaded</h2>
        </div>
        <p className="text-[12.5px] leading-relaxed text-mute">
          The gym header and other tabs are still available. Retry this page after the overview database migration is applied.
        </p>
        <ButtonLink href={`/admin/gyms/${gym.id}`} variant="secondary" size="md" className="w-fit">
          Retry overview
        </ButtonLink>
      </section>
      </div>
    );
  }

  return (
    <OverviewContent
      gym={gym}
      overview={overviewResult.data}
      commandCenter={commandCenter}
      notes={notesResult.data}
      notesError={notesResult.error}
    />
  );
}

function OverviewContent({
  gym,
  overview,
  commandCenter,
  notes,
  notesError,
}: {
  gym: GymDetail;
  overview: GymOverview;
  commandCenter: React.ReactNode;
  notes: NoteRow[] | null;
  notesError: string | null;
}) {
  const now = new Date();
  const sub = gym.subscription;
  const expiry = sub?.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : null;
  const daysRemaining = expiry ? daysBetween(now, expiry) : null;
  const alerts = buildAlerts(gym, overview, daysRemaining, now);
  const deliveryRate = overview.whatsapp.sentMonth > 0
    ? (overview.whatsapp.deliveredMonth / overview.whatsapp.sentMonth) * 100
    : null;
  const currency = gym.defaultCurrency || "INR";

  return (
    <div className="flex flex-col gap-5">
      {commandCenter}
      <Section title="Needs attention" id="attention">
        {alerts.length ? (
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            {alerts.map((alert) => (
              <div
                key={alert.text}
                className={`flex items-start gap-2.5 border-[1.5px] px-3.5 py-3 text-[12.5px] ${
                  alert.tone === "critical" ? "border-accent bg-accent/8 text-accent" : "border-hi bg-hi/10 text-ink2"
                }`}
              >
                <AlertIcon size={15} className="mt-0.5 flex-shrink-0" aria-hidden />
                <span className="font-bold leading-relaxed">{alert.text}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="border-[1.5px] border-line bg-paper px-4 py-3 text-[12.5px] font-bold text-ink">
            ✓ No issues requiring attention
          </div>
        )}
      </Section>

      <Section title="Subscription summary" description="What this gym pays MyFitDesk—not member revenue.">
        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          <Metric label="Current plan" value={sub?.packageName ?? (gym.status === "Trialing" ? "Trial" : "No package")} />
          <Metric label="Status" value={gym.status} pill />
          <Metric label="Expiry / renewal" value={expiry ? formatDate(expiry, IST_TIME_ZONE) : "Not scheduled"} supporting={daysLabel(daysRemaining)} />
          <Metric label="Lifetime paid" value={formatMinorWhole(overview.subscription.lifetimePaidMinor, currency)} />
        </div>
        <div className="grid grid-cols-1 gap-0 border-[1.5px] border-line bg-paper sm:grid-cols-3">
          <Info label="Started" value={sub?.currentPeriodStart ? formatDate(new Date(sub.currentPeriodStart), IST_TIME_ZONE) : "—"} />
          <Info label="Billing cycle" value={capitalizeBillingPeriod(sub?.billingPeriod)} />
          <Info
            label="Last subscription payment"
            value={overview.subscription.lastPaymentMinor !== null ? formatMinorWhole(overview.subscription.lastPaymentMinor, currency) : "No successful payment"}
            supporting={formatDateTime(overview.subscription.lastPaymentAt, IST_TIME_ZONE)}
          />
        </div>
      </Section>

      <Section title="WhatsApp health" description="Delivery, queue and credit signals for this gym." id="whatsapp-health">
        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-5">
          <Metric label="Credit balance" value={overview.whatsapp.balance.toLocaleString("en-IN")} supporting={`Used this month: ${overview.whatsapp.creditsUsedMonth.toLocaleString("en-IN")}`} />
          <Metric label="Sent this month" value={overview.whatsapp.sentMonth.toLocaleString("en-IN")} supporting={`${overview.whatsapp.sentToday.toLocaleString("en-IN")} today`} />
          <Metric label="Delivered" value={overview.whatsapp.deliveredMonth.toLocaleString("en-IN")} supporting={deliveryRate === null ? "No completed sends" : `${deliveryRate.toFixed(1)}% delivery rate`} />
          <Metric label="Failed" value={overview.whatsapp.failedMonth.toLocaleString("en-IN")} accent={overview.whatsapp.failedMonth > 0} supporting="This month" />
          <Metric label="Pending / queued" value={overview.whatsapp.pending.toLocaleString("en-IN")} accent={overview.whatsapp.stuckCount > 0} supporting={overview.whatsapp.stuckCount > 0 ? `${overview.whatsapp.stuckCount} stuck` : "Queue clear"} />
        </div>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.35fr_1fr]">
          <div className="grid grid-cols-2 gap-0 border-[1.5px] border-line bg-paper sm:grid-cols-4">
            <Info label="Connection" value={connectionLabel(overview)} />
            <Info label="Sender mode" value={senderModeLabel(overview.whatsapp.lastSenderMode)} />
            <Info label="Utility" value={`${overview.whatsapp.utilityMonth.toLocaleString("en-IN")} this month`} />
            <Info label="Marketing" value={`${overview.whatsapp.marketingMonth.toLocaleString("en-IN")} this month`} />
            <Info label="Last message" value={formatDateTime(overview.whatsapp.lastMessageAt, IST_TIME_ZONE)} />
            <Info label="Last webhook" value={formatDateTime(overview.whatsapp.lastWebhookAt, IST_TIME_ZONE)} />
            <Info
              label="Last credit purchase"
              value={overview.whatsapp.lastCreditPurchaseMinor !== null ? formatMinorWhole(overview.whatsapp.lastCreditPurchaseMinor, currency) : "No purchase"}
              supporting={formatDateTime(overview.whatsapp.lastCreditPurchaseAt, IST_TIME_ZONE)}
            />
            <Info label="Credits consumed" value={overview.whatsapp.creditsUsedMonth.toLocaleString("en-IN")} supporting="This month" />
          </div>
          {overview.whatsapp.latestFailure ? (
            <div className="flex flex-col gap-2 border-[1.5px] border-accent bg-accent/5 p-4">
              <span className="text-[10px] font-bold uppercase tracking-[0.11em] text-accent">Latest failure</span>
              <strong className="text-[13px] leading-relaxed text-ink">
                {overview.whatsapp.latestFailure.errorMessage || overview.whatsapp.latestFailure.errorCode || "Delivery failed without provider detail"}
              </strong>
              <span className="text-[11.5px] text-mute">{formatDateTime(overview.whatsapp.latestFailure.at, IST_TIME_ZONE)}</span>
              <Link href={`/admin/gyms/${gym.id}/whatsapp?status=failed`} className="mt-auto w-fit text-[10.5px] font-bold uppercase tracking-[0.09em] text-accent hover:underline">View failures →</Link>
            </div>
          ) : (
            <div className="flex items-center border-[1.5px] border-line bg-paper p-4 text-[12.5px] text-mute">No failed WhatsApp messages recorded.</div>
          )}
        </div>
      </Section>

      <Section title="Recent WhatsApp messages" description="Latest outbound messages. Expand a row for delivery diagnostics." id="whatsapp-messages">
        {overview.whatsapp.recentMessages.length ? (
          <MessageHistory messages={overview.whatsapp.recentMessages} timezone={IST_TIME_ZONE} />
        ) : (
          <EmptyCopy>No outbound WhatsApp messages have been recorded for this gym.</EmptyCopy>
        )}
        <Link href={`/admin/gyms/${gym.id}/whatsapp`} className="w-fit text-[10.5px] font-bold uppercase tracking-[0.09em] text-accent hover:underline">View complete WhatsApp history →</Link>
      </Section>

      <Section title="Revenue" description="Gym collections and MyFitDesk earnings stay deliberately separate.">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <RevenueCard title="Gym business revenue" subtitle="Money members paid to the gym" values={[["Today", formatMinorWhole(overview.gymRevenue.todayMinor, currency)], ["This month", formatMinorWhole(overview.gymRevenue.monthMinor, currency)], ["Previous month", formatMinorWhole(overview.gymRevenue.previousMonthMinor, currency)], ["Lifetime", formatMinorWhole(overview.gymRevenue.lifetimeMinor, currency)]]} footer={`${overview.gymRevenue.paymentsThisMonth.toLocaleString("en-IN")} payments this month`} />
          <RevenueCard title="MyFitDesk revenue from this gym" subtitle="Subscription and WhatsApp credit purchases" values={[["This month", formatMinorWhole(overview.myFitDeskRevenue.monthMinor, currency)], ["Lifetime", formatMinorWhole(overview.myFitDeskRevenue.lifetimeMinor, currency)]]} footer={`Last payment: ${formatDateTime(overview.myFitDeskRevenue.lastPaymentAt, IST_TIME_ZONE)}`} />
        </div>
      </Section>

      <Section title="Gym activity snapshot" description="Operational context—not the primary health signal.">
        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          <Metric label="Total members" value={gym.usage.memberCount.toLocaleString("en-IN")} />
          <Metric label="Active memberships" value={overview.activity.activeMemberships.toLocaleString("en-IN")} />
          <Metric label="Expired memberships" value={overview.activity.expiredMemberships.toLocaleString("en-IN")} />
          <Metric label="Expiring in 7 days" value={overview.activity.expiring7d.toLocaleString("en-IN")} accent={overview.activity.expiring7d > 0} />
          <Metric label="New members" value={overview.activity.newMembersMonth.toLocaleString("en-IN")} supporting="This month" />
          <Metric label="Payments" value={overview.activity.paymentsMonth.toLocaleString("en-IN")} supporting="This month" />
          <Metric label="Last member added" value={formatDateTime(overview.activity.lastMemberAddedAt, IST_TIME_ZONE)} compact />
          <Metric label="Last gym payment" value={formatDateTime(overview.activity.lastGymPaymentAt, IST_TIME_ZONE)} compact />
        </div>
        <div className="grid grid-cols-1 gap-0 border-[1.5px] border-line bg-paper sm:grid-cols-2">
          <div className="p-4 sm:border-r sm:border-line"><span className="text-[10px] font-bold uppercase tracking-[0.11em] text-mute3">Last owner activity</span><div className="mt-1 flex flex-wrap items-baseline gap-2"><strong className="text-[15px]">{formatDateTime(overview.activity.lastOwnerActivityAt, IST_TIME_ZONE)}</strong><span className="text-[11.5px] text-mute">{activityFreshness(overview.activity.lastOwnerActivityAt, now)}</span></div></div>
          <div className="border-t border-line p-4 sm:border-t-0"><span className="text-[10px] font-bold uppercase tracking-[0.11em] text-mute3">Last important gym action</span><div className="mt-1 flex flex-wrap items-baseline gap-2"><strong className="text-[13px]">{overview.activity.lastGymAction ?? "No activity recorded"}</strong><span className="text-[11.5px] text-mute">{formatDateTime(overview.activity.lastGymActionAt, IST_TIME_ZONE)}</span></div></div>
        </div>
      </Section>

      <Section title="Account usage" description={sub?.packageName ? `${sub.packageName} plan limits` : "Current account usage"}>
        <div className="grid grid-cols-1 gap-0 border-[1.5px] border-line bg-paper md:grid-cols-3">
          <UsageCell label="Members" used={gym.usage.memberCount} cap={gym.usage.memberCap} />
          <UsageCell label="Branches" used={gym.usage.branchCount} cap={gym.usage.branchCap} />
          <UsageCell label="Staff" used={gym.usage.staffCount} cap={gym.usage.staffCap} />
        </div>
      </Section>

      <Section title="System health" description="Only services with reliable stored signals are shown.">
        <div className="grid grid-cols-1 gap-0 border-[1.5px] border-line bg-paper sm:grid-cols-2 lg:grid-cols-4">
          <Health label="WhatsApp" value={connectionLabel(overview)} bad={overview.whatsapp.connectionStatus === "error"} />
          <Health label="Queue worker" value={overview.health.lastQueueDrainAt ? `Last ran ${formatDateTime(overview.health.lastQueueDrainAt, IST_TIME_ZONE)}` : "No run recorded"} bad={overview.whatsapp.stuckCount > 0} />
          <Health label="Scheduled campaigns" value={overview.health.scheduledFailures ? `${overview.health.scheduledFailures} failed in 24h` : "Healthy"} bad={overview.health.scheduledFailures > 0} />
          <Health label="Automations" value={overview.health.automationFailuresMonth ? `${overview.health.automationFailuresMonth} failed this month` : "Healthy"} bad={overview.health.automationFailuresMonth > 0} supporting={overview.health.lastAutomationAt ? `Last: ${formatDateTime(overview.health.lastAutomationAt, IST_TIME_ZONE)}` : undefined} />
        </div>
      </Section>

      <Section title="Recent activity" description="Latest important platform billing and admin events.">
        {overview.recentActivity.length ? <div className="divide-y divide-line border-[1.5px] border-line bg-paper">{overview.recentActivity.map((event, index) => <div key={`${event.kind}-${event.at}-${index}`} className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-3 text-[12.5px]"><span className="font-bold text-ink">{activityLabel(event.label)}</span><span className="text-mute">{event.amountMinor !== null ? `${formatMinorWhole(event.amountMinor, event.currency ?? currency)} · ` : ""}{formatDateTime(event.at, IST_TIME_ZONE)}</span></div>)}</div> : <EmptyCopy>No important activity has been recorded yet.</EmptyCopy>}
        <Link href={`/admin/gyms/${gym.id}/activity`} className="w-fit text-[10.5px] font-bold uppercase tracking-[0.09em] text-accent hover:underline">View complete activity →</Link>
      </Section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Section title="Gym profile" description="Quick contact information">
          <div className="grid grid-cols-1 gap-0 border-[1.5px] border-line bg-paper sm:grid-cols-2"><Info label="Owner" value={gym.owner?.name ?? "No owner assigned"} /><Info label="Phone" value={gym.owner?.phone ?? gym.contactPhone ?? "—"} /><Info label="Email" value={gym.owner?.email ?? gym.contactEmail ?? "—"} /><Info label="City" value={gym.city ?? "—"} /></div>
        </Section>

        <Section title="Admin notes" description="Private — never visible to the gym owner, staff or trainers.">
          {notes ? (
            <NotesPanel organizationId={gym.id} notes={notes} timeZone={IST_TIME_ZONE} />
          ) : (
            <SectionError title="Admin notes" message={notesError ?? "Unavailable."} />
          )}
        </Section>
      </div>
    </div>
  );
}

function buildAlerts(gym: GymDetail, overview: GymOverview, daysRemaining: number | null, now: Date): Alert[] {
  const alerts: Alert[] = [];
  if (gym.status === "Suspended") alerts.push({ tone: "critical", text: "This gym is suspended." });
  if (daysRemaining !== null && daysRemaining < 0) alerts.push({ tone: "critical", text: `Subscription expired ${Math.abs(daysRemaining)} days ago.` });
  else if (daysRemaining !== null && daysRemaining <= 7) alerts.push({ tone: "warning", text: `Subscription expires in ${Math.max(daysRemaining, 0)} days.` });
  if (overview.whatsapp.balance === 0) alerts.push({ tone: "critical", text: "WhatsApp credit balance is zero." });
  else if (overview.whatsapp.lowCreditThreshold !== null && overview.whatsapp.balance <= overview.whatsapp.lowCreditThreshold) alerts.push({ tone: "warning", text: `WhatsApp credits remaining: ${overview.whatsapp.balance.toLocaleString("en-IN")}.` });
  if (overview.whatsapp.connectionStatus === "error") alerts.push({ tone: "critical", text: overview.whatsapp.connectionError || "WhatsApp configuration has an error." });
  if (overview.whatsapp.connectionStatus === "disconnected" && overview.whatsapp.lastSenderMode !== "managed") alerts.push({ tone: "warning", text: "The gym's WhatsApp number is disconnected." });
  if (overview.whatsapp.failedMonth > 0) alerts.push({ tone: "critical", text: `${overview.whatsapp.failedMonth.toLocaleString("en-IN")} WhatsApp messages failed this month.` });
  if (overview.whatsapp.stuckCount > 0) alerts.push({ tone: "critical", text: `${overview.whatsapp.stuckCount.toLocaleString("en-IN")} WhatsApp messages appear stuck in the queue.` });
  if (overview.health.scheduledFailures > 0) alerts.push({ tone: "critical", text: `${overview.health.scheduledFailures.toLocaleString("en-IN")} scheduled campaigns failed in the last 24 hours.` });
  if (overview.health.automationFailuresMonth > 0) alerts.push({ tone: "critical", text: `${overview.health.automationFailuresMonth.toLocaleString("en-IN")} owner automations failed this month.` });
  if (overview.activity.lastOwnerActivityAt) { const inactiveDays = daysBetween(new Date(overview.activity.lastOwnerActivityAt), now); if (inactiveDays >= 14) alerts.push({ tone: "warning", text: `Owner has been inactive for ${inactiveDays} days.` }); }
  return alerts;
}

function Section({ title, description, id, children }: { title: string; description?: string; id?: string; children: React.ReactNode }) { return <section id={id} className="flex scroll-mt-4 flex-col gap-2.5"><div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1"><h2 className="mfd-micro-label">{title}</h2>{description ? <p className="text-[11.5px] text-mute3">{description}</p> : null}</div>{children}</section>; }
function Metric({ label, value, supporting, accent, pill, compact }: { label: string; value: string; supporting?: string; accent?: boolean; pill?: boolean; compact?: boolean }) { return <div className={`flex min-w-0 flex-col gap-1 border-[1.5px] bg-paper p-3.5 ${accent ? "border-accent" : "border-line"}`}><span className="text-[10px] font-bold uppercase tracking-[0.11em] text-mute3">{label}</span>{pill ? <span className={`${PILL_CLASS} mt-1 w-fit`} style={pillTone(value)}>{value}</span> : <strong className={`${compact ? "text-[14px] leading-snug" : "font-display text-[21px] tracking-[-0.025em]"} break-words ${accent ? "text-accent" : "text-ink"}`}>{value}</strong>}{supporting ? <span className="text-[10.5px] text-mute">{supporting}</span> : null}</div>; }
function Info({ label, value, supporting }: { label: string; value: string; supporting?: string }) { return <div className="flex min-w-0 flex-col gap-0.5 border-b border-r border-line p-3 last:border-b-0"><span className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-mute3">{label}</span><span className="break-words text-[12.5px] font-bold text-ink">{value}</span>{supporting ? <span className="text-[10.5px] text-mute">{supporting}</span> : null}</div>; }
function RevenueCard({ title, subtitle, values, footer }: { title: string; subtitle: string; values: Array<[string, string]>; footer: string }) { return <div className="flex flex-col gap-3 border-[1.5px] border-line bg-paper p-4"><div><h3 className="text-[13px] font-bold text-ink">{title}</h3><p className="text-[10.5px] text-mute3">{subtitle}</p></div><div className="grid grid-cols-2 gap-x-4 gap-y-3 border-y border-line py-3">{values.map(([label, value]) => <div key={label} className="flex flex-col gap-0.5"><span className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-mute3">{label}</span><strong className="text-[18px] text-ink">{value}</strong></div>)}</div><span className="text-[11px] text-mute">{footer}</span></div>; }
function UsageCell({ label, used, cap }: { label: string; used: number; cap: number | null }) { return <div className="border-b border-r border-line p-4 last:border-b-0"><UsageBar label={label} used={used} cap={cap} /></div>; }
function Health({ label, value, supporting, bad }: { label: string; value: string; supporting?: string; bad?: boolean }) { return <div className="flex flex-col gap-1 border-b border-r border-line p-3.5"><span className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-mute3">{label}</span><strong className={bad ? "text-[12.5px] text-accent" : "text-[12.5px] text-ink"}>{value}</strong>{supporting ? <span className="text-[10.5px] text-mute">{supporting}</span> : null}</div>; }

function MessageHistory({ messages, timezone }: { messages: OverviewMessage[]; timezone: string }) {
  return <div className="border-[1.5px] border-line bg-paper"><div className="hidden grid-cols-[1.1fr_1.4fr_.7fr_1fr_.7fr] gap-3 border-b-[1.5px] border-line bg-sand px-3 py-2.5 text-[9.5px] font-bold uppercase tracking-[0.1em] text-mute lg:grid">{["Recipient", "Template", "Category", "Sent", "Status"].map((h) => <span key={h}>{h}</span>)}</div>{messages.map((message) => <details key={message.id} className="group border-b border-line last:border-b-0"><summary className="grid cursor-pointer list-none grid-cols-2 gap-2 px-3 py-3 text-[12px] hover:bg-sand/40 lg:grid-cols-[1.1fr_1.4fr_.7fr_1fr_.7fr] lg:gap-3"><span className="font-bold text-ink">{message.recipient}<small className="block font-normal text-mute3">{message.phone}</small></span><span className="text-right text-ink2 lg:text-left">{message.template}</span><span className="hidden capitalize text-mute lg:block">{message.category}</span><span className="hidden text-mute lg:block">{formatDateTime(message.sentAt ?? message.createdAt, timezone)}</span><span className="hidden lg:block"><MessageStatus status={message.status} /></span><span className="text-mute lg:hidden">{formatDateTime(message.sentAt ?? message.createdAt, timezone)}</span><span className="justify-self-end lg:hidden"><MessageStatus status={message.status} /></span></summary><dl className="grid grid-cols-1 gap-x-5 gap-y-2 border-t border-line bg-sand/35 px-3 py-3 text-[11px] sm:grid-cols-2 lg:grid-cols-4"><Diagnostic label="Meta message ID" value={message.metaMessageId ?? "—"} /><Diagnostic label="Sender mode" value={senderModeLabel(message.senderMode)} /><Diagnostic label="Error code" value={message.errorCode ?? "—"} /><Diagnostic label="Error message" value={message.errorMessage ?? "—"} /><Diagnostic label="Sent" value={formatDateTime(message.sentAt, timezone)} /><Diagnostic label="Delivered" value={formatDateTime(message.deliveredAt, timezone)} /><Diagnostic label="Read" value={formatDateTime(message.readAt, timezone)} /><Diagnostic label="Credits deducted" value={message.creditsUsed.toLocaleString("en-IN")} /></dl></details>)}</div>;
}

function MessageStatus({ status }: { status: string }) { const label = status.charAt(0).toUpperCase() + status.slice(1); const normalized = status === "failed" ? "Failed" : status === "queued" || status === "processing" ? "Queued" : "Active"; return <span className={PILL_CLASS} style={pillTone(normalized)}>{label}</span>; }
function Diagnostic({ label, value }: { label: string; value: string }) { return <div className="min-w-0"><dt className="text-[9px] font-bold uppercase tracking-[0.09em] text-mute3">{label}</dt><dd className="break-words text-ink2">{value}</dd></div>; }
function EmptyCopy({ children }: { children: React.ReactNode }) { return <div className="border-[1.5px] border-line bg-paper px-4 py-8 text-center text-[12.5px] text-mute">{children}</div>; }

function formatDate(date: Date, timezone: string) { return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: timezone }).format(date); }
function formatDateTime(value: string | null, timezone: string) { if (!value) return "Not recorded"; const date = new Date(value); const today = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date()); const dateKey = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(date); const time = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", timeZone: timezone }).format(date); if (dateKey === today) return `Today, ${time}`; return `${formatDate(date, timezone)}, ${time}`; }
function daysLabel(days: number | null) { if (days === null) return undefined; if (days < 0) return `${Math.abs(days)} days overdue`; if (days === 0) return "Expires today"; return `${days} days remaining`; }
function senderModeLabel(mode: string | null) { if (mode === "own_waba") return "Gym's own number"; if (mode === "managed") return "MyFitDesk managed"; return "Not recorded"; }
function connectionLabel(overview: GymOverview) { if (overview.whatsapp.connectionStatus === "connected") return "Connected"; if (overview.whatsapp.lastSenderMode === "managed") return "Managed sender active"; if (overview.whatsapp.connectionStatus === "error") return "Configuration error"; if (overview.whatsapp.connectionStatus === "disconnected") return "Disconnected"; return "Not configured"; }
function activityFreshness(value: string | null, now: Date) { if (!value) return "No activity signal recorded"; const days = daysBetween(new Date(value), now); if (days <= 0) return "Active today"; if (days <= 7) return "Active this week"; return `Inactive for ${days} days`; }
function activityLabel(action: string) { if (action === "admin_note.added") return "Admin note added"; return AUDIT_ACTION_LABEL[action] ?? action; }
