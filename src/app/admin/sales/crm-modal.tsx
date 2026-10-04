"use client";

import { useEffect, useId } from "react";
import { Button } from "@/components/Button";
import { Dropdown } from "@/components/Dropdown";
import { useSalesCrm } from "@/features/sales/use-sales-crm";
import { LuX } from "react-icons/lu";

/**
 * Modal frame + form fields for every Sales CRM flow. A bottom sheet on phones,
 * a centred 540px dialog from `md`. Each flow (activity, demo, reassign …) owns
 * its own draft state and calls a store command on submit — see modals-*.tsx.
 */

export function ModalFrame({
  title, sub, onClose, children, footer = true, primaryLabel = "Save", onPrimary, secondaryLabel, onSecondary, note,
}: {
  title: string;
  sub?: string;
  onClose: () => void;
  children: React.ReactNode;
  /** `false` hides the Cancel / primary bar (pick-list modals). */
  footer?: boolean;
  primaryLabel?: string;
  onPrimary?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  note?: string;
}) {
  const titleId = useId();
  const crm=useSalesCrm();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 md:items-center md:p-6">
      <Button type="button" variant="overlay" size="custom" aria-label="Dismiss" onClick={onClose} className="fade-in absolute inset-0 cursor-default bg-transparent" />
      <div role="dialog" aria-modal="true" aria-labelledby={titleId}
        className="sheet-slide-up relative flex max-h-[90%] w-full flex-col border-[1.5px] border-ink bg-paper md:max-h-[86%] md:max-w-[540px]">
        <div className="flex flex-shrink-0 items-start gap-2.5 border-b border-line px-[18px] pb-3 pt-4">
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <h2 id={titleId} className="font-display text-[18px] tracking-[-0.015em]">{title}</h2>
            {sub ? <span className="text-[12.5px] text-mute">{sub}</span> : null}
          </span>
          <Button type="button" variant="ghost" size="md" iconOnly aria-label="Close" onClick={onClose} className="-mr-2.5 -mt-2">
            <LuX size={18} aria-hidden />
          </Button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-[18px] py-4">
          {children}
          {crm.mutationError ? <p role="alert" className="text-accent">{crm.mutationError}</p> : null}
          {note ? <p className="text-[12.5px] leading-relaxed text-mute">{note}</p> : null}
        </div>
        {footer ? (
          <div className="flex flex-shrink-0 flex-col-reverse gap-2 border-t-[1.5px] border-ink bg-sand px-[18px] py-3 md:flex-row">
            {secondaryLabel ? <Button type="button" variant="secondary" size="lg" onClick={onSecondary} className="md:mr-auto">{secondaryLabel}</Button> : null}
            <Button type="button" variant="secondary" size="lg" onClick={onClose}>Cancel</Button>
            <Button type="button" variant="primary" size="lg" disabled={crm.busy} onClick={onPrimary}>{crm.busy ? "Saving…" : primaryLabel}</Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ── Fields ───────────────────────────────────────────────────────────────────

export function Field({ label, error, help, children }: { label?: string; error?: string; help?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-[7px]">
      {label ? <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-mute">{label}</span> : null}
      {children}
      {error ? <span role="alert" className="text-[12.5px] font-medium text-accent">{error}</span> : null}
      {help ? <span className="text-[12px] text-mute2">{help}</span> : null}
    </div>
  );
}

export function InfoField({ label, value, info }: { label?: string; value: string; info?: string }) {
  return (
    <Field label={label}>
      <div className="flex flex-col gap-0.5 border-[1.5px] border-line bg-sand px-3 py-2.5">
        <span className="text-[14px] font-bold">{value}</span>
        {info ? <span className="text-[12px] text-mute">{info}</span> : null}
      </div>
    </Field>
  );
}

export function SelectField({ label, value, options, onChange, help }: {
  label: string; value: string; options: (string | { value: string; label: string })[]; onChange: (v: string) => void; help?: string;
}) {
  return (
    <Field label={label} help={help}>
      <Dropdown ariaLabel={label} value={value} onChange={onChange} className="min-h-[46px]"
        options={options.map((o) => (typeof o === "string" ? { value: o, label: o } : o))} />
    </Field>
  );
}

const INPUT = "border-[1.5px] bg-paper px-3 text-[16px] text-ink outline-none placeholder:text-[#a99d91] focus:border-ink md:text-[15px]";

export function TextField({ label, value, onChange, placeholder, error, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; error?: string; type?: "text" | "email" | "search";
}) {
  return (
    <Field label={label} error={error}>
      <input type={type} aria-label={label} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)}
        className={`min-h-[46px] ${INPUT} ${error ? "border-accent" : "border-line"}`} />
    </Field>
  );
}

export function AreaField({ label, value, onChange, placeholder, error }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; error?: string;
}) {
  return (
    <Field label={label} error={error}>
      <textarea aria-label={label} rows={3} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)}
        className={`resize-y py-2.5 leading-normal ${INPUT} ${error ? "border-accent" : "border-line"}`} />
    </Field>
  );
}

/** Vertical radio cards with a title, optional sub-line and optional tag. */
export function RadioCards<T extends string>({ label, value, onChange, options, error }: {
  label?: string; value: T; onChange: (v: T) => void; error?: string;
  options: { value: T; label: string; sub?: string; tag?: string }[];
}) {
  return (
    <Field label={label} error={error}>
      <div role="radiogroup" aria-label={label ?? "Options"} className="flex flex-col gap-1.5">
        {options.map((o) => {
          const on = o.value === value;
          return (
            <Button key={o.value} type="button" role="radio" aria-checked={on} variant="surface" onClick={() => onChange(o.value)}
              className={`min-h-[46px] items-start gap-3 border-[1.5px] px-3 py-[11px] text-left ${on ? "border-ink bg-sand" : "border-line bg-paper hover:border-ink"} text-ink`}>
              <span aria-hidden className="mt-px flex h-4 w-4 flex-shrink-0 items-center justify-center border-[1.5px] border-ink">
                <span className={`h-2 w-2 ${on ? "bg-ink" : "bg-transparent"}`} />
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-[13.5px] font-bold">{o.label}</span>
                {o.sub ? <span className="text-[12px] font-normal text-mute">{o.sub}</span> : null}
              </span>
              {o.tag ? <span className="ml-auto flex-shrink-0 border-[1.5px] border-ink px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.08em]">{o.tag}</span> : null}
            </Button>
          );
        })}
      </div>
    </Field>
  );
}
