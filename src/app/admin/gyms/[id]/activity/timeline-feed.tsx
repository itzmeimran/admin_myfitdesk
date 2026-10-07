"use client";

import { Button } from "@/components/Button";
import { DetailsIcon } from '@/core/ui/icons';
import { istDateKey } from "@/core/dates/ist";
import { useState } from "react";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { formatMinor } from "@/core/money/format";
import type { TimelineEvent } from "@/features/gyms/ops/types";
import {
  CATEGORY_LABEL,
  STATUS_LABEL,
  changeHighlights,
  eventSubject,
  eventTitle,
  exactTime,
  fieldChanges,
  humanizeKey,
  relativeTime,
  roleLabel,
  sourceLabel,
} from "@/features/gyms/ops/timeline-format";
import { StatusPill } from "../ops-ui";
import { ExportIcon } from "@/core/ui/icons";

const STATUS_TONE = { success: "Healthy", warning: "Attention", failed: "Down" } as const;
const STATUS_BORDER = { success: "border-l-line", warning: "border-l-hi", failed: "border-l-accent" } as const;

/**
 * The feed. Cards show the human summary; clicking one opens a right-hand
 * drawer (a bottom sheet on phones) with before → after values and, tucked
 * behind "Technical details", the raw record. Table and column names never
 * appear in the feed itself.
 */
export function TimelineFeed({
  events,
  organizationId,
  timeZone,
}: {
  events: TimelineEvent[];
  organizationId: string;
  timeZone: string;
}) {
  const [selected, setSelected] = useState<TimelineEvent | null>(null);
  return (
    <>
      <div className="flex flex-col gap-2">
        {events.map((e) => {
          const subject = eventSubject(e, timeZone);
          const highlights = changeHighlights(e, timeZone);
          return (
            <Button
              key={e.eventId}
              type="button"
              onClick={() => setSelected(e)}
              variant="secondary" layout="content" size="custom" className={`flex w-full flex-col gap-1 border-[1.5px] border-l-[5px] border-line bg-paper p-3.5 text-left hover:border-ink ${STATUS_BORDER[e.status]} `}
            >
              <span className="flex flex-wrap items-center gap-2">
                <DetailsIcon size={15} className="flex-shrink-0 text-mute" aria-hidden />
                <strong className="text-[13.5px] text-ink">{eventTitle(e)}</strong>
                {e.status !== "success" ? <StatusPill tone={STATUS_TONE[e.status]}>{STATUS_LABEL[e.status]}</StatusPill> : null}
                <span className="ml-auto text-[11px] text-mute3">{relativeTime(e.occurredAt)}</span>
              </span>
              {subject ? <span className="text-[12.5px] text-ink2">{subject}</span> : null}
              {highlights.map((h) => (
                <span key={h} className="text-[12px] font-bold text-ink">{h}</span>
              ))}
              <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-mute">
                <span>
                  {e.actorType === "system"
                    ? e.actorLabel === roleLabel(e.actorRole)
                      ? e.actorLabel
                      : `${e.actorLabel} · ${roleLabel(e.actorRole)}`
                    : `Changed by ${e.actorLabel} · ${roleLabel(e.actorRole)}`}
                </span>
                <span aria-hidden>·</span>
                <span>{exactTime(e.occurredAt, timeZone)}</span>
                <span aria-hidden>·</span>
                <span>{CATEGORY_LABEL[e.category] ?? humanizeKey(e.category)}</span>
                <span aria-hidden>·</span>
                <span>{e.origin}</span>
              </span>
            </Button>
          );
        })}
      </div>

      <Sheet
        open={selected !== null}
        onClose={() => setSelected(null)}
        eyebrow="Activity details"
        title={selected ? eventTitle(selected) : ""}
        maxWidthClassName="md:max-w-xl"
      >
        {selected ? <EventDetails event={selected} organizationId={organizationId} timeZone={timeZone} /> : null}
      </Sheet>
    </>
  );
}

