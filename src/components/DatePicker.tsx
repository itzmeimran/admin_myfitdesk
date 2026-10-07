// Reused from FitDeskApp/src/components/DatePicker.tsx; adapted to admin buttons and IST.
"use client";

import { Button } from "@/components/Button";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { istDateKey as todayIsoDate } from "@/core/dates/ist";
import { CalendarIcon, NextPageIcon, PrevPageIcon } from "@/core/ui/icons";
import { ICON_SIZE } from "@/core/ui/icon-size";

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
export type DateRange = { from: string; to: string };
const EMPTY_RANGE: DateRange = { from: "", to: "" };

/**
 * A compact day or range picker drawn entirely with the app's Clay & Rust
 * tokens. Native date inputs hand their popup to the operating system, so
 * their calendar cannot match the rest of the product; this component keeps
 * the trigger, month navigation, day grid and focus states in one visual
 * language while retaining real buttons and date semantics for assistive
 * technology.
 */
export function DatePicker({
  value: controlledValue,
  defaultValue = "",
  name,
  required,
  onChange,
  min: rawMin,
  max: rawMax,
  today: rawToday = todayIsoDate(),
  disabled = false,
  ariaLabel = "Choose date",
  placeholder,
  align = "left",
  openUp = false,
  size = "compact",
  className = "",
  mode = "single",
  rangeValue,
  defaultRangeValue = EMPTY_RANGE,
  onRangeChange,
  inline = false,
  isDateDisabled,
  dateHint,
}: {
  /** ISO `YYYY-MM-DD`, or "" for "nothing chosen yet". */
  value?: string;
  defaultValue?: string;
  name?: string;
  required?: boolean;
  onChange?: (date: string) => void;
  min?: string;
  max?: string;
  today?: string;
  disabled?: boolean;
  ariaLabel?: string;
  /** Shown in the trigger while `value` is empty. */
  placeholder?: string;
  /** Which edge of the trigger the calendar lines up with — use "right" for a
   * picker that sits near the right edge of the screen so the popup opens
   * back over the page instead of off it. */
  align?: "left" | "right";
  /** Open the calendar above the trigger — for a picker near the bottom of a
   * scrolling sheet, where a downward popup would grow the sheet's own
   * scroll area instead of floating over it. */
  openUp?: boolean;
  /** `compact` is the toolbar height (36px); `field` matches a form field
   * (`Select`'s default, 42px) so the two line up side by side. */
  size?: "compact" | "field";
  className?: string;
  mode?: "single" | "range";
  rangeValue?: DateRange;
  defaultRangeValue?: DateRange;
  /** Range mode: fires when the person presses Apply with both endpoints
   * chosen (or with nothing chosen, on an optional picker, to clear it) —
   * never while a range is only half picked. */
  onRangeChange?: (range: DateRange) => void;
  /** Render the shared calendar in a booking form instead of a popup. */
  inline?: boolean;
  isDateDisabled?: (date: string) => boolean;
  dateHint?: (date: string) => string | undefined;
}) {
  const [innerValue, setInnerValue] = useState(defaultValue);
  const value = calendarDate(controlledValue ?? innerValue);
  const min = calendarDate(rawMin) || undefined;
  const max = calendarDate(rawMax) || undefined;
  const today = calendarDate(rawToday) || todayIsoDate();
  const isRange = mode === "range";
  const [innerRange, setInnerRange] = useState(defaultRangeValue);
  const rawRange = rangeValue ?? innerRange;
  const range = { from: calendarDate(rawRange.from), to: calendarDate(rawRange.to) };
  // The range being picked, not yet applied. `from` without `to` means the
  // start is chosen and the end is still awaited. It lives apart from the
  // committed `range` so the calendar can stay open on a finished selection
  // — the person gets to see it, adjust it or clear it — and only Apply
  // commits.
  const [draft, setDraft] = useState<DateRange>(EMPTY_RANGE);
  const [hoverDate, setHoverDate] = useState<string | null>(null);
  const awaitingEnd = isRange && Boolean(draft.from && !draft.to);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const selectedValue = isRange ? range.from : value;
  const displayValue = isRange && range.from && range.to ? `${formatTriggerDate(range.from)} – ${formatTriggerDate(range.to)}`
    : !isRange && value ? formatTriggerDate(value) : "";
  const inputRef = useRef<HTMLInputElement>(null);
  const [invalid, setInvalid] = useState(false);
  function unavailable() {
    return disabled || Boolean(wrapRef.current?.closest("fieldset:disabled"));
  }
  function change(date: string) {
    if (unavailable()) return;
    setInvalid(false);
    if (controlledValue === undefined) setInnerValue(date);
    onChange?.(date);
  }
  function chooseDate(date: string) {
    if (unavailable() || isDateDisabled?.(date) || (min && date < min) || (max && date > max)) return;
    if (!isRange) {
      change(date);
      setOpen(false);
      if (!inline) wrapRef.current?.querySelector("button")?.focus();
      return;
    }
    // A click on a finished (or empty) draft starts a new range; the next
    // click completes it. Either way the calendar stays open.
    if (!awaitingEnd) {
      setDraft({ from: date, to: "" });
      setHoverDate(date);
      return;
    }
    setDraft(date < draft.from ? { from: date, to: draft.from } : { from: draft.from, to: date });
    setHoverDate(null);
  }
  function clearDraft() {
    if (unavailable()) return;
    setDraft(EMPTY_RANGE);
    setHoverDate(null);
  }
  function applyRange() {
    if (unavailable() || awaitingEnd) return;
    setInvalid(false);
    if (rangeValue === undefined) setInnerRange(draft);
    onRangeChange?.(draft);
    setHoverDate(null);
    setOpen(false);
    wrapRef.current?.querySelector("button")?.focus();
  }
  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form || (isRange ? rangeValue !== undefined : controlledValue !== undefined)) return;
    const reset = () => { setInnerValue(defaultValue); setInnerRange(defaultRangeValue); setDraft(EMPTY_RANGE); setInvalid(false); setOpen(false); };
    form.addEventListener("reset", reset);
    return () => form.removeEventListener("reset", reset);
  }, [controlledValue, defaultValue, isRange, rangeValue, defaultRangeValue]);
  useEffect(() => {
    const values = isRange ? [range.from, range.to] : [value];
    const invalid = values.some((date) => Boolean(date && ((min && date < min) || (max && date > max) || isDateDisabled?.(date))))
      || (isRange && Boolean(range.from && range.to && range.from > range.to));
    inputRef.current?.setCustomValidity(invalid ? "Choose a date within the allowed range." : "");
  }, [value, min, max, isRange, range.from, range.to, isDateDisabled]);
  const [viewMonth, setViewMonth] = useState(() => initialMonth(selectedValue || min || "", today));
  const calendarRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top?: number; bottom?: number; width: number; maxHeight: number } | null>(null);
  const place = useCallback(() => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(304, window.innerWidth - 32);
    const below = window.innerHeight - rect.bottom - 16;
    const above = rect.top - 16;
    const up = openUp || (below < 360 && above > below);
    setPosition({ left: Math.max(16, Math.min(rect.left + (align === "right" ? rect.width - width : 0), window.innerWidth - width - 16)), width,
      ...(up ? { bottom: window.innerHeight - rect.top + 6 } : { top: rect.bottom + 6 }), maxHeight: Math.max(120, up ? above : below) });
  }, [align, openUp]);
  useLayoutEffect(() => {
    if (!open) return;
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node) && !calendarRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        wrapRef.current?.querySelector("button")?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  function toggle() {
    setOpen((current) => {
      if (!current) {
        setViewMonth(initialMonth(selectedValue || min || "", today));
        // Reopening shows the applied range, ready to adjust.
        setDraft(isRange ? { from: range.from, to: range.to } : EMPTY_RANGE);
        setHoverDate(null);
      }
      return !current;
    });
  }

  const monthCells = buildMonthCells(viewMonth);
  const prevMonth = shiftMonth(viewMonth, -1);
  const nextMonth = shiftMonth(viewMonth, 1);
  const prevDisabled = disabled || Boolean(min && prevMonth < min.slice(0, 7));
  const nextDisabled = disabled || Boolean(max && nextMonth > max.slice(0, 7));
  // While the end is awaited, the highlight follows the pointer; otherwise it
  // is the draft exactly as picked.
  const previewEnd = awaitingEnd ? (hoverDate ?? draft.from) : draft.to;
  const rangeFrom = awaitingEnd ? (draft.from < previewEnd ? draft.from : previewEnd) : draft.from;
  const rangeTo = awaitingEnd ? (draft.from > previewEnd ? draft.from : previewEnd) : draft.to;
  const draftComplete = Boolean(draft.from && draft.to);
  const draftDays = draftComplete ? Math.round((Date.parse(draft.to) - Date.parse(draft.from)) / 86_400_000) + 1 : 0;
  // An optional picker may be applied empty, which removes the applied range.
  const canApply = draftComplete || (!required && !awaitingEnd && !draft.from && Boolean(range.from));

  const popupReady = open && Boolean(position) && !disabled;
  useEffect(() => {
    if (!popupReady) return;
    const selected = calendarRef.current?.querySelector<HTMLButtonElement>('[data-date][aria-selected="true"]:not(:disabled)');
    (selected ?? calendarRef.current?.querySelector<HTMLButtonElement>('[data-date]:not(:disabled)'))?.focus();
  }, [popupReady]);

  const calendarMarkup = (
    <div
          data-form-control-popup=""
          ref={calendarRef}
          role="dialog"
          aria-label={ariaLabel}
          style={inline ? undefined : position ?? undefined}
          className={`overflow-y-auto border-[1.5px] border-line bg-paper p-3 ${inline ? "" : "fade-in fixed z-[100] shadow-[0_12px_34px_rgba(20,14,10,0.2)]"}`}
        >
          <div className="mb-2.5 flex items-center justify-between">
            <Button variant="ghost" size="sm" iconOnly
              type="button"
              disabled={prevDisabled}
              onClick={() => setViewMonth(prevMonth)}
              aria-label="Previous month"
              className="press-scale flex h-8 w-8 items-center justify-center border-[1.5px] border-line text-mute transition-colors hover:border-ink hover:text-ink"
            >
              <PrevPageIcon size={ICON_SIZE.button} aria-hidden />
            </Button>
            <span className="font-display text-[14px] tracking-[-0.02em]">{formatMonth(viewMonth)}</span>
            <Button variant="ghost" size="sm" iconOnly
              type="button"
              disabled={nextDisabled}
              onClick={() => setViewMonth(nextMonth)}
              aria-label="Next month"
              className="press-scale flex h-8 w-8 items-center justify-center border-[1.5px] border-line text-mute transition-colors hover:border-ink hover:text-ink  "
            >
              <NextPageIcon size={ICON_SIZE.button} aria-hidden />
            </Button>
          </div>

          {isRange ? <p aria-live="polite" className="mb-2 text-[11px] text-mute">
            {awaitingEnd ? `Start: ${formatTriggerDate(draft.from)}. Choose the end date.`
              : draftComplete ? <><span className="font-bold text-ink">{formatTriggerDate(draft.from)} – {formatTriggerDate(draft.to)}</span> · {draftDays} {draftDays === 1 ? "day" : "days"}</>
              : canApply ? "No dates selected. Apply to remove the range."
              : "Choose a start date, then an end date."}
          </p> : null}
          <div className="grid grid-cols-7 border-b border-line pb-1.5" aria-hidden>
            {WEEKDAYS.map((day) => (
              <span key={day} className="text-center text-[8.5px] font-bold uppercase tracking-[0.08em] text-mute2">
                {day}
              </span>
            ))}
          </div>

          <div className="mt-1.5 grid grid-cols-7 gap-0.5" role="grid" aria-label={formatMonth(viewMonth)}
            onKeyDown={(event) => {
              const offsets: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
              const step = offsets[event.key];
              if (!step) return;
              event.preventDefault();
              const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("[data-date]"));
              let index = buttons.indexOf(event.target as HTMLButtonElement) + step;
              while (index >= 0 && index < buttons.length) {
                if (!buttons[index].disabled) { buttons[index].focus(); break; }
                index += step;
              }
            }}>
            {monthCells.map((cell, index) => {
              if (!cell) return <span key={`blank-${index}`} aria-hidden className="h-8" />;
              const isEndpoint = isRange && (cell === rangeFrom || cell === rangeTo);
              const inRange = isRange && Boolean(rangeFrom && rangeTo && cell >= rangeFrom && cell <= rangeTo);
              const isSelected = isRange ? inRange : cell === value;
              const isToday = cell === today;
              const isDisabled = disabled || Boolean((max && cell > max) || (min && cell < min) || isDateDisabled?.(cell));
              return (
                <Button variant="ghost" layout="control" size="custom"
                  data-date={cell}
                  key={cell}
                  type="button"
                  role="gridcell"
                  disabled={isDisabled}
                  title={dateHint?.(cell)}
                  aria-label={`${formatFullDate(cell)}${isRange && cell === rangeFrom ? ", range start" : ""}${isRange && cell === rangeTo ? ", range end" : ""}`}
                  aria-selected={isSelected}
                  aria-current={isToday ? "date" : undefined}
                  onClick={() => chooseDate(cell)}
                  onPointerEnter={() => { if (awaitingEnd) setHoverDate(cell); }}
                  onFocus={() => { if (awaitingEnd) setHoverDate(cell); }}
                  className={`flex h-8 items-center justify-center text-[11px] font-bold transition-colors ${
                    isEndpoint ? "bg-accent text-paper"
                      : inRange ? "bg-accent/15 text-ink"
                      : isSelected
                      ? "bg-ink text-paper"
                      : isToday
                        ? "border-[1.5px] border-accent text-accent hover:bg-accent/8"
                        : "text-ink hover:bg-sand"
                  } disabled:text-mute3/35`}
                >
                  {Number(cell.slice(-2))}
                </Button>
              );
            })}
          </div>

          {isRange ? (
            <div className="mt-2.5 flex items-center justify-between gap-2">
              <Button variant="text" size="sm" type="button" disabled={disabled || !draft.from} onClick={clearDraft}
                className="min-h-[36px] text-[12px] font-bold text-mute underline disabled:no-underline">
                Clear selection
              </Button>
              <Button variant="primary" size="sm" icon={CalendarIcon} type="button" disabled={disabled || !canApply} onClick={applyRange}
              >
                Apply
              </Button>
            </div>
          ) : !inline && !required && selectedValue ? <Button variant="text" size="sm" type="button" onClick={() => {
            change("");
            setOpen(false);
          }} className="mt-2 min-h-[36px] text-[12px] font-bold text-mute underline">Clear date</Button> : null}
          {today ? (
            <div className="mt-2.5 flex items-center justify-between border-t border-line pt-2.5">
              <span className="text-[9.5px] text-mute">Dates use IST</span>
              <Button variant="text" size="sm" icon={CalendarIcon}
                type="button"
                disabled={disabled || (!isRange && value === today) || Boolean((max && today > max) || (min && today < min) || isDateDisabled?.(today))}
                onClick={() => {
                  chooseDate(today);
                }}
                className="text-[10.5px] font-bold text-accent hover:underline disabled:text-mute3"
              >
                Today
              </Button>
            </div>
          ) : null}
        </div>
  );

  return (
    <div ref={wrapRef} className={`relative min-w-0 normal-case tracking-normal ${className}`}>
      {name || required ? <input ref={inputRef} type="text" name={isRange && name ? `${name}_from` : name} value={selectedValue} onChange={() => {}} required={required} disabled={disabled} tabIndex={-1} aria-label={ariaLabel} className="sr-only" onInvalid={(event) => { event.preventDefault(); setInvalid(true); setOpen(true); wrapRef.current?.querySelector("button")?.focus(); }} /> : null}
      {isRange && (name || required) ? <input type="text" name={name ? `${name}_to` : undefined} value={range.to} onChange={() => {}} required={required} disabled={disabled} tabIndex={-1} aria-label={`${ariaLabel} end`} className="sr-only" onInvalid={(event) => { event.preventDefault(); setInvalid(true); setOpen(true); wrapRef.current?.querySelector("button")?.focus(); }} /> : null}
      {!inline ? <Button variant="secondary" layout="control" size="custom"
        type="button"
        disabled={disabled}
        aria-label={isRange ? `${ariaLabel}: ${displayValue || "no range selected"}` : value ? `${ariaLabel}: ${formatFullDate(value)}` : `${ariaLabel}: no date selected`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-invalid={invalid || undefined}
        onClick={toggle}
        className={`flex w-full min-w-0 items-center gap-2 border-[1.5px] bg-paper text-left transition-colors ${
          size === "field" ? "min-h-[42px] px-3" : "min-h-[36px] px-2.5"
        } hover:border-ink ${
          invalid ? "border-accent" : open ? "border-ink" : "border-line"
        }`}
      >
        <CalendarIcon size={ICON_SIZE.button} className="flex-shrink-0 text-mute" aria-hidden />
        <span
          className={`min-w-0 flex-1 truncate font-semibold ${size === "field" ? "text-[13px]" : "text-[11.5px]"} ${displayValue ? "text-ink" : "text-mute2"}`}
        >
          {displayValue || placeholder || (isRange ? "Select date range" : "Select date")}
        </span>
      </Button> : null}
      {invalid ? <p role="alert" className="mt-1 text-[12px] text-accent">{isRange ? "Choose a complete range within the allowed dates." : value ? "Choose a date within the allowed range." : "Choose a date."}</p> : null}

      {inline ? calendarMarkup : open && position && !disabled ? createPortal(calendarMarkup, document.body) : null}
    </div>
  );
}

/** The month the calendar opens on: the chosen date's, else today's, else the
 * current month — never an empty string, which would render "Invalid Date". */
function initialMonth(value: string, today?: string): string {
  return (value || today || todayIsoDate()).slice(0, 7);
}

function buildMonthCells(monthIso: string): Array<string | null> {
  const [year, month] = monthIso.split("-").map(Number);
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const mondayFirstOffset = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
  const cells: Array<string | null> = Array.from({ length: mondayFirstOffset }, () => null);
  for (let day = 1; day <= days; day += 1) {
    cells.push(`${monthIso}-${String(day).padStart(2, "0")}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function shiftMonth(monthIso: string, amount: number): string {
  const [year, month] = monthIso.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1 + amount, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
}

function formatMonth(monthIso: string): string {
  return new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${monthIso}-01T12:00:00.000Z`),
  );
}

function formatTriggerDate(dateIso: string): string {
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${dateIso}T12:00:00.000Z`),
  );
}

function formatFullDate(dateIso: string): string {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${dateIso}T12:00:00.000Z`));
}

/** Invalid URL/form values render empty, as native date fields did. */
function calendarDate(value?: string): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : "";
}
