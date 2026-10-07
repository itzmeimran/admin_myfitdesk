"use client";

import { Button } from "@/components/Button";
import { IST_TIME_ZONE } from "@/core/dates/ist";
import { useRef, useState } from "react";
import type { MemberMembership, MemberPayment, MemberRow, MembershipState } from "@/features/gyms/members";
import { formatCalendarDate, formatZonedDateTime } from "@/core/dates/format";
import { formatMinorWhole } from "@/core/money/format";
import { Sheet } from "@/components/Sheet";
import { SkeletonBlock } from "@/components/Skeleton";
import { pillTone, PILL_CLASS } from "@/core/ui/status-style";
import { loadMemberDetail, type MemberDetailWithAvatar } from "./actions";
import { MemberAvatar } from "./member-avatar";
import { ActorLine } from "./actor-line";
import type { MemberActor } from "@/features/gyms/member-actors";
import { CopyIcon, RetryIcon } from '@/core/ui/icons';

const STATE_LABEL: Record<MembershipState, string> = {
  active: "Active",
  expiring_soon: "Expiring soon",
  expired: "Expired",
  upcoming: "Upcoming",
  frozen: "Frozen",
  cancelled: "Cancelled",
  deleted: "Deleted",
  none: "No active plan",
};

export function MemberDrawer({ organizationId, member, trigger, avatarUrl }: { organizationId: string; member: MemberRow; trigger: React.ReactNode; avatarUrl?: string | null }) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<MemberDetailWithAvatar | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  async function fetchDetail() {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError(null);
    const result = await loadMemberDetail(organizationId, member.id);
    if (currentRequest !== requestId.current) return;
    setLoading(false);
    if (result.error || !result.data) {
      setError(result.error ?? "Unable to load member details. Retry.");
      return;
    }
    setDetail(result.data);
  }

  function show() {
    setOpen(true);
    if (!detail && !loading) void fetchDetail();
  }

  function close() {
    requestId.current += 1;
    setOpen(false);
    setLoading(false);
  }

  return (
    <>
      <div className="flex min-w-0 items-center gap-2.5">
        <MemberAvatar name={member.name} url={avatarUrl} size={32} />
        <Button type="button" onClick={show} variant="link" size="custom" className="block min-w-0 max-w-full truncate text-left">
          {trigger}
        </Button>
      </div>
      <Sheet
        open={open}
        onClose={close}
        eyebrow="Platform admin view — read only"
        title={member.name}
        maxHeightClassName="max-h-[94dvh] md:max-h-[90dvh]"
        maxWidthClassName="md:max-w-3xl"
      >
        {loading && !detail ? <MemberDetailSkeleton /> : null}
        {error && !detail ? (
          <div className="flex flex-col items-center gap-3 border-[1.5px] border-accent bg-accent/5 px-4 py-10 text-center">
            <span className="font-display text-[17px] text-ink">Member details unavailable</span>
            <p className="text-[12px] text-mute">{error}</p>
            <Button icon={RetryIcon} type="button" onClick={() => void fetchDetail()} variant="danger" size="md">
              Retry
            </Button>
          </div>
        ) : null}
        {detail ? <MemberDetailContent detail={detail} /> : null}
      </Sheet>
    </>
  );
}

