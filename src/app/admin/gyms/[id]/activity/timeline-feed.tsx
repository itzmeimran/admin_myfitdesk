"use client";

import { Button } from "@/components/Button";
import { AddIcon, AlertIcon, CalendarIcon, ChevronIcon, DeleteIcon, DetailsIcon, EditIcon, ExportIcon, GymsIcon, ListIcon, ProtectIcon, RevenueIcon, RetryIcon, UploadIcon, WhatsAppIcon } from '@/core/ui/icons';
import { istDateKey } from "@/core/dates/ist";
import { useEffect, useRef, useState } from "react";
import { ButtonLink } from "@/components/ButtonLink";
import { useActionConfirmation } from "@/components/ActionConfirmationProvider";
import { useToast } from "@/components/Toast";
import { formatMinor } from "@/core/money/format";
import type { TimelineEvent } from "@/features/gyms/ops/types";
import type { TimelineFilters } from "@/features/gyms/ops/queries";
import { loadActivityGroup } from "./actions";
import {
  CATEGORY_LABEL,
  STATUS_LABEL,
  changeHighlights,
  eventSubject,
  eventTitle,
  eventEmphasis,
  eventRecordLink,
  exactTime,
  fieldChanges,
  humanizeKey,
  relativeTime,
  roleLabel,
  sourceLabel,
  sanitizeAuditValue,
  safeText,
} from "@/features/gyms/ops/timeline-format";
import { StatusPill } from "../ops-ui";

const STATUS_TONE = { success: "Healthy", warning: "Attention", failed: "Down" } as const;
const EVENT_ICONS = { deletion: DeleteIcon, alert: AlertIcon, permissions: ProtectIcon, photo: UploadIcon, payment: RevenueIcon, membership: CalendarIcon, whatsapp: WhatsAppIcon, added: AddIcon, gym: GymsIcon, edited: EditIcon, details: DetailsIcon };
function eventIconKey(event: TimelineEvent): keyof typeof EVENT_ICONS {
  const emphasis = eventEmphasis(event);
  if (emphasis === "Completed deletion") return "deletion";
  if (emphasis === "Deletion request") return "alert";
  if (emphasis === "Access change" || event.category === "security") return "permissions";
  if (eventTitle(event).startsWith("Profile photo")) return "photo";
  if (["payments", "billing"].includes(event.category)) return "payment";
  if (["memberships", "subscription"].includes(event.category)) return "membership";
  if (event.category === "whatsapp") return "whatsapp";
  if (event.operation === "INSERT") return "added";
  if (event.operation === "DELETE") return "deletion";
  if (event.category === "gym") return "gym";
  return event.operation === "UPDATE" ? "edited" : "details";
}

/**
 * Explicit inline disclosures preserve normal document/tab order on all
 * screens. Logs are read-only; no heuristic timestamp-based grouping.
 */
export function TimelineFeed({
  events,
  organizationId,
  timeZone,
  initialNow,
  filters = {},
}: {
  events: TimelineEvent[];
  organizationId: string;
  timeZone: string;
  initialNow: string;
  filters?: TimelineFilters;
}) {
  const [now, setNow] = useState(() => new Date(initialNow));
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return (
    <ol aria-label="Gym activity" className="flex min-w-0 flex-col gap-2">
      {events.map(event => event.memberId && (event.groupCount ?? 1) > 1
        ? <ActivityGroup key={`${organizationId}:${event.memberId}:${event.eventId}:${event.groupCount}:${JSON.stringify(filters)}`} event={event} organizationId={organizationId} timeZone={timeZone} now={now} filters={filters} />
        : <ActivityEntry key={`${organizationId}:${event.eventId}`} event={event} organizationId={organizationId} timeZone={timeZone} now={now} />)}
    </ol>
  );
}

