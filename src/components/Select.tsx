// Reused from FitDeskApp/src/components/Select.tsx; adapted to admin buttons and IST.
"use client";

import { Button } from "@/components/Button";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronIcon, ConfirmIcon, type IconType } from "@/core/ui/icons";

export type SelectOption = { value: string; label: string; hint?: string };

/**
 * The app's dropdown — replaces both the native <select> (whose open list is
 * drawn by the OS and ignores this app's styling entirely) and the
 * <input list> + <datalist> pattern (which filters its suggestions by
 * whatever is already typed, so a prefilled field shows one option or none,
 * and which renders nothing at all on some mobile browsers).
 *
 * It still takes part in a plain <form action>: the value is submitted
 * through a real input named `name`, so server actions read it from FormData
 * exactly as before. That input is a visually-hidden text input rather than
 * type="hidden" because hidden inputs are exempt from constraint validation —
 * this way `required` genuinely blocks submit, and the invalid state is
 * shown on the trigger instead of as a browser bubble anchored to nothing.
 *
 * The list is portalled to <body> with fixed positioning so a Sheet's own
 * `overflow-y-auto` can't clip it, and flips above the trigger when there
 * isn't room below. Keyboard: arrows / Home / End move, Enter or Space
 * picks, Escape closes, typing a letter jumps to the next matching option.
 */
