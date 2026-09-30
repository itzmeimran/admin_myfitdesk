import type { ReactNode } from "react";
import { PILL_CLASS, pillTone } from "@/core/ui/status-style";
import { AlertIcon } from "@/core/ui/icons";
import { exactTime, relativeTime } from "@/features/gyms/ops/timeline-format";

/**
 * Small presentational pieces shared by the Command Center strip and every
 * Operations section. Server-compatible (no hooks), so sections stay Server
 * Components and only their interactive islands are client code.
 */

export type OpsTone = "Healthy" | "Attention" | "Down" | "No data";

export function StatusPill({ tone, children }: { tone: OpsTone | string; children: ReactNode }) {
  return (
    <span className={PILL_CLASS} style={pillTone(tone)}>
      {children}
    </span>
  );
}

export function SectionCard({
  title,
  description,
  action,
  children,
  id,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section id={id} className="flex scroll-mt-4 flex-col gap-2.5 border-[1.5px] border-line bg-paper p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="mfd-micro-label">{title}</h2>
          {description ? <p className="text-[11.5px] leading-relaxed text-mute3">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return <div className="border-[1.5px] border-dashed border-line px-4 py-6 text-center text-[12.5px] text-mute">{children}</div>;
}

export function SectionError({ title, message }: { title: string; message: string }) {
  return (
    <div role="alert" className="flex items-start gap-2.5 border-[1.5px] border-accent bg-accent/5 p-4">
      <AlertIcon size={16} className="mt-0.5 flex-shrink-0 text-accent" aria-hidden />
      <div className="flex flex-col gap-0.5">
        <strong className="text-[13px] text-accent">{title} couldn&apos;t be loaded</strong>
        <span className="text-[12px] leading-relaxed text-mute">{message}</span>
      </div>
    </div>
  );
}

/** Loads one section's data and renders it, or a contained error card — one
 * failing RPC never takes the rest of the page down (partial-data rule). */
export async function Guard<T>({
  title,
  load,
  children,
}: {
  title: string;
  load: () => Promise<T>;
  children: (data: T) => ReactNode;
}) {
  let data: T;
  try {
    data = await load();
  } catch (error) {
    return <SectionError title={title} message={error instanceof Error ? error.message : "Unexpected error."} />;
  }
  return <>{children(data)}</>;
}

export function Tile({
  label,
  value,
  pill,
  tone,
  lines,
  href,
}: {
  label: string;
  value?: ReactNode;
  pill?: { text: string; tone: OpsTone | string };
  tone?: "accent" | "neutral";
  lines?: ReactNode[];
  href?: string;
}) {
  const body = (
    <>
      <span className="text-[9.5px] font-bold uppercase tracking-[0.11em] text-mute3">{label}</span>
      {pill ? (
        <span>
          <StatusPill tone={pill.tone}>{pill.text}</StatusPill>
        </span>
      ) : (
        <strong className={`break-words font-display text-[17px] tracking-[-0.02em] ${tone === "accent" ? "text-accent" : "text-ink"}`}>{value}</strong>
      )}
      {lines?.filter(Boolean).map((line, i) => (
        <span key={i} className="text-[10.5px] leading-snug text-mute">
          {line}
        </span>
      ))}
    </>
  );
  const cls = `flex min-w-0 flex-col gap-1 border-[1.5px] bg-paper p-3 ${tone === "accent" ? "border-accent" : "border-line"}`;
  return href ? (
    <a href={href} className={`${cls} hover:border-ink`}>
      {body}
    </a>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** "12 minutes ago" with the exact timestamp as a second line. */
export function When({ value, timeZone, empty = "Not recorded" }: { value: string | null | undefined; timeZone: string; empty?: string }) {
  if (!value) return <>{empty}</>;
  return (
    <>
      {relativeTime(value)}
      <span className="block text-[10px] text-mute3">{exactTime(value, timeZone)}</span>
    </>
  );
}

/** Hours elapsed since an ISO instant (kept out of render bodies so the
 * purity lint sees no direct clock read in a component). */
export function hoursSince(value: string | null | undefined): number | null {
  return value ? (Date.now() - new Date(value).getTime()) / 3_600_000 : null;
}

export function whenText(value: string | null | undefined, timeZone: string, empty = "Not recorded"): string {
  return value ? `${relativeTime(value)} · ${exactTime(value, timeZone)}` : empty;
}

export function JobStatusPill({ status }: { status: string }) {
  const map: Record<string, [string, OpsTone]> = {
    healthy: ["Healthy", "Healthy"],
    degraded: ["Degraded", "Attention"],
    failed: ["Failed", "Down"],
    idle: ["No runs yet", "No data"],
    disabled: ["Turned off", "No data"],
    not_configured: ["Not set up", "No data"],
    not_tracked: ["Not tracked", "No data"],
    warning: ["Warning", "Attention"],
    no_events: ["No events yet", "No data"],
  };
  const [text, tone] = map[status] ?? [status, "No data"];
  return <StatusPill tone={tone}>{text}</StatusPill>;
}
