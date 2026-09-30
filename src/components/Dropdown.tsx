"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { NextPageIcon } from "@/core/ui/icons";

export type DropdownOption = { value: string; label: string };

const MENU_MAX_HEIGHT = 288;
const GAP = 4;
const VIEWPORT_MARGIN = 8;

type Placement = { left: number; top?: number; bottom?: number; width: number; maxHeight: number };

/**
 * The design system's one select control: a controlled, presentational
 * dropdown that replaces the browser-native `<select>` (whose open menu can't
 * be styled and looks different on every OS). URL-backed wrappers
 * (`FilterSelect`, `CustomFilterDropdown`, `PageSizeSelect`) and local-state
 * callers all build on this, so every filter in the app opens the same menu.
 *
 * The menu renders in a portal with fixed positioning, so it is never clipped
 * by a table wrapper's `overflow-x-auto` (which is where pagination lives),
 * flips upward when there is no room below, and is clamped inside the
 * viewport on phones. Fully keyboard operable (arrows / Home / End / Enter /
 * Escape) with `aria-activedescendant`, focus never leaves the trigger.
 */
export function Dropdown({
  value,
  options,
  onChange,
  ariaLabel,
  className = "",
  size = "md",
  align = "left",
  disabled = false,
}: {
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
  className?: string;
  /** `md` = filter bars (38px); `sm` = compact footer controls (32px). */
  size?: "md" | "sm";
  align?: "left" | "right";
  disabled?: boolean;
}) {
  const selectedIndex = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const selected = options.find((o) => o.value === value);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(selectedIndex);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const uid = useId();
  const listId = `${uid}-list`;
  const optionId = (i: number) => `${uid}-opt-${i}`;

  const measure = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const wanted = Math.min(MENU_MAX_HEIGHT, options.length * 36 + 8);
    const below = vh - rect.bottom - GAP - VIEWPORT_MARGIN;
    const above = rect.top - GAP - VIEWPORT_MARGIN;
    const openUp = below < wanted && above > below;
    const width = Math.min(Math.max(rect.width, 150), vw - VIEWPORT_MARGIN * 2);
    const rawLeft = align === "right" ? rect.right - width : rect.left;
    const left = Math.min(Math.max(VIEWPORT_MARGIN, rawLeft), vw - width - VIEWPORT_MARGIN);
    setPlacement(
      openUp
        ? { left, width, bottom: vh - rect.top + GAP, maxHeight: Math.min(MENU_MAX_HEIGHT, above) }
        : { left, width, top: rect.bottom + GAP, maxHeight: Math.min(MENU_MAX_HEIGHT, below) },
    );
  }, [align, options.length]);

  useLayoutEffect(() => {
    if (!open) return;
    // Measuring needs the trigger's live rect, which only exists after layout.
    measure();
  }, [open, measure]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: Event) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    // A scroll anywhere but inside the menu would leave it floating detached
    // from its trigger; close rather than chase it.
    const onScroll = (event: Event) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    const onResize = () => setOpen(false);
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer, { passive: true });
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  // Keep the keyboard-highlighted option visible.
  useEffect(() => {
    if (!open) return;
    document.getElementById(optionId(activeIndex))?.scrollIntoView({ block: "nearest" });
    // optionId is derived from a stable id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeIndex]);

  function toggle() {
    if (disabled) return;
    setActiveIndex(selectedIndex);
    setOpen((v) => !v);
  }

  function choose(next: string) {
    setOpen(false);
    triggerRef.current?.focus();
    if (next !== value) onChange(next);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    switch (event.key) {
      case "Escape":
        if (open) {
          event.preventDefault();
          setOpen(false);
        }
        return;
      case "Tab":
        setOpen(false);
        return;
      case "ArrowDown":
      case "ArrowUp": {
        event.preventDefault();
        if (!open) {
          setActiveIndex(selectedIndex);
          setOpen(true);
          return;
        }
        const dir = event.key === "ArrowDown" ? 1 : -1;
        setActiveIndex((i) => (i + dir + options.length) % options.length);
        return;
      }
      case "Home":
        if (open) {
          event.preventDefault();
          setActiveIndex(0);
        }
        return;
      case "End":
        if (open) {
          event.preventDefault();
          setActiveIndex(options.length - 1);
        }
        return;
      case "Enter":
      case " ":
        if (open) {
          event.preventDefault();
          choose(options[activeIndex]?.value ?? value);
        }
        return;
    }
  }

  const sizeClass = size === "sm" ? "min-h-[32px] px-2 text-[11.5px]" : "min-h-[38px] px-3 text-[11.5px] sm:text-[12px]";
  const isFiltered = value !== "" && selectedIndex !== 0;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? optionId(activeIndex) : undefined}
        disabled={disabled}
        onClick={toggle}
        onKeyDown={onKeyDown}
        className={`flex w-full items-center justify-between gap-2.5 border-[1.5px] bg-paper text-left font-bold transition-colors hover:border-ink focus-visible:border-ink focus-visible:outline-none ${sizeClass} ${
          open || isFiltered ? "border-ink text-ink" : "border-line text-mute"
        } ${className}`}
      >
        <span className="truncate">{selected?.label ?? options[0]?.label ?? ""}</span>
        <NextPageIcon size={13} aria-hidden className={`flex-shrink-0 transition-transform ${open ? "-rotate-90" : "rotate-90"}`} />
      </button>

      {open && placement
        ? createPortal(
            <div
              ref={menuRef}
              id={listId}
              role="listbox"
              aria-label={ariaLabel}
              style={{
                position: "fixed",
                left: placement.left,
                top: placement.top,
                bottom: placement.bottom,
                width: placement.width,
                maxHeight: placement.maxHeight,
              }}
              className="fade-in z-[60] overflow-y-auto border-[1.5px] border-ink bg-paper p-1 shadow-[4px_4px_0_var(--ink)]"
            >
              {options.map((option, index) => {
                const isSelected = option.value === value;
                const isActive = index === activeIndex;
                return (
                  <div
                    key={option.value || "__none"}
                    id={optionId(index)}
                    role="option"
                    aria-selected={isSelected}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => choose(option.value)}
                    className={`flex min-h-10 cursor-pointer items-center px-2.5 py-2 text-left text-[12px] transition-colors sm:min-h-9 sm:text-[11.5px] ${
                      isSelected ? "bg-ink font-bold text-paper" : isActive ? "bg-sand text-ink" : "text-mute"
                    }`}
                  >
                    <span className="truncate">{option.label}</span>
                  </div>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