function MemberDetailContent({ detail }: { detail: MemberDetailWithAvatar }) {
  const { member } = detail;
  const timezone = IST_TIME_ZONE;
  const currentMembership = detail.memberships.find((item) => ["active", "expiring_soon", "frozen", "upcoming"].includes(item.state)) ?? detail.memberships[0] ?? null;
  const lastPayment = detail.payments[0] ?? null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <MemberAvatar name={member.name} url={detail.avatarUrl} size={56} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-[18px] leading-tight">{member.name}</p>
          <p className="text-[11px] capitalize text-mute">Member record · {member.status}</p>
        </div>
        <span className={PILL_CLASS} style={pillTone(currentMembership ? STATE_LABEL[currentMembership.state] : "No active plan")}>
          {currentMembership ? STATE_LABEL[currentMembership.state] : "No active plan"}
        </span>
      </div>

      {member.deletedAt ? (
        <div className="border-[1.5px] border-accent bg-accent/5 px-3 py-2 text-[11.5px] font-bold text-accent">
          Deleted {formatZonedDateTime(member.deletedAt, timezone)}. Historical data remains read only.
        </div>
      ) : null}

      <section className="grid grid-cols-1 border-l-[1.5px] border-t-[1.5px] border-line sm:grid-cols-2 lg:grid-cols-3" aria-label="Member overview">
        <OverviewCell label="Contact">
          <span className="font-mono text-[11.5px]">{member.phone ?? "No phone"}</span>
          <span className="break-all text-mute">{member.email ?? "No email"}</span>
        </OverviewCell>
        <OverviewCell label="Branch">
          <strong>{member.branchName}</strong>
          <span className="text-mute">Member status: {humanize(member.status)}</span>
        </OverviewCell>
        <OverviewCell label="Current membership">
          {currentMembership ? (
            <>
              <strong>{currentMembership.planName}</strong>
              <span className="text-mute">{formatCalendarDate(currentMembership.startDate)} → {formatCalendarDate(currentMembership.endDate)}</span>
              <span className="font-bold text-ink">{STATE_LABEL[currentMembership.state]}</span>
            </>
          ) : <span className="text-mute">No active plan</span>}
        </OverviewCell>
        <OverviewCell label="Last payment">
          {lastPayment ? (
            <>
              <strong>{formatMinorWhole(lastPayment.amountMinor, lastPayment.currency)}</strong>
              <span className="text-mute">{humanize(lastPayment.method)} · {humanize(lastPayment.status)}</span>
              <span className="text-mute">{formatZonedDateTime(lastPayment.paidAt, timezone)}</span>
            </>
          ) : <span className="text-mute">No payments</span>}
        </OverviewCell>
        <OverviewCell label="WhatsApp">
          {lastPayment?.receiptStatus ? (
            <>
              <strong>Payment receipt</strong>
              <span className="text-mute">{humanize(lastPayment.receiptStatus)}</span>
              <span className="text-mute">{formatZonedDateTime(lastPayment.receiptDeliveredAt ?? lastPayment.receiptSentAt ?? lastPayment.receiptFailedAt ?? lastPayment.receiptCreatedAt ?? lastPayment.paidAt, timezone)}</span>
            </>
          ) : detail.whatsapp.lastMessageAt ? (
            <>
              <strong>{detail.whatsapp.lastTemplate ?? "Message"}</strong>
              <span className="text-mute">{humanize(detail.whatsapp.lastStatus ?? "unknown")}</span>
              <span className="text-mute">{formatZonedDateTime(detail.whatsapp.lastMessageAt, timezone)}</span>
            </>
          ) : <span className="text-mute">No WhatsApp history</span>}
        </OverviewCell>
        <OverviewCell label="Joined">
          <strong>{formatZonedDateTime(member.createdAt, timezone)}</strong>
          <span className="text-mute">Joined date: {formatCalendarDate(member.joinedOn)}</span>
        </OverviewCell>
        <OverviewCell label="Added by">
          <ActorLine actor={detail.addedBy} none={detail.addedBy ? "Not recorded" : "Not available"} large explainInferred />
          <span className="text-mute3">{formatZonedDateTime(member.createdAt, timezone)}</span>
        </OverviewCell>
      </section>

      <HistorySection title="Membership history" empty="No membership history available.">
        {detail.memberships.map((membership) => <MembershipHistoryRow key={membership.id} membership={membership} timezone={timezone} actor={detail.membershipActors[membership.id]} />)}
      </HistorySection>

      <HistorySection title="Payment history" empty="No payment history available.">
        {detail.payments.map((payment) => <PaymentHistoryRow key={payment.id} payment={payment} timezone={timezone} />)}
      </HistorySection>

      <section className="flex flex-col gap-2 border-t-[1.5px] border-ink pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="mfd-micro-label">WhatsApp</h3>
          <div className="flex gap-3 text-[11px] text-mute">
            <span>Sent <strong className="text-ink">{detail.whatsapp.sent}</strong></span>
            <span>Delivered <strong className="text-ink">{detail.whatsapp.delivered}</strong></span>
            <span>Failed <strong className="text-accent">{detail.whatsapp.failed}</strong></span>
          </div>
        </div>
        {detail.whatsapp.messages.length ? (
          <details className="group border-[1.5px] border-line bg-paper">
            <summary className="cursor-pointer px-3 py-2.5 text-[11.5px] font-bold hover:bg-sand">View message history · {detail.whatsapp.messages.length}</summary>
            <div className="divide-y divide-line border-t border-line">
              {detail.whatsapp.messages.map((message) => (
                <div key={message.id} className="grid grid-cols-[1fr_auto] gap-3 px-3 py-2.5 text-[11.5px]">
                  <span className="min-w-0"><strong className="block truncate">{message.template}</strong><span className="text-mute">{humanize(message.origin)} · {humanize(message.senderMode ?? "sender unknown")}</span></span>
                  <span className="text-right"><strong className={message.status === "failed" ? "text-accent" : "text-ink"}>{humanize(message.status)}</strong><span className="block text-[10.5px] text-mute">{formatZonedDateTime(message.sentAt ?? message.failedAt ?? message.createdAt, timezone)}</span></span>
                </div>
              ))}
            </div>
          </details>
        ) : <EmptyCopy>No WhatsApp history available.</EmptyCopy>}
      </section>

      <section className="flex flex-col gap-2 border-t-[1.5px] border-ink pt-4">
        <h3 className="mfd-micro-label">Activity timeline</h3>
        {detail.timeline.length ? (
          <ol className="relative ml-1 border-l border-line pl-4">
            {detail.timeline.map((event) => (
              <li key={event.id} className="relative pb-4 last:pb-0">
                <span aria-hidden className="absolute -left-[19px] top-1 h-2 w-2 bg-accent" />
                <time className="block text-[10.5px] text-mute3">{event.at ? formatZonedDateTime(event.at, timezone) : event.date ? formatCalendarDate(event.date) : ""}</time>
                <strong className="block text-[12px] text-ink">{event.label}</strong>
                {event.detail ? <span className="block text-[11px] text-mute">{event.detail}</span> : null}
              </li>
            ))}
          </ol>
        ) : <EmptyCopy>No activity history available.</EmptyCopy>}
      </section>

      <details className="border-[1.5px] border-line bg-sand/40">
        <summary className="cursor-pointer px-3 py-2.5 text-[11px] font-bold uppercase tracking-[0.1em] text-mute hover:text-ink">Technical details</summary>
        <dl className="grid grid-cols-1 border-t border-line bg-paper sm:grid-cols-2">
          <TechnicalId label="Member ID" value={member.id} />
          <TechnicalId label="Organization ID" value={member.organizationId} />
          <TechnicalId label="Gym ID" value={member.gymId} />
          <TechnicalId label="Branch ID" value={member.branchId} />
          <TechnicalFact label="Created at" value={formatZonedDateTime(member.createdAt, timezone)} />
          <TechnicalFact label="Updated at" value={formatZonedDateTime(member.updatedAt, timezone)} />
          {member.deletedAt ? <TechnicalFact label="Deleted at" value={formatZonedDateTime(member.deletedAt, timezone)} /> : null}
        </dl>
      </details>
    </div>
  );
}

