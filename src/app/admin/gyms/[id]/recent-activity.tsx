import type { TimelineEvent } from "@/features/gyms/ops/types";
import { eventSubject, eventTitle, exactTime, relativeTime, roleLabel, sourceLabel, STATUS_LABEL, safeText } from "@/features/gyms/ops/timeline-format";
import { sharedGroupKey } from "@/features/gyms/overview-rules";
import { AlertIcon, DetailsIcon } from "@/core/ui/icons";

/**
 * Up to five events from the same timeline the Activity tab reads, in the same
 * words. Related changes are already combined by the database on a shared
 * member id (never by timestamp); the raw record stays one click away in
 * "Technical details", and the Activity tab holds everything.
 */
export function RecentActivity({ events, timeZone, now }: { events: TimelineEvent[]; timeZone: string; now: Date }) {
  if (!events.length) {
    return <div className="border-[1.5px] border-line bg-paper px-3 py-4 text-[12.5px] text-mute">No activity has been recorded for this gym yet.</div>;
  }
  return (
    <ol aria-label="Recent activity" className="divide-y divide-line border-[1.5px] border-line bg-paper">
      {events.map((event) => {
        const subject = eventSubject(event, timeZone);
        const related = sharedGroupKey(event) ? (event.groupCount ?? 1) : 1;
        const bad = event.status !== "success";
        return (
          <li key={event.eventId} className="flex flex-col gap-1 px-3 py-2.5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <span className="flex min-w-0 items-center gap-1.5 text-[13px] font-bold text-ink">
                {bad ? <AlertIcon size={13} className="flex-shrink-0 text-accent" aria-hidden /> : null}
                {eventTitle(event)}
                {bad ? <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-accent">{STATUS_LABEL[event.status]}</span> : null}
              </span>
              <time dateTime={event.occurredAt} title={exactTime(event.occurredAt, timeZone)} className="text-[11.5px] text-mute">
                {relativeTime(event.occurredAt, now)}
              </time>
            </div>
            <p className="text-[12px] leading-snug text-ink2">
              {subject ? <span>{subject} · </span> : null}
              <span>by {safeText(event.actorLabel)}</span>
              {event.actorRole && event.actorRole !== "unknown" ? <span className="text-mute"> ({roleLabel(event.actorRole)})</span> : null}
              {related > 1 ? <span className="text-mute"> · {related} related changes</span> : null}
            </p>
            <details className="group">
              <summary className="flex w-fit cursor-pointer list-none items-center gap-1 text-[11px] font-bold text-mute hover:text-ink">
                <DetailsIcon size={12} aria-hidden />
                Technical details
              </summary>
              <dl className="mt-1.5 grid grid-cols-1 gap-x-4 gap-y-1 bg-sand/50 px-2.5 py-2 text-[11px] sm:grid-cols-2">
                <Detail label="Event" value={event.actionKey} />
                <Detail label="Source" value={sourceLabel(event.origin)} />
                <Detail label="Record type" value={event.entityType ?? "—"} />
                <Detail label="Exact time" value={exactTime(event.occurredAt, timeZone)} />
                <Detail label="Event ID" value={event.eventId} />
                <Detail label="Request ID" value={event.requestId ?? "—"} />
              </dl>
            </details>
          </li>
        );
      })}
    </ol>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-mute">{label}</dt>
      <dd className="break-all font-mono text-ink2">{safeText(value)}</dd>
    </div>
  );
}
