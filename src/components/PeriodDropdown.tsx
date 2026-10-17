"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/Button";
import { DatePicker, type DateRange } from "@/components/DatePicker";
import { CalendarIcon, ChevronIcon, ConfirmIcon, SpinnerIcon } from "@/core/ui/icons";
import { ICON_SIZE } from "@/core/ui/icon-size";

export type PeriodPreset = { value: string; label: string; /** Date span shown under the label, e.g. "1 – 17 Oct 2026". */ hint: string };

/**
 * One control for "which period am I looking at": a trigger that names the
 * period and its dates, a short list of presets, and a "Custom range…" row that
 * unfolds the shared range calendar in place — the dropdown and the date picker
 * stay one surface instead of two stacked popups.
 *
 * Presentation only. The caller decides what a choice does (the overview turns
 * it into URL state), so the same control can scope any screen's data.
 *
 * Motion is deliberately small: the panel fades/scales in, the chevron turns,
 * rows tint on hover, and the calendar unfolds with a height transition. All of
 * it is switched off under prefers-reduced-motion.
 */
export function PeriodDropdown({
  value, presets, rangeFrom, rangeTo, rangeText, today, onSelectPreset, onApplyCustom,
  pending = false, ariaLabel = "Period", align = "right", className = "",
}: {
  /** A preset's `value`, or "custom". */
  value: string;
  presets: readonly PeriodPreset[];
  /** The active window, `YYYY-MM-DD` inclusive — what the calendar opens on. */
  rangeFrom: string;
  rangeTo: string;
  /** Dates of the active period for the trigger's second line. */
  rangeText: string;
  /** Latest selectable day (IST). */
  today: string;
  onSelectPreset: (value: string) => void;
  onApplyCustom: (range: { from: string; to: string }) => void;
  pending?: boolean;
  ariaLabel?: string;
  /** Which trigger edge the panel lines up with. */
  align?: "left" | "right";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [position, setPosition] = useState<{ left: number; width: number; top?: number; bottom?: number; maxHeight: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const isCustom = value === "custom";
  const activeLabel = isCustom ? "Custom range" : presets.find(preset => preset.value === value)?.label ?? "Select period";

  const place = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const margin = 8, gap = 6;
    const width = Math.min(Math.max(rect.width, 300), 336, window.innerWidth - margin * 2);
    const below = window.innerHeight - rect.bottom - gap - margin;
    const above = rect.top - gap - margin;
    const up = below < 300 && above > below;
    setPosition({
      left: Math.max(margin, Math.min(align === "right" ? rect.right - width : rect.left, window.innerWidth - width - margin)), width,
      ...(up ? { bottom: window.innerHeight - rect.top + gap } : { top: rect.bottom + gap }),
      maxHeight: Math.max(160, up ? above : below),
    });
  }, [align]);

  useLayoutEffect(() => {
    if (!open) return;
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [open, customOpen, place]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      // The calendar renders its own popups outside this panel; clicks there are ours.
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target) || (target as Element).closest?.("[data-form-control-popup]")) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("pointerdown", onPointerDown); document.removeEventListener("keydown", onKeyDown); };
  }, [open]);

  const ready = open && Boolean(position);
  // Pull focus into the list only when it was opened from the keyboard; after a
  // mouse click, a focus ring on the first row would read as a stray outline.
  const byKeyboard = useRef(false);
  useEffect(() => {
    if (!ready || !byKeyboard.current) return;
    panelRef.current?.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]')?.focus();
  }, [ready]);

  function toggle(event: React.MouseEvent) {
    byKeyboard.current = event.detail === 0;
    if (!open) setCustomOpen(isCustom);
    setOpen(current => !current);
  }
  function choose(next: string) {
    setOpen(false);
    triggerRef.current?.focus();
    if (next !== value) onSelectPreset(next);
  }
  function apply(range: DateRange) {
    if (!range.from || !range.to) return;
    setOpen(false);
    triggerRef.current?.focus();
    onApplyCustom({ from: range.from, to: range.to });
  }
  function onRadioKey(event: React.KeyboardEvent<HTMLDivElement>) {
    const step = event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : event.key === "ArrowUp" || event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const radios = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]'));
    const index = radios.indexOf(document.activeElement as HTMLElement);
    radios[(index + step + radios.length) % radios.length]?.focus();
  }

  const row = "flex w-full items-center gap-3 border-l-[3px] px-3.5 py-2.5 text-left text-[13px] transition-[background-color,border-color] duration-150 hover:bg-sand focus-visible:bg-sand";

  return (
    <div className={`relative min-w-0 normal-case tracking-normal ${className}`}>
      <Button variant="secondary" layout="control" size="custom" ref={triggerRef} disabled={pending && !open}
        aria-label={`${ariaLabel}: ${activeLabel}, ${rangeText}`} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined} aria-busy={pending || undefined}
        onClick={toggle}
        className={`flex min-h-[46px] w-full items-center gap-2.5 border-[1.5px] bg-paper px-3 py-1.5 text-left transition-colors ${open ? "border-ink" : "border-line hover:border-ink"}`}>
        <CalendarIcon size={ICON_SIZE.button} className="flex-shrink-0 text-mute" aria-hidden />
        <span className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="truncate text-[12.5px] font-bold text-ink">{activeLabel}</span>
          <span className="truncate text-[10.5px] font-normal text-mute">{rangeText}</span>
        </span>
        {pending ? <SpinnerIcon size={ICON_SIZE.button} className="flex-shrink-0 animate-spin text-mute" aria-hidden />
          : <ChevronIcon size={ICON_SIZE.button} className={`flex-shrink-0 text-mute transition-transform duration-200 motion-reduce:transition-none ${open ? "rotate-180" : ""}`} aria-hidden />}
      </Button>

      {ready ? createPortal(
        <div data-form-control-popup="" ref={panelRef} id={id} role="dialog" aria-label={ariaLabel}
          style={{ position: "fixed", left: position!.left, width: position!.width, top: position!.top, bottom: position!.bottom, maxHeight: position!.maxHeight, transformOrigin: `${position!.top === undefined ? "bottom" : "top"} ${align}` }}
          className="scale-in z-[100] overflow-y-auto overscroll-contain border-[1.5px] border-ink bg-paper shadow-[0_12px_30px_-12px_rgba(27,21,18,0.45)]">
          <div role="radiogroup" aria-label={ariaLabel} onKeyDown={onRadioKey}>
            {presets.map(preset => {
              const on = value === preset.value;
              return <Button key={preset.value} variant="ghost" layout="control" size="custom" role="radio" aria-checked={on} tabIndex={on || (isCustom && preset === presets[0]) ? 0 : -1}
                onClick={() => choose(preset.value)} className={`${row} ${on ? "border-transparent border-l-accent bg-sand" : "border-transparent"}`}>
                <span className="flex min-w-0 flex-1 flex-col leading-snug">
                  <span className={`text-ink ${on ? "font-bold" : "font-medium"}`}>{preset.label}</span>
                  <span className="text-[11px] font-normal text-mute">{preset.hint}</span>
                </span>
                <ConfirmIcon size={ICON_SIZE.button} className={`flex-shrink-0 text-accent transition-opacity duration-150 motion-reduce:transition-none ${on ? "opacity-100" : "opacity-0"}`} aria-hidden />
              </Button>;
            })}
          </div>
          <div className="border-t border-line">
            <Button variant="ghost" layout="control" size="custom" icon={CalendarIcon} aria-expanded={customOpen} aria-controls={`${id}-custom`}
              onClick={() => setCustomOpen(current => !current)} className={`${row} ${isCustom ? "border-transparent border-l-accent bg-sand" : "border-transparent"}`}>
              <span className={`flex-1 text-ink ${isCustom ? "font-bold" : "font-medium"}`}>Custom range…</span>
              <ChevronIcon size={ICON_SIZE.button} className={`flex-shrink-0 text-mute transition-transform duration-200 motion-reduce:transition-none ${customOpen ? "rotate-180" : ""}`} aria-hidden />
            </Button>
            <div id={`${id}-custom`} inert={!customOpen} aria-hidden={!customOpen}
              className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none ${customOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
              <div className="min-h-0 overflow-hidden">
                <div className="bg-paper px-3 pb-3 pt-1 [&_[role=dialog]]:border-0 [&_[role=dialog]]:p-0">
                  <DatePicker inline required mode="range" rangeValue={{ from: rangeFrom, to: rangeTo }} onRangeChange={apply} max={today} today={today}
                    ariaLabel="Custom period range" key={`${rangeFrom}:${rangeTo}`} />
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}