function OverviewCell({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex min-h-[94px] flex-col gap-1 border-b-[1.5px] border-r-[1.5px] border-line p-3 text-[11.5px]"><span className="mfd-micro-label mb-0.5">{label}</span>{children}</div>;
}

function HistorySection({ title, empty, children }: { title: string; empty: string; children: React.ReactNode }) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return <section className="flex flex-col gap-2 border-t-[1.5px] border-ink pt-4"><h3 className="mfd-micro-label">{title}</h3>{hasChildren ? <div className="divide-y divide-line border-[1.5px] border-line bg-paper">{children}</div> : <EmptyCopy>{empty}</EmptyCopy>}</section>;
}

function MembershipHistoryRow({ membership, timezone, actor }: { membership: MemberMembership; timezone: string; actor: MemberActor | undefined }) {
  return (
    <article className="flex flex-col gap-1 px-3 py-3 text-[11.5px] sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <span><strong className="block text-[12.5px]">{membership.planName}</strong><span className="text-mute">{formatCalendarDate(membership.startDate)} → {formatCalendarDate(membership.endDate)}</span><span className="block text-[10.5px] text-mute3">Created {formatZonedDateTime(membership.createdAt, timezone)}</span><ActorLine prefix="Assigned by" actor={actor} none={actor ? "Not recorded" : "Not available"} className="mt-0.5" /></span>
      <span className={PILL_CLASS} style={pillTone(STATE_LABEL[membership.state])}>{STATE_LABEL[membership.state]}</span>
    </article>
  );
}