function ActivityGroup({ event, organizationId, timeZone, now, filters }: { event: TimelineEvent; organizationId: string; timeZone: string; now: Date; filters: TimelineFilters }) {
  const [expanded, setExpanded] = useState(false);
  const [rows, setRows] = useState<TimelineEvent[]>([]);
  const [total, setTotal] = useState(event.groupCount ?? 1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);
  const id = `member-activity-${event.memberId}`;
  const name = event.memberName ?? "Member name not recorded";
  const link = eventRecordLink(event, organizationId);
  async function load(offset: number) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await loadActivityGroup(organizationId, event.memberId!, filters, offset);
      if (result.error || !result.data) { setError(result.error ?? "Activities unavailable."); return; }
      const data = result.data;
      setRows(current => offset === 0 ? data.rows : [...current, ...data.rows.filter(next => !current.some(row => row.eventId === next.eventId))]);
      setTotal(data.total);
    } catch { setError("Unable to load activities. Retry."); }
    finally { running.current = false; setBusy(false); }
  }
  function toggle() {
    setExpanded(v => !v);
    if (!expanded && rows.length === 0 && !busy) void load(0);
  }
  return <li className={`min-w-0 border-[1.5px] border-l-4 bg-paper ${event.groupHasImportant ? "border-line border-l-accent" : "border-line"}`}>
    <article className="flex min-w-0 items-start gap-2.5 p-3 sm:p-3.5">
      <ListIcon size={18} className="mt-0.5 shrink-0 text-ink2" aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h3 className="text-[13.5px] font-bold text-ink [overflow-wrap:anywhere]">{name} activity</h3>
          <time dateTime={event.occurredAt} title={exactTime(event.occurredAt, timeZone)} className="text-[11.5px] text-ink2 sm:ml-auto">{relativeTime(event.occurredAt, now)}</time>
        </div>
        <p className="text-[12.5px] text-ink2 [overflow-wrap:anywhere]">{total.toLocaleString("en-IN")} activities{event.groupPlan ? ` · ${event.groupPlan}` : ""}{event.groupAmountMinor != null ? ` · Recorded amount ${formatMinor(event.groupAmountMinor, event.currency ?? "INR")}` : ""}</p>
        {event.groupHasImportant ? <span className="self-start border border-accent/40 px-1.5 py-0.5 text-[10.5px] font-bold text-accent">Contains important changes</span> : null}
        <p className="text-[11.5px] text-ink2 [overflow-wrap:anywhere]">{eventTitle(event)} · {safeText(event.actorLabel)} · {roleLabel(event.actorRole)} · {sourceLabel(event.origin)}</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <Button icon={ChevronIcon} variant="text" size="sm" aria-expanded={expanded} aria-controls={id} aria-label={`${expanded ? "Hide" : "View"} ${total} activities for ${name}`} onClick={toggle}>
            {expanded ? "Hide activities" : `View ${total} related events`}
          </Button>
          {link ? <ButtonLink href={link.href} variant="text" size="sm">{link.label}</ButtonLink> : null}
        </div>
      </div>
    </article>
    <div id={id} hidden={!expanded} className="min-w-0 border-t border-line bg-sand/30 p-2 sm:p-3">
      {expanded ? <div className="flex min-w-0 flex-col gap-2">
        <p className="text-[11.5px] text-ink2">Original events for this member, newest first. Each event retains its own details and actor.</p>
        <ol aria-label={`${name} original activities`} className="flex min-w-0 flex-col gap-2">{rows.map(row => <ActivityEntry key={row.eventId} event={row} organizationId={organizationId} timeZone={timeZone} now={now} />)}</ol>
        {busy ? <p role="status" className="text-[12px] text-ink2">Loading activities…</p> : null}
        {error ? <div role="alert" className="flex flex-wrap items-center gap-2 text-[12px] text-ink2"><span>{error}</span><Button icon={RetryIcon} variant="secondary" size="sm" pending={busy} onClick={() => void load(rows.length)}>Retry</Button></div> : null}
        {!busy && !error && !rows.length ? <p className="text-[12px] text-ink2">No activities match the current filters. Refresh the feed.</p> : null}
        {rows.length < total && !error ? <Button icon={ChevronIcon} variant="secondary" size="sm" className="self-start" pending={busy} pendingLabel="Loading activities…" onClick={() => void load(rows.length)}>Load more events ({rows.length} of {total})</Button> : null}
      </div> : null}
    </div>
  </li>;
}

