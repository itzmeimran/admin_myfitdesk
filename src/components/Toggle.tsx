// Copied from FitDeskApp/src/components/Toggle.tsx (D-B: copy, never import
// across repos). Only addition: `ariaLabel`, for a bare switch whose meaning
// is carried by the surrounding row rather than by the switch's own label.
"use client";

import { useId } from "react";

/**
 * The app's on/off switch — the one implementation every setting, permission
 * and "include this" option uses. Never hand-roll a checkbox, an icon button
 * or a segmented ON/OFF pair for a setting; use this.
 *
 * Look: a 64×28 track with a square thumb and an ON / OFF word inside. State
 * change is animated — the thumb slides across, the track colour fades, and
 * the word cross-fades into the space the thumb leaves. Every transition is
 * opacity / transform / colour only, so nothing reflows, and the global
 * `prefers-reduced-motion` rule collapses them.
 *
 * Behaviour: a real `role="switch"` button (Enter / Space for free), the whole
 * label + hint row is the click target, and a bare switch gets an invisible
 * 44px hit area so it is still easy to hit on a phone. With `name`, it also
 * submits inside a plain `<form action>` through a hidden input — present
 * (value "on", or `value`) when on, absent when off, like a real checkbox.
 *
 * It is controlled: it only ever shows `checked`. A caller that must confirm
 * first (a dialog, a server round-trip) can leave `checked` alone in
 * `onChange` and the switch will not move until the real state changes.
 */
export function Toggle({
  checked,
  onChange,
  label,
  hint,
  ariaLabel,
  name,
  value = "on",
  disabled,
  density = "compact",
  className = "",
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;
  hint?: string;
  /** Accessible name for a bare switch (no `label`). */
  ariaLabel?: string;
  /** Submit through a plain `<form action>` as `name=value` while on. */
  name?: string;
  /** What `name` submits while on. Defaults to "on". */
  value?: string;
  disabled?: boolean;
  /** `comfortable` is the larger Settings type; `compact` fits dense forms
   * and sheets. */
  density?: "compact" | "comfortable";
  className?: string;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const hasText = Boolean(label || hint);

  const labelClass =
    density === "comfortable" ? "text-[15px] font-medium" : "text-[13px] font-bold";
  const hintClass =
    density === "comfortable" ? "text-[13px] leading-relaxed text-mute" : "text-[10.5px] text-mute";

  const control = (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-label={hasText ? undefined : (ariaLabel ?? "Toggle")}
      aria-labelledby={hasText && label ? `${id}-label` : undefined}
      aria-describedby={hint ? hintId : undefined}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`group relative h-7 w-16 flex-none cursor-pointer transition-colors duration-200 ease-out before:absolute before:-inset-x-1 before:-inset-y-2 before:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-50 ${
        checked ? "bg-ink" : "bg-track"
      }`}
    >
      <span
        aria-hidden
        className={`pointer-events-none absolute left-0 top-0 flex h-full w-[38px] items-center justify-center text-[11px] font-bold tracking-[0.06em] text-paper transition-opacity duration-200 ${
          checked ? "opacity-100" : "opacity-0"
        }`}
      >
        ON
      </span>
      <span
        aria-hidden
        className={`pointer-events-none absolute right-0 top-0 flex h-full w-[38px] items-center justify-center text-[11px] font-bold tracking-[0.06em] text-ink transition-opacity duration-200 ${
          checked ? "opacity-0" : "opacity-100"
        }`}
      >
        OFF
      </span>
      <span
        aria-hidden
        className={`pointer-events-none absolute left-[3px] top-[3px] h-[22px] w-[22px] bg-paper shadow-[0_1px_2px_rgba(27,21,18,0.25)] transition-transform duration-200 ease-[cubic-bezier(0.34,1.3,0.64,1)] group-active:scale-90 ${
          checked ? "translate-x-9" : "translate-x-0"
        }`}
      />
    </button>
  );

  const hidden = name && checked ? <input type="hidden" name={name} value={value} /> : null;

  if (!hasText) {
    return (
      <span className={`inline-flex ${className}`}>
        {hidden}
        {control}
      </span>
    );
  }

  return (
    <div
      className={`flex min-h-[44px] items-start justify-between gap-4 ${
        disabled ? "opacity-60" : ""
      } ${className}`}
    >
      {/* A <label for> instead of wrapping the button: the text is the click
          target for the switch without nesting interactive content. */}
      <label
        htmlFor={id}
        className={`flex min-w-0 flex-1 flex-col gap-1 py-0.5 ${disabled ? "" : "cursor-pointer"}`}
      >
        {label ? (
          <span id={`${id}-label`} className={labelClass}>
            {label}
          </span>
        ) : null}
        {hint ? (
          <span id={hintId} className={hintClass}>
            {hint}
          </span>
        ) : null}
      </label>
      {hidden}
      {control}
    </div>
  );
}
