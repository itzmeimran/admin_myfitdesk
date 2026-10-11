import type { ReactNode } from "react";
import { ButtonLink } from "@/components/ButtonLink";
import { PendingLink } from "@/components/NavigationPending";
import { AlertIcon, ConfirmIcon } from "@/core/ui/icons";
import { PILL_CLASS, pillTone } from "@/core/ui/status-style";
import type { AttentionItem } from "@/features/gyms/overview-rules";

/** Compact section wrapper for the Overview: a heading, an optional link, content. */
export function Panel({
  title,
  note,
  action,
  id,
  children,
}: {
  title: string;
  note?: string;
  action?: { label: string; href: string };
  id?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="flex min-w-0 scroll-mt-16 flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2.5">
          <h2 className="mfd-micro-label">{title}</h2>
          {note ? <p className="text-[11.5px] text-mute">{note}</p> : null}
        </div>
        {action ? <TextLink href={action.href}>{action.label}</TextLink> : null}
      </div>
      {children}
    </section>
  );
}

export function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <ButtonLink variant="text" href={href} className="w-fit text-[11.5px] font-bold normal-case tracking-normal text-accent underline-offset-2 hover:underline">
      {children} →
    </ButtonLink>
  );
}

/** Unavailable-data state for one block; the rest of the page keeps working. */
export function Unavailable({ what, reason }: { what: string; reason?: string | null }) {
  return (
    <div role="status" className="flex items-start gap-2 border-[1.5px] border-dashed border-line bg-paper px-3 py-2.5 text-[12px] text-ink2">
      <AlertIcon size={14} className="mt-0.5 flex-shrink-0 text-mute" aria-hidden />
      <span>
        <strong className="font-bold">{what} couldn&apos;t be loaded.</strong>
        {reason ? <span className="text-mute"> {reason}</span> : null}
      </span>
    </div>
  );
}

export function NeedsAttention({ items, partial, checkedAt }: { items: AttentionItem[]; partial: string[]; checkedAt: string }) {
  return (
    <section id="attention" aria-labelledby="attention-title" className="flex scroll-mt-16 flex-col gap-2">
      {items.length ? (
        <>
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="attention-title" className="mfd-micro-label text-accent">
              Needs attention · {items.length}
            </h2>
            <span className="text-[11px] text-mute">Checked {checkedAt}</span>
          </div>
          <ul className="flex flex-col gap-1.5">
            {items.map((item) => (
              <li
                key={item.id}
                className={`flex flex-wrap items-center gap-x-3 gap-y-2 border-[1.5px] border-l-[4px] bg-paper px-3 py-2.5 ${
                  item.severity === "critical" ? "border-accent" : "border-hi"
                }`}
              >
                <AlertIcon size={15} className={`flex-shrink-0 ${item.severity === "critical" ? "text-accent" : "text-on-hi"}`} aria-hidden />
                <div className="flex min-w-0 flex-1 basis-60 flex-col gap-0.5">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <strong className="text-[13px] leading-snug text-ink">{item.title}</strong>
                    <span className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-mute">
                      {item.severity === "critical" ? "Critical" : "Warning"}
                    </span>
                  </div>
                  <p className="text-[12px] leading-snug text-ink2">{item.detail}</p>
                </div>
                <ButtonLink href={item.action.href} variant="secondary" size="sm" className="flex-shrink-0">
                  {item.action.label}
                </ButtonLink>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 border-[1.5px] border-line bg-paper px-3 py-2 text-[12.5px]">
          <ConfirmIcon size={14} className="flex-shrink-0 text-ink" aria-hidden />
          <strong className="text-ink">Nothing needs attention</strong>
          <span className="text-mute">Checked {checkedAt}</span>
        </div>
      )}
      {partial.length ? (
        <p role="status" className="text-[11.5px] text-ink2">
          Not checked: {partial.join(", ")}. These could not be loaded, so their issues may be missing.
        </p>
      ) : null}
    </section>
  );
}

export type Chip = { text: string; tone: string };

/** One of the four summary cards: a label, one main value, brief context, one link. */
export function SummaryCard({
  label,
  value,
  chip,
  lines,
  link,
  emphasis,
}: {
  label: string;
  value: ReactNode;
  chip?: Chip;
  lines: Array<ReactNode | null | undefined | false>;
  link?: { label: string; href: string };
  emphasis?: boolean;
}) {
  return (
    <div className={`flex min-w-0 flex-col gap-1.5 border-[1.5px] bg-paper p-3 ${emphasis ? "border-accent" : "border-line"}`}>
      <div className="flex items-start justify-between gap-2">
        <span className="mfd-micro-label">{label}</span>
        {chip ? (
          <span className={`${PILL_CLASS} flex-shrink-0`} style={pillTone(chip.tone)}>
            {chip.text}
          </span>
        ) : null}
      </div>
      <strong className="break-words font-display text-[20px] leading-tight tracking-[-0.02em] text-ink">{value}</strong>
      <div className="flex flex-col gap-0.5">
        {lines.filter(Boolean).map((line, index) => (
          <span key={index} className="text-[12px] leading-snug text-ink2">
            {line}
          </span>
        ))}
      </div>
      {link ? (
        <div className="mt-auto pt-0.5">
          <TextLink href={link.href}>{link.label}</TextLink>
        </div>
      ) : null}
    </div>
  );
}

export function Stat({ label, value, href, note }: { label: string; value: string; href?: string; note?: string }) {
  const body = (
    <>
      <span className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-mute">{label}</span>
      <strong className="font-display text-[18px] leading-none tracking-[-0.02em] text-ink">{value}</strong>
      {note ? <span className="text-[11px] leading-snug text-mute">{note}</span> : null}
    </>
  );
  const cls = "flex min-w-0 flex-col gap-1 border-l-[1.5px] border-line px-3 py-1 first:border-l-0 first:pl-0";
  return href ? (
    <PendingLink href={href} className={`${cls} hover:text-accent`}>
      {body}
    </PendingLink>
  ) : (
    <div className={cls}>{body}</div>
  );
}