function ActivityEntry({ event, organizationId, timeZone, now }: { event: TimelineEvent; organizationId: string; timeZone: string; now: Date }) {
  const [expanded, setExpanded] = useState(false);
  const subject = eventSubject(event, timeZone);
  const emphasis = eventEmphasis(event);
  const Icon = EVENT_ICONS[eventIconKey(event)];
  const link = eventRecordLink(event, organizationId);
  const detailsId = `activity-${event.eventId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  return <li className={`min-w-0 border-[1.5px] border-l-4 bg-paper ${emphasis || event.status === "failed" ? "border-line border-l-accent" : "border-line"}`}>
    <article className="min-w-0 p-3 sm:p-3.5">
      <div className="flex items-start gap-2.5">
        <Icon size={18} className={`mt-0.5 shrink-0 ${emphasis ? "text-accent" : "text-ink2"}`} aria-hidden />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h3 className="min-w-0 text-[13.5px] font-bold text-ink [overflow-wrap:anywhere]">{eventTitle(event)}</h3>
            <time dateTime={event.occurredAt} title={exactTime(event.occurredAt, timeZone)} className="text-[11.5px] text-ink2 sm:ml-auto">{relativeTime(event.occurredAt, now)}</time>
          </div>
          {subject ? <p className="text-[12.5px] text-ink2 [overflow-wrap:anywhere]">{subject}</p> : null}
          <div className="flex flex-wrap items-center gap-2">
            {emphasis ? <span className="border border-accent/40 px-1.5 py-0.5 text-[10.5px] font-bold text-accent">{emphasis}</span> : null}
            {event.status !== "success" ? <StatusPill tone={STATUS_TONE[event.status]}>{STATUS_LABEL[event.status]}</StatusPill> : null}
          </div>
          {changeHighlights(event, timeZone).filter(h => h !== eventTitle(event)).map(h => <p key={h} className="text-[12px] text-ink2 [overflow-wrap:anywhere]">{h}</p>)}
          <p className="text-[11.5px] leading-relaxed text-ink2 [overflow-wrap:anywhere]">
            {safeText(event.actorLabel)} · {roleLabel(event.actorRole)} · {sourceLabel(event.origin)} · {CATEGORY_LABEL[event.category] ?? humanizeKey(event.category)}
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-0.5">
            <Button icon={ChevronIcon} variant="text" size="sm" aria-expanded={expanded} aria-controls={detailsId} aria-label={`${expanded ? "Hide" : "View"} details: ${eventTitle(event)}`} onClick={() => setExpanded(v => !v)}>
              {expanded ? "Hide details" : "View details"}
            </Button>
            {link ? <ButtonLink href={link.href} variant="text" size="sm">{link.label}</ButtonLink> : null}
          </div>
        </div>
      </div>
    </article>
    <div id={detailsId} hidden={!expanded} className="min-w-0 border-t border-line bg-sand/30 p-3 sm:p-4">
      {expanded ? <EventDetails event={event} organizationId={organizationId} timeZone={timeZone} /> : null}
    </div>
  </li>;
}

function EventDetails({ event, organizationId, timeZone }: { event: TimelineEvent; organizationId: string; timeZone: string }) {
  const { changes, internalOnly } = fieldChanges(event, timeZone);
  const snapshot = event.operation === "INSERT" || event.operation === "DELETE" || (!event.oldValues && event.newValues) ? visibleSnapshot(event, timeZone) : [];
  const subject = eventSubject(event, timeZone);
  const reason = typeof event.detail?.reason === "string" ? event.detail.reason : null;

  return (
    <div className="flex flex-col gap-4 text-[12.5px]">
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill tone={STATUS_TONE[event.status]}>{STATUS_LABEL[event.status]}</StatusPill>
      </div>
      {subject ? <p className="text-[13px] font-bold text-ink">{subject}</p> : null}
      {reason && reason !== "No note" ? (
        <div className="border-[1.5px] border-line bg-sand/50 p-3 text-ink2">
          <span className="text-[10.5px] font-bold text-ink2">Reason given</span>
          <p className="mt-0.5 [overflow-wrap:anywhere]">{safeText(reason)}</p>
        </div>
      ) : null}

      <dl className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
        <Item label="When" value={exactTime(event.occurredAt, timeZone)} />
        <Item label="Performed by" value={safeText(event.actorLabel)} />
        <Item label="Role" value={roleLabel(event.actorRole)} />
        <Item label="Category" value={CATEGORY_LABEL[event.category] ?? humanizeKey(event.category)} />
        <Item label="Source" value={sourceLabel(event.origin)} />
        <Item label="Member or record" value={event.memberName ?? event.recordName ?? "Name not recorded"} />
        {event.amountMinor !== null ? <Item label="Amount" value={formatMinor(event.amountMinor, event.currency ?? "INR")} /> : null}
      </dl>

      {changes.length ? (
        <section className="flex flex-col gap-1.5">
          <h3 className="mfd-micro-label">What changed</h3>
          <div className="divide-y divide-line border-[1.5px] border-line">
            {changes.map((c) => (
              <div key={c.key} className="grid min-w-0 gap-1 px-3 py-2 sm:grid-cols-[120px_1fr_1fr] sm:gap-3">
                <span className="text-[11.5px] font-bold text-ink2">{c.label}</span>
                <span className="min-w-0 text-ink2 [overflow-wrap:anywhere]"><span className="text-[10.5px] font-bold">Before: </span>{c.before}</span>
                <span className="min-w-0 text-ink [overflow-wrap:anywhere]"><span className="text-[10.5px] font-bold">After: </span>{c.after}</span>
              </div>
            ))}
          </div>
        </section>
      ) : internalOnly ? (
        <p className="text-[12px] text-ink2">Only technical fields changed. Safe recorded values are available in Technical details.</p>
      ) : event.operation === "UPDATE" || !event.operation ? <p className="text-[12px] text-ink2">No before-and-after changes were recorded for this event.</p> : null}

      {snapshot.length ? (
        <section className="flex flex-col gap-1.5">
          <h3 className="mfd-micro-label">{event.operation === "DELETE" ? "Values before removal" : "Recorded values"}</h3>
          <div className="divide-y divide-line border-[1.5px] border-line">
            {snapshot.map((s) => (
              <div key={s.label} className="grid min-w-0 gap-1 px-3 py-2 sm:grid-cols-[120px_1fr] sm:gap-2">
                <span className="text-[11.5px] font-bold text-ink2">{s.label}</span>
                <span className="min-w-0 font-bold text-ink [overflow-wrap:anywhere]">{s.value}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <details className="border-[1.5px] border-line">
        <summary className="flex cursor-pointer items-center gap-1.5 border border-transparent px-3 py-2 text-[11.5px] font-bold text-ink2 focus:border-accent focus:outline-none"><ChevronIcon size={14} aria-hidden />Technical details</summary>
        <div className="flex flex-col gap-2 border-t border-line bg-sand/40 p-3">
          <TechRow label="Event" value={event.eventId} />
          <TechRow label="Action key" value={event.actionKey} />
          <TechRow label="Entity" value={`${event.entityType ?? "Not set"}${event.operation ? ` · ${event.operation}` : ""}`} />
          <TechRow label="Organization ID" value={organizationId} />
          {event.entityId ? <TechRow label="Record ID" value={event.entityId} /> : null}
          {event.actorId ? <TechRow label="Actor ID" value={event.actorId} /> : null}
          {event.requestId ? <TechRow label="Request ID" value={event.requestId} /> : null}
          {event.ipAddress ? <TechRow label="IP address" value={event.ipAddress} /> : null}
          {event.detail ? <TechBlock label="Detail" value={event.detail} /> : null}
          {event.oldValues ? <TechBlock label="Previous values (sensitive values hidden)" value={event.oldValues} /> : null}
          {event.newValues ? <TechBlock label="New values (sensitive values hidden)" value={event.newValues} /> : null}
        </div>
      </details>
    </div>
  );
}

function visibleSnapshot(event: TimelineEvent, timeZone: string): { label: string; value: string }[] {
  const values = event.operation === "DELETE" ? event.oldValues ?? {} : event.newValues ?? {};
  const keys = ["status", "amount_minor", "agreed_price_minor", "plan_name_snapshot", "method", "start_date", "end_date", "first_name", "last_name", "name", "invoice_number"];
  return keys
    .filter((k) => k in values)
    .map((k) => {
      const change = fieldChanges({ ...event, changedFields: [k], oldValues: {}, newValues: values }, timeZone).changes[0];
      return { label: change?.label ?? humanizeKey(k), value: change?.after ?? String(values[k]) };
    });
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10.5px] font-bold text-ink2">{label}</dt>
      <dd className="font-bold text-ink [overflow-wrap:anywhere]">{safeText(value)}</dd>
    </div>
  );
}

function TechRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap gap-2 text-[11px]">
      <span className="font-bold text-mute">{label}:</span>
      <span className="break-all font-mono text-ink2">{safeText(value)}</span>
    </div>
  );
}

function TechBlock({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10.5px] font-bold text-mute">{label}</span>
      <pre className="max-h-56 min-w-0 overflow-auto whitespace-pre-wrap break-all bg-paper p-2 font-mono text-[11px] text-ink2">{JSON.stringify(sanitizeAuditValue(value), null, 2)}</pre>
    </div>
  );
}

/** Downloads the currently-filtered timeline as CSV (server-side, capped at
 * 10,000 rows, and logged in the audit log). */
export function ExportActivityButton({
  organizationId,
  filters,
}: {
  organizationId: string;
  filters: Record<string, string | undefined>;
}) {
  const toast = useToast();
  const confirm = useActionConfirmation();
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const response = await fetch(`/admin/gyms/${organizationId}/activity/export`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(filters),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        toast.error(body?.error ?? "The export failed.");
        return;
      }
      const truncated = response.headers.get("x-export-truncated") === "true";
      const url = URL.createObjectURL(await response.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `activity-${istDateKey()}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(truncated ? "Exported the first 10,000 matching events — narrow the filters for the rest." : "Activity exported.");
    } catch {
      toast.error("The activity export is unavailable. Retry.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button icon={ExportIcon}
      type="button"
      onClick={() => void confirm({ title: "Are you sure?", description: "Export the filtered activity log as CSV? This download is recorded in the audit log.", confirmLabel: "Export CSV" }, run)}
      disabled={busy}
      pending={busy}
      variant="secondary" size="sm"
    >
      {busy ? "Exporting…" : "Export CSV"}
    </Button>
  );
}
