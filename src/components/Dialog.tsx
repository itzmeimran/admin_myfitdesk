"use client";

import { CancelIcon } from "@/core/ui/icons";

/**
 * A small centered modal — new alongside Sheet.tsx, not a replacement for
 * it. Sheet is the design's own slide-up-from-bottom primitive for a full
 * multi-field form (Packages' New/Edit package); Dialog is for the shorter
 * 2-5 field forms nested one level inside a Plan's edit Sheet (add/edit a
 * feature, a billing cycle, or an offer) — a Sheet-inside-a-Sheet would be
 * confusing (two stacked full-height overlays), and a form this short
 * doesn't need full-screen real estate on desktop or mobile either. Same
 * Clay & Rust tokens/border weight as Sheet, centered instead of anchored
 * to the bottom edge.
 */
export function Dialog({
  open,
  onClose,
  eyebrow,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onClose}
        className="fade-in absolute inset-0 cursor-pointer border-none bg-black/45"
      />
      <div className="relative flex w-full max-w-md flex-col gap-3.5 overflow-y-auto border-[1.5px] border-ink bg-paper p-4 max-h-[88vh]">
        <div className="flex items-start justify-between gap-3 border-b-[1.5px] border-ink pb-3">
          <span className="flex flex-col gap-1">
            <span className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-mute">{eyebrow}</span>
            <span className="font-display text-[17px] tracking-[-0.02em]">{title}</span>
          </span>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="-mr-1.5 -mt-1.5 flex h-9 w-9 flex-shrink-0 items-center justify-center text-mute"
          >
            <CancelIcon size={17} aria-hidden />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