function EventDetails({ event, organizationId, timeZone }: { event: TimelineEvent; organizationId: string; timeZone: string }) {
  const { changes, internalOnly } = fieldChanges(event, timeZone);
  const isInsert = event.operation === "INSERT";
  const snapshot = isInsert ? visibleSnapshot(event, timeZone) : [];
  const subject = eventSubject(event, timeZone);
  const reason = typeof event.detail?.reason === "string" ? event.detail.reason : null;

  return (
    <div className="flex flex-col gap-4 text-[12.5px]">
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill tone={STATUS_TONE[event.status]}>{STATUS_LABEL[event.status]}</StatusPill>
        <span className="text-mute">{relativeTime(event.occurredAt)}</span>
      </div>
      {subject ? <p className="text-[13px] font-bold text-ink">{subject}</p> : null}
      {reason && reason !== "No note" ? (
        <div className="border-[1.5px] border-line bg-sand/50 p-3 text-ink2">
          <span className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-mute3">Reason given</span>
          <p className="mt-0.5">{reason}</p>
        </div>
      ) : null}

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
        <Item label="When" value={exactTime(event.occurredAt, timeZone)} />
        <Item label="Performed by" value={event.actorLabel} />
        <Item label="Role" value={roleLabel(event.actorRole)} />
        <Item label="Category" value={CATEGORY_LABEL[event.category] ?? humanizeKey(event.category)} />
        <Item label="Source" value={sourceLabel(event.origin)} />
        <Item label="Affected member" value={event.memberName ?? "—"} />
        {event.amountMinor !== null ? <Item label="Amount" value={formatMinor(event.amountMinor, event.currency ?? "INR")} /> : null}
        <Item label="Organization ID" value={organizationId} mono />
        {event.entityId ? <Item label="Record ID" value={event.entityId} mono /> : null}
        {event.requestId ? <Item label="Request ID" value={event.requestId} mono /> : null}
        {event.ipAddress ? <Item label="IP address" value={event.ipAddress} mono /> : null}
      </dl>

      {changes.length ? (
        <section className="flex flex-col gap-1.5">
          <h3 className="mfd-micro-label">What changed</h3>
          <div className="divide-y divide-line border-[1.5px] border-line">
            {changes.map((c) => (
              <div key={c.key} className="grid grid-cols-[110px_1fr] items-start gap-2 px-3 py-2">
                <span className="text-[11px] font-bold text-mute">{c.label}</span>
                <span className="break-words">
                  <span className="text-mute line-through decoration-mute3">{c.before}</span>
                  <span className="mx-1.5 text-mute3">→</span>
                  <strong className="text-ink">{c.after}</strong>
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : internalOnly ? (
        <p className="text-[12px] text-mute">Only internal bookkeeping fields changed — nothing an admin would recognise.</p>
      ) : null}

      {snapshot.length ? (
        <section className="flex flex-col gap-1.5">
          <h3 className="mfd-micro-label">Recorded values</h3>
          <div className="divide-y divide-line border-[1.5px] border-line">
            {snapshot.map((s) => (
              <div key={s.label} className="grid grid-cols-[110px_1fr] gap-2 px-3 py-2">
                <span className="text-[11px] font-bold text-mute">{s.label}</span>
                <span className="break-words font-bold text-ink">{s.value}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <details className="border-[1.5px] border-line">
        <summary className="cursor-pointer px-3 py-2 text-[10.5px] font-bold uppercase tracking-[0.09em] text-mute">Technical details</summary>
        <div className="flex flex-col gap-2 border-t border-line bg-sand/40 p-3">
          <TechRow label="Event" value={event.eventId} />
          <TechRow label="Action key" value={event.actionKey} />
          <TechRow label="Entity" value={`${event.entityType ?? "—"}${event.operation ? ` · ${event.operation}` : ""}`} />
          {event.detail ? <TechBlock label="Detail" value={event.detail} /> : null}
          {event.oldValues ? <TechBlock label="Previous values (raw)" value={event.oldValues} /> : null}
          {event.newValues ? <TechBlock label="New values (raw)" value={event.newValues} /> : null}
        </div>
      </details>
    </div>
  );
}

function visibleSnapshot(event: TimelineEvent, timeZone: string): { label: string; value: string }[] {
  const values = event.newValues ?? {};
  const keys = ["status", "amount_minor", "agreed_price_minor", "plan_name_snapshot", "method", "start_date", "end_date", "first_name", "last_name", "name", "invoice_number"];
  return keys
    .filter((k) => values[k] !== undefined && values[k] !== null && values[k] !== "")
    .slice(0, 8)
    .map((k) => {
      const change = fieldChanges({ ...event, changedFields: [k], oldValues: {}, newValues: values }, timeZone).changes[0];
      return { label: change?.label ?? humanizeKey(k), value: change?.after ?? String(values[k]) };
    });
}

function Item({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-mute3">{label}</dt>
      <dd className={`break-words text-ink ${mono ? "font-mono text-[11px]" : "font-bold"}`}>{value}</dd>
    </div>
  );
}

function TechRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap gap-2 text-[11px]">
      <span className="font-bold text-mute">{label}:</span>
      <span className="break-all font-mono text-ink2">{value}</span>
    </div>
  );
}

function TechBlock({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10.5px] font-bold text-mute">{label}</span>
      <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-all bg-paper p-2 font-mono text-[10.5px] text-ink2">{JSON.stringify(value, null, 2)}</pre>
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
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button icon={ExportIcon}
      type="button"
      onClick={run}
      disabled={busy}
      variant="secondary" size="sm"
    >
      {busy ? "Exporting…" : "Export CSV"}
    </Button>
  );
}
