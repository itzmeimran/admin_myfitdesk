"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { IconType } from "@/core/ui/icons";
import { MoreIcon } from "@/core/ui/icons";

export type ActionMenuItem = {
  key: string;
  label: string;
  icon?: IconType;
  onSelect: () => void;
  disabled?: boolean;
  /** Small explanation shown under a disabled item's label (why it can't run). */
  hint?: string;
  /** Destructive styling; conventionally the last item, after a divider. */
  danger?: boolean;
  /** Draw a divider above this item. */
  separated?: boolean;
  /** Small uppercase group label drawn above this item (and below any divider). */
  heading?: string;
};

const MENU_WIDTH = 208;
const GAP = 4;
const VIEWPORT_MARGIN = 8;

type Placement = { left: number; top?: number; bottom?: number; maxHeight: number };

/**
 * The design system's "⋯" row-actions control: one small icon button that
 * opens a menu of selectable actions, so a table row never stacks a row of
 * buttons. Sibling of `Dropdown` and built the same way: the menu is portalled
 * with fixed positioning (never clipped by a table's `overflow-x-auto`),
 * flips upward near the viewport bottom, closes on outside press / scroll /
 * resize, and is fully keyboard operable (arrows / Home / End / Enter /
 * Escape) with focus returning to the trigger.
 *
 * Items are plain callbacks, so a destructive item should open a
 * `ConfirmDialog` rather than act directly.
 */
export function ActionMenu({
  items,
  ariaLabel = "Actions",
  disabled = false,
  align = "right",
  size = "sm",
  menuWidth = MENU_WIDTH,
}: {
  items: ActionMenuItem[];
  ariaLabel?: string;
  disabled?: boolean;
  align?: "left" | "right";
  /** `md` is a 40px, solid-bordered trigger that sits beside full-size buttons. */
  size?: "sm" | "md";
  menuWidth?: number;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const uid = useId();
  const itemId = (i: number) => `${uid}-item-${i}`;

  const headingCount = items.filter((i) => i.heading).length;
  const firstEnabled = useCallback(() => Math.max(0, items.findIndex((i) => !i.disabled)), [items]);

  const measure = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const wanted = items.length * 38 + headingCount * 26 + 12;
    const below = vh - rect.bottom - GAP - VIEWPORT_MARGIN;
    const above = rect.top - GAP - VIEWPORT_MARGIN;
    const openUp = below < wanted && above > below;
    const rawLeft = align === "right" ? rect.right - menuWidth : rect.left;
    const left = Math.min(Math.max(VIEWPORT_MARGIN, rawLeft), vw - menuWidth - VIEWPORT_MARGIN);
    setPlacement(
      openUp
        ? { left, bottom: vh - rect.top + GAP, maxHeight: above }
        : { left, top: rect.bottom + GAP, maxHeight: below },
    );
  }, [align, items.length, headingCount, menuWidth]);

  useLayoutEffect(() => {
    if (!open) return;
    // Needs the trigger's live rect, which only exists after layout.
    measure();
  }, [open, measure]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: Event) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
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

  function openMenu() {
    setActiveIndex(firstEnabled());
    setOpen(true);
  }

  function select(index: number) {
    const item = items[index];
    if (!item || item.disabled) return;
    setOpen(false);
    triggerRef.current?.focus();
    item.onSelect();
  }

  function move(dir: 1 | -1) {
    setActiveIndex((current) => {
      for (let step = 1; step <= items.length; step += 1) {
        const next = (current + dir * step + items.length * step) % items.length;
        if (!items[next]?.disabled) return next;
      }
      return current;
    });
  }

  // Focus moves into the menu while it is open so `aria-activedescendant`
  // (valid on the menu, not on the trigger button) tracks the highlighted item.
  useEffect(() => {
    if (open && placement) menuRef.current?.focus({ preventScroll: true });
  }, [open, placement]);

  function onKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    switch (event.key) {
      case "Escape":
        if (open) {
          event.preventDefault();
          setOpen(false);
          triggerRef.current?.focus();
        }
        return;
      case "Tab":
        setOpen(false);
        return;
      case "ArrowDown":
      case "ArrowUp":
        event.preventDefault();
        if (!open) openMenu();
        else move(event.key === "ArrowDown" ? 1 : -1);
        return;
      case "Home":
        if (open) {
          event.preventDefault();
          setActiveIndex(firstEnabled());
        }
        return;
      case "End":
        if (open) {
          event.preventDefault();
          const last = items.map((i) => i.disabled).lastIndexOf(false);
          setActiveIndex(Math.max(0, last));
        }
        return;
      case "Enter":
      case " ":
        if (open) {
          event.preventDefault();
          select(activeIndex);
        }
        return;
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? `${uid}-menu` : undefined}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKeyDown}
        className={
          size === "md"
            ? `press-scale inline-flex h-10 w-10 flex-shrink-0 items-center justify-center border-[1.5px] border-ink transition-colors hover:bg-ink hover:text-paper focus-visible:bg-ink focus-visible:text-paper focus-visible:outline-none disabled:opacity-40 ${
                open ? "bg-ink text-paper" : "bg-paper text-ink"
              }`
            : `inline-flex h-8 w-8 items-center justify-center border-[1.5px] text-ink transition-colors hover:border-ink hover:bg-sand focus-visible:border-ink focus-visible:outline-none disabled:opacity-40 ${
                open ? "border-ink bg-sand" : "border-line"
              }`
        }
      >
        <MoreIcon size={16} aria-hidden />
      </button>

      {open && placement
        ? createPortal(
            <div
              ref={menuRef}
              id={`${uid}-menu`}
              role="menu"
              tabIndex={-1}
              aria-label={ariaLabel}
              aria-activedescendant={itemId(activeIndex)}
              onKeyDown={onKeyDown}
              style={{
                position: "fixed",
                left: placement.left,
                top: placement.top,
                bottom: placement.bottom,
                width: menuWidth,
                maxHeight: placement.maxHeight,
              }}
              className="fade-in z-[60] overflow-y-auto border-[1.5px] border-ink bg-paper py-1 shadow-[4px_4px_0_var(--ink)] focus:outline-none"
            >
              {items.map((item, index) => {
                const Icon = item.icon;
                const isActive = index === activeIndex && !item.disabled;
                return (
                  <div key={item.key}>
                    {item.separated ? <div className="my-1 border-t border-line" /> : null}
                    {item.heading ? (
                      <div
                        role="presentation"
                        className="px-3 pb-1 pt-2 text-[9.5px] font-bold uppercase tracking-[0.14em] text-mute2"
                      >
                        {item.heading}
                      </div>
                    ) : null}
                    <div
                      id={itemId(index)}
                      role="menuitem"
                      aria-disabled={item.disabled || undefined}
                      onMouseEnter={() => !item.disabled && setActiveIndex(index)}
                      onClick={() => select(index)}
                      className={`flex min-h-10 items-center gap-2.5 px-3 py-2 text-left text-[12px] font-bold sm:min-h-9 ${
                        item.disabled
                          ? "cursor-not-allowed text-mute3"
                          : `cursor-pointer ${item.danger ? "text-accent" : "text-ink"} ${
                              isActive ? (item.danger ? "bg-accent/8" : "bg-sand") : ""
                            }`
                      }`}
                    >
                      {Icon ? <Icon size={14} aria-hidden className="flex-shrink-0" /> : null}
                      <span className="min-w-0">
                        <span className="block truncate">{item.label}</span>
                        {item.disabled && item.hint ? (
                          <span className="block text-[10px] font-normal leading-tight text-mute2">{item.hint}</span>
                        ) : null}
                      </span>
                    </div>
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
