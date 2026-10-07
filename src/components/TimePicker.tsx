// Reused from FitDeskApp/src/components/TimePicker.tsx; adapted to admin buttons and IST.
"use client";

import { Button } from "@/components/Button";

import { Select } from "@/components/Select";
import { useEffect, useRef, useState } from "react";

const HOURS = Array.from({ length: 12 }, (_, i) => {
  const hour = i + 1;
  return { value: String(hour), label: String(hour).padStart(2, "0") };
});
const MINUTES = Array.from({ length: 12 }, (_, i) => {
  const minute = i * 5;
  return { value: String(minute), label: String(minute).padStart(2, "0") };
});
const PERIODS = [
  { value: "AM", label: "AM" },
  { value: "PM", label: "PM" },
];

function parse(value: string): { hour: number; minute: number; period: "AM" | "PM" } {
  const [h, m] = /^\d{2}:\d{2}$/.test(value) ? value.split(":").map(Number) : [9, 0];
  return { hour: h % 12 === 0 ? 12 : h % 12, minute: m, period: h >= 12 ? "PM" : "AM" };
}

function build(hour: number, minute: number, period: "AM" | "PM"): string {
  const h24 = (hour % 12) + (period === "PM" ? 12 : 0);
  return `${String(h24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/**
 * A time-of-day field made of the app's own `Select`, so it matches the date
 * picker and every dropdown beside it instead of handing the choice to the
 * operating system's native time control (which can't be styled and looks
 * different on every device). The value is a 24-hour "HH:MM" string — what
 * the scheduling code already works in — shown as 12-hour hour / minute / AM-PM.
 * Minutes step in fives, which is how people say a send time.
 */
export function TimePicker({
  value: controlledValue,
  defaultValue = "",
  name,
  required,
  className = "",
  onChange,
  disabled,
  ariaLabel = "Time",
}: {
  /** "HH:MM", 24-hour. */
  value?: string;
  defaultValue?: string;
  name?: string;
  required?: boolean;
  className?: string;
  onChange?: (time: string) => void;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  const [innerValue, setInnerValue] = useState(defaultValue?.slice(0, 5) ?? "");
  const value = controlledValue?.slice(0, 5) ?? innerValue;
  const inputRef = useRef<HTMLInputElement>(null);
  const [invalid, setInvalid] = useState(false);
  const change = (time: string) => {
    setInvalid(false);
    if (controlledValue === undefined) setInnerValue(time);
    onChange?.(time);
  };
  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form || controlledValue !== undefined) return;
    const reset = () => { setInnerValue(defaultValue?.slice(0, 5) ?? ""); setInvalid(false); };
    form.addEventListener("reset", reset);
    return () => form.removeEventListener("reset", reset);
  }, [controlledValue, defaultValue]);
  const { hour, minute, period } = parse(value);
  // A minute that isn't a multiple of five can't come from this control but
  // could arrive as a default; keep it selectable rather than showing blank.
  const minuteOptions = MINUTES.some((o) => o.value === String(minute))
    ? MINUTES
    : [...MINUTES, { value: String(minute), label: String(minute).padStart(2, "0") }].sort(
        (a, b) => Number(a.value) - Number(b.value),
      );

  return (
    <div role="group" aria-label={ariaLabel} className={`min-w-0 normal-case tracking-normal ${className}`}>
      {name || required ? <input ref={inputRef} type="text" className="sr-only" tabIndex={-1} aria-label={ariaLabel} name={name} value={value} onChange={() => {}} required={required} disabled={disabled} onInvalid={(event) => { event.preventDefault(); setInvalid(true); event.currentTarget.parentElement?.querySelector("button")?.focus(); }} /> : null}
      <div className="grid min-w-0 grid-cols-[1fr_1fr_72px] gap-2">
      <Select
        placeholder="Hour"
        aria-label={`${ariaLabel}: hour`}
        options={HOURS}
        value={value ? String(hour) : ""}
        disabled={disabled}
        onChange={(next) => change(build(Number(next), minute, period))}
      />
      <Select
        placeholder="Min"
        aria-label={`${ariaLabel}: minute`}
        options={minuteOptions}
        value={value ? String(minute) : ""}
        disabled={disabled}
        onChange={(next) => change(build(hour, Number(next), period))}
      />
      <Select
        placeholder="AM/PM"
        aria-label={`${ariaLabel}: AM or PM`}
        options={PERIODS}
        value={value ? period : ""}
        disabled={disabled}
        onChange={(next) => change(build(hour, minute, next as "AM" | "PM"))}
      />
      </div>
      {invalid ? <p role="alert" className="mt-1 text-[12px] text-accent">Choose a time.</p> : null}
      {!required && value ? <Button variant="text" size="sm" type="button" disabled={disabled} onClick={() => change("")} className="mt-1 min-h-[32px] text-[12px] font-bold text-mute underline">Clear time</Button> : null}
    </div>
  );
}
