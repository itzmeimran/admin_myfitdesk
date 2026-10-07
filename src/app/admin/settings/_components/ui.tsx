import { ButtonLink } from "@/components/ButtonLink";

import { pillTone, PILL_CLASS } from "@/core/ui/status-style";
import { AlertIcon } from "@/core/ui/icons";
import { formatZonedDateTime } from "@/core/dates/format";

/**
 * Small presentational pieces shared by every Settings tab. Pure (no hooks, no
 * "use client"), so Server Components and Client Components can both use them.
 * They reuse the admin design tokens and the same card / label / input
 * treatment as the rest of the dashboard.
 */

export const INPUT_CLASS =
  "w-full border-[1.5px] border-line bg-paper px-2.5 py-2 text-[13px] text-ink outline-none transition-colors hover:border-ink/50 focus:border-ink disabled:cursor-not-allowed disabled:bg-sand/60 disabled:text-mute";
export const LABEL_CLASS = "text-[9px] font-bold uppercase tracking-[0.12em] text-mute";
export const HINT_CLASS = "text-[10.5px] leading-relaxed text-mute3";

export function SettingsCard({
  title,
  description,
  children,
  footer,
  tone = "default",
  actions,
}: {
  title: string;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  tone?: "default" | "danger";
  actions?: React.ReactNode;
}) {
  return (
    <section
      className={`flex flex-col gap-4 border-[1.5px] bg-paper p-4 md:p-5 ${tone === "danger" ? "border-accent" : "border-line"}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className={`font-display text-[15.5px] tracking-[-0.015em] ${tone === "danger" ? "text-accent" : "text-ink"}`}>
            {title}
          </h2>
          {description ? <p className="max-w-2xl text-[12.5px] leading-relaxed text-mute">{description}</p> : null}
        </div>
        {actions}
      </header>
      {children}
      {footer ? <footer className="flex flex-wrap items-center gap-3 border-t border-line pt-3.5">{footer}</footer> : null}
    </section>
  );
}

export function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className={LABEL_CLASS}>
        {label}
        {required ? <span className="text-accent"> *</span> : null}
      </span>
      {children}
      {hint ? <span className={HINT_CLASS}>{hint}</span> : null}
    </label>
  );
}

/** `tone` picks the colour from the shared pill map when the text to show isn't
 * itself a key in it (e.g. label "Production", tone "Attention"). */
export function StatusPill({ label, tone }: { label: string; tone?: string }) {
  return (
    <span className={PILL_CLASS} style={pillTone(tone ?? label)}>
      {label}
    </span>
  );
}

export function StatTile({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: "default" | "attention";
}) {
  return (
    <div className={`flex flex-col gap-1.5 border-[1.5px] bg-paper p-3.5 ${tone === "attention" ? "border-accent" : "border-line"}`}>
      <span className={LABEL_CLASS}>{label}</span>
      <span className={`font-display text-[24px] leading-none tracking-[-0.02em] ${tone === "attention" ? "text-accent" : "text-ink"}`}>
        {value}
      </span>
      {hint ? <span className={HINT_CLASS}>{hint}</span> : null}
    </div>
  );
}

/** An inline error for ONE section that could not load. */
export function SectionError({ message, notInstalled }: { message: string; notInstalled?: boolean }) {
  return (
    <div role="alert" className="flex items-start gap-3 border-[1.5px] border-accent bg-accent/8 p-4">
      <AlertIcon size={17} className="mt-0.5 flex-shrink-0 text-accent" aria-hidden />
      <div className="flex flex-col gap-1">
        <p className="text-[13px] font-bold text-accent">
          {notInstalled ? "Not set up on this environment yet" : "Couldn't load this section"}
        </p>
        <p className="text-[12.5px] leading-relaxed text-mute">{message}</p>
      </div>
    </div>
  );
}

export function Notice({
  children,
  tone = "info",
}: {
  children: React.ReactNode;
  tone?: "info" | "warning";
}) {
  return (
    <p
      className={`border-[1.5px] px-3 py-2.5 text-[12px] leading-relaxed ${
        tone === "warning" ? "border-accent bg-accent/8 text-accent" : "border-line bg-sand text-mute"
      }`}
    >
      {children}
    </p>
  );
}

/** "Last updated 30 Sep 2026, 10:54 pm by someone@…" — or "Using built-in defaults". */
export function Provenance({ at, by }: { at: string | null; by: string | null }) {
  if (!at) return <span className={HINT_CLASS}>Never saved — showing the built-in defaults.</span>;
  return (
    <span className={HINT_CLASS} title={at}>
      Last updated {formatZonedDateTime(at, "Asia/Kolkata")} IST{by ? ` by ${by}` : ""}
    </span>
  );
}

export function TextLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <ButtonLink variant="text" href={href} className="font-bold text-ink underline underline-offset-2 hover:text-accent">
      {children}
    </ButtonLink>
  );
}

/** Exact instant in IST, for tables and the admin drawer. */
export function formatWhen(value: string | null | undefined): string {
  if (!value) return "—";
  return `${formatZonedDateTime(value, "Asia/Kolkata")} IST`;
}

export function timeAgo(value: string | null | undefined, now: number = Date.now()): string {
  if (!value) return "Never";
  const diff = now - new Date(value).getTime();
  if (Number.isNaN(diff)) return "—";
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return `${days} d ago`;
}