function PaymentHistoryRow({ payment, timezone }: { payment: MemberPayment; timezone: string }) {
  const recorder: MemberActor = { name: payment.recordedByName, role: null, known: Boolean(payment.recordedBy), source: null };
  const terminal = payment.status === "refunded" && payment.refundedAt
    ? `Refunded${payment.refundedByName ? ` by ${payment.refundedByName}` : ""} · ${formatZonedDateTime(payment.refundedAt, timezone)}`
    : payment.status === "cancelled" && payment.rejectedAt
      ? `Cancelled${payment.rejectedByName ? ` by ${payment.rejectedByName}` : ""} · ${formatZonedDateTime(payment.rejectedAt, timezone)}`
      : null;
  return (
    <article className="grid grid-cols-1 gap-2 px-3 py-3 text-[11.5px] sm:grid-cols-[1fr_auto]">
      <span><time className="block text-[10.5px] text-mute3">{formatZonedDateTime(payment.paidAt, timezone)}</time><strong className="block text-[13px]">{formatMinorWhole(payment.amountMinor, payment.currency)} · {humanize(payment.method)}</strong><span className="text-mute">{payment.planName ?? "No linked plan"}</span><ActorLine prefix="Recorded by" actor={recorder} none="Online / system payment" className="mt-0.5" />{terminal ? <span className="mt-1 block font-bold text-accent">{terminal}</span> : null}</span>
      <span className="text-left sm:text-right"><span className={PILL_CLASS} style={pillTone(humanize(payment.status))}>{humanize(payment.status)}</span><span className="mt-1 block text-[10.5px] text-mute">{payment.invoiceNumber ? `Receipt ${payment.invoiceNumber}` : "No receipt number"}</span>{payment.receiptStatus ? <span className="block text-[10.5px] text-mute">WhatsApp: {humanize(payment.receiptStatus)}</span> : null}</span>
    </article>
  );
}

function TechnicalId({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  }
  return <div className="flex min-w-0 items-center gap-2 border-b border-r border-line px-3 py-2"><span className="min-w-0 flex-1"><dt className="mfd-micro-label">{label}</dt><dd className="truncate font-mono text-[10.5px] text-mute" title={value}>{value}</dd></span><Button icon={CopyIcon} type="button" onClick={() => void copy()} variant="secondary" size="md">{copied ? "Copied" : "Copy"}</Button></div>;
}

function TechnicalFact({ label, value }: { label: string; value: string }) {
  return <div className="border-b border-r border-line px-3 py-2"><dt className="mfd-micro-label">{label}</dt><dd className="text-[11px] text-mute">{value}</dd></div>;
}

function EmptyCopy({ children }: { children: React.ReactNode }) {
  return <div className="border-[1.5px] border-line bg-paper px-4 py-7 text-center text-[11.5px] text-mute">{children}</div>;
}

function MemberDetailSkeleton() {
  return <div className="flex flex-col gap-4" aria-label="Loading member details"><div className="flex gap-3"><SkeletonBlock className="h-11 w-11" /><span className="flex flex-1 flex-col gap-2"><SkeletonBlock className="h-4 w-40" /><SkeletonBlock className="h-3 w-24" /></span></div><div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }).map((_, index) => <SkeletonBlock key={index} className="h-24" />)}</div><SkeletonBlock className="h-36 w-full" /><SkeletonBlock className="h-36 w-full" /></div>;
}

function humanize(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
