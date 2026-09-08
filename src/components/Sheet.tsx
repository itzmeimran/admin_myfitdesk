"use client";

import { CancelIcon, NextPageIcon, type IconType } from "@/core/ui/icons";
import { ICON_SIZE } from "@/core/ui/icon-size";

/** The design's bottom-sheet primitive: a dark backdrop + a panel sliding up
 * from the screen bottom, with an eyebrow/title header and a close button.
 * Copied from FitDeskApp/src/components/Sheet.tsx. This app's only sheet
 * today is Packages' "New package" form (src/app/admin/packages/*).
 *
 * On desktop the design calls this an inline panel rather than an overlay
 * sheet ("appears between the header and the card grid when open") — but
 * the component inventory in the design's spec section still maps
 * PackageForm to this primitive, and md:mx-auto/md:max-w-lg below already
 * centers it as a modal-style panel on wide viewports, which reads the same
 * as "inline" for a single-column form. Kept as one component rather than
 * two implementations for the two breakpoints. */
export function Sheet({
  open,
  onClose,
  eyebrow,
  title,
  children,
  maxHeightClassName = "max-h-[88%]",
}: {
  open: boolean;
  onClose: () => void;
  eyebrow: string;
  title: string;
  children: React.ReactNode;
  maxHeightClassName?: string;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end">
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onClose}
        className="fade-in absolute inset-0 cursor-pointer border-none bg-black/45"
      />
      <div
        className={`sheet-slide-up relative flex flex-col gap-3.5 overflow-y-auto border-t-[1.5px] border-ink bg-paper p-4 md:mx-auto md:w-full md:max-w-lg md:border-x-[1.5px] ${maxHeightClassName}`}
      >
        <div className="flex items-start justify-between gap-3 border-b-[1.5px] border-ink bg-ink -mx-4 -mt-4 px-4 py-3.5 text-paper md:-mx-0 md:-mt-0 md:border-0 md:bg-transparent md:p-0 md:text-ink">
          <span className="flex flex-col gap-1">
            <span className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-mute3 md:text-mute">
              {eyebrow}
            </span>
            <span className="font-display text-[19px] tracking-[-0.025em]">{title}</span>
          </span>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="-mr-2 -mt-2 flex h-10 w-10 flex-shrink-0 items-center justify-center text-mute3 md:text-mute"
          >
            <CancelIcon size={18} aria-hidden />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** A tappable option row inside a sheet — kept for parity with FitDeskApp's
 * Sheet.tsx even though no admin screen uses it yet, so the primitive is
 * ready the moment one does (e.g. a future "pick a gym" search sheet). */
export function SheetRow({
  label,
  hint,
  icon: Icon,
  showChevron,
  right,
  active,
  onClick,
}: {
  label: string;
  hint?: string;
  icon?: IconType;
  showChevron?: boolean;
  right?: React.ReactNode;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-[52px] items-center gap-3 border-[1.5px] px-3.5 py-2.5 text-left ${
        active ? "border-ink bg-ink text-paper" : "border-line bg-transparent text-ink"
      }`}
    >
      {Icon ? <Icon size={ICON_SIZE.nav} className="flex-shrink-0" aria-hidden /> : null}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[13px] font-bold">{label}</span>
        {hint ? (
          <span className={`text-[10.5px] ${active ? "text-mute3" : "text-mute"}`}>{hint}</span>
        ) : null}
      </span>
      {right ? <span className="text-xs">{right}</span> : null}
      {showChevron ? (
        <NextPageIcon size={ICON_SIZE.button} className="flex-shrink-0" aria-hidden />
      ) : null}
    </button>
  );
}