export function Select({
  name,
  id,
  options,
  defaultValue = "",
  value: controlledValue,
  onChange,
  placeholder = "Select…",
  required,
  requiredMessage = "Choose an option.",
  disabled,
  "aria-label": ariaLabel,
  className = "",
  triggerClassName = "",
  size = "default",
  icon: LeadingIcon,
  align = "left",
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
}: {
  name?: string;
  id?: string;
  options: readonly SelectOption[];
  defaultValue?: string;
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  requiredMessage?: string;
  disabled?: boolean;
  "aria-label"?: string;
  className?: string;
  /** Preserve form field height, typography and error borders in adapters. */
  triggerClassName?: string;
  /** `compact` trims height/padding/type size to match the app's small
   * toolbar buttons (`min-h-[36px]`, e.g. Financial Reports' Filters
   * button) — for a dropdown that sits beside those rather than inside a
   * form. Defaults to `default`, so every existing call site is unchanged. */
  size?: "default" | "compact";
  /** Optional leading icon (a filter funnel, a sort glyph) for a dropdown
   * that sits in a toolbar and should read as a labelled control. */
  icon?: IconType;
  align?: "left" | "right";
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}) {
  const isControlled = controlledValue !== undefined;
  const [innerValue, setInnerValue] = useState(defaultValue);
  const value = isControlled ? controlledValue : innerValue;

  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [invalid, setInvalid] = useState(false);
  const [position, setPosition] = useState<{ left: number; width: number; top?: number; bottom?: number; maxHeight: number } | null>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const typeahead = useRef({ text: "", at: 0 });
  const listId = useId();
  const optionId = (i: number) => `${listId}-opt-${i}`;

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null;

  const commit = useCallback(
    (next: string) => {
      if (!isControlled) setInnerValue(next);
      onChange?.(next);
      setInvalid(false);
    },
    [isControlled, onChange],
  );

  // A <form>.reset() — which AddProductForm and friends call after a
  // successful save — resets real inputs but knows nothing about this
  // component's state, so listen for it and go back to the default.
  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form || isControlled) return;
    const onReset = () => {
      setInnerValue(defaultValue);
      setInvalid(false);
    };
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, [defaultValue, isControlled]);

  const place = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const gap = 4;
    const margin = 8;
    const spaceBelow = window.innerHeight - rect.bottom - gap - margin;
    const spaceAbove = rect.top - gap - margin;
    const wanted = Math.min(280, options.length * 44 + 8);
    const below = spaceBelow >= Math.min(wanted, 180) || spaceBelow >= spaceAbove;
    const width = Math.min(Math.max(rect.width, 150), window.innerWidth - margin * 2);
    setPosition({
      left: Math.max(margin, Math.min(align === "right" ? rect.right - width : rect.left, window.innerWidth - width - margin)),
      width,
      ...(below ? { top: rect.bottom + gap } : { bottom: window.innerHeight - rect.top + gap }),
      maxHeight: Math.max(120, Math.min(280, below ? spaceBelow : spaceAbove)),
    });
  }, [options.length, align]);

  useLayoutEffect(() => {
    if (!open) return;
    place();
    // Capture phase catches scrolling inside any ancestor (a Sheet's panel),
    // not just the window.
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || listRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // Keep the highlighted option in view while arrowing through a long list.
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex]);

  function openList() {
    if (disabled || triggerRef.current?.matches(":disabled") || !options.length) return;
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    setOpen(true);
  }

  function pick(index: number) {
    if (disabled || triggerRef.current?.matches(":disabled")) return;
    const option = options[index];
    if (!option) return;
    commit(option.value);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function jumpByTypeahead(key: string) {
    const now = Date.now();
    const state = typeahead.current;
    state.text = now - state.at > 600 ? key : state.text + key;
    state.at = now;
    const start = open ? activeIndex : selectedIndex;
    const ordered = [...options.keys()].map((i) => (i + Math.max(start, 0) + (state.text.length === 1 ? 1 : 0)) % options.length);
    const match = ordered.find((i) => options[i].label.toLowerCase().startsWith(state.text.toLowerCase()));
    if (match === undefined) return;
    if (open) setActiveIndex(match);
    else commit(options[match].value);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    const last = options.length - 1;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (!open) openList();
        else setActiveIndex((i) => Math.min(last, i + 1));
        return;
      case "ArrowUp":
        e.preventDefault();
        if (!open) openList();
        else setActiveIndex((i) => Math.max(0, i - 1));
        return;
      case "Home":
        if (open) {
          e.preventDefault();
          setActiveIndex(0);
        }
        return;
      case "End":
        if (open) {
          e.preventDefault();
          setActiveIndex(last);
        }
        return;
      case "Enter":
      case " ":
        e.preventDefault();
        if (open) pick(activeIndex);
        else openList();
        return;
      case "Escape":
        if (open) {
          e.preventDefault();
          e.stopPropagation();
          setOpen(false);
        }
        return;
      case "Tab":
        setOpen(false);
        return;
      default:
        if (e.key.length === 1 && /\S/.test(e.key) && !e.metaKey && !e.ctrlKey && !e.altKey) {
          jumpByTypeahead(e.key);
        }
    }
  }

  return (
    <div className={`relative min-w-0 flex flex-col gap-1 normal-case tracking-normal ${className}`}>
      <Button variant="secondary" layout="control" size="custom"
        id={id}
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && activeIndex >= 0 ? optionId(activeIndex) : undefined}
        aria-label={ariaLabel ?? placeholder}
        aria-invalid={invalid || ariaInvalid || undefined}
        aria-describedby={ariaDescribedBy}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
        className={`flex w-full items-center justify-between border-[1.5px] bg-paper text-left outline-none transition-colors ${
          size === "compact"
            ? "min-h-[36px] gap-1.5 px-3 text-[11.5px] font-bold"
            : "min-h-[42px] gap-2 px-3 py-2.5 text-[13px]"
        } ${invalid || ariaInvalid ? "border-accent" : open ? "border-ink" : "border-line hover:border-mute3"} ${triggerClassName}`}
      >
        {LeadingIcon ? (
          <LeadingIcon size={size === "compact" ? 13 : 15} aria-hidden className="flex-shrink-0 text-mute" />
        ) : null}
        <span className={`min-w-0 flex-1 truncate ${selected ? "text-ink" : "text-mute"}`}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronIcon
          size={size === "compact" ? 13 : 15}
          aria-hidden
          className={`flex-shrink-0 text-mute transition-transform ${open ? "rotate-180" : ""}`}
        />
      </Button>

      <input
        ref={inputRef}
        name={name}
        value={value}
        required={required}
        disabled={disabled}
        onChange={() => {}}
        onInvalid={(e) => {
          e.preventDefault();
          setInvalid(true);
          triggerRef.current?.focus();
        }}
        tabIndex={-1}
        aria-hidden
        className="pointer-events-none absolute bottom-0 left-0 h-px w-px opacity-0"
      />

      {invalid ? <span className="text-[11px] font-medium text-accent">{requiredMessage}</span> : null}

      {open && position && !disabled
        ? createPortal(
            <ul
              data-form-control-popup=""
              ref={listRef}
              id={listId}
              role="listbox"
              aria-label={ariaLabel ?? placeholder}
              style={{
                position: "fixed",
                left: position.left,
                width: position.width,
                top: position.top,
                bottom: position.bottom,
                maxHeight: position.maxHeight,
              }}
              className="fade-in z-[100] overflow-y-auto overscroll-contain border-[1.5px] border-ink bg-paper py-1 shadow-[0_10px_28px_-12px_rgba(27,21,18,0.45)]"
            >
              {options.map((option, i) => {
                const isSelected = option.value === value;
                const isActive = i === activeIndex;
                return (
                  <li
                    key={option.value}
                    id={optionId(i)}
                    data-index={i}
                    role="option"
                    aria-selected={isSelected}
                    // Keep focus on the trigger (aria-activedescendant model).
                    onPointerDown={(e) => e.preventDefault()}
                    onPointerMove={() => setActiveIndex(i)}
                    onClick={() => pick(i)}
                    className={`flex min-h-[40px] cursor-pointer items-center justify-between gap-3 px-3 py-2 text-[13px] ${
                      isActive ? "bg-sand" : ""
                    } ${isSelected ? "font-bold" : ""}`}
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate">{option.label}</span>
                      {option.hint ? <span className="text-[10.5px] font-normal text-mute">{option.hint}</span> : null}
                    </span>
                    {isSelected ? <ConfirmIcon size={14} aria-hidden className="flex-shrink-0 text-accent" /> : null}
                  </li>
                );
              })}
            </ul>,
            document.body,
          )
        : null}
    </div>
  );
}
