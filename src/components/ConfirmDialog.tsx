"use client";

import { AlertIcon } from "@/core/ui/icons";

/**
 * Shared confirmation modal for dangerous admin actions (suspend a gym,
 * cancel a subscription, archive a package). Centered overlay rather than
 * Sheet's slide-up — this is a yes/no decision, not a form, and reads more
 * clearly as an interruption than as a panel sliding up from the content
 * below it.
 *
 * Every call site controls its own `open`/pending state (same pattern as
 * every other mutation in this app — useTransition at the call site, this
 * component only renders the decision UI) so the dialog never has to guess
 * whether a request is in flight.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  danger = false,
  pending = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onCancel}
        className="fade-in absolute inset-0 cursor-pointer border-none bg-black/50"
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className="relative flex w-full max-w-sm flex-col gap-4 border-[1.5px] border-ink bg-paper p-5"
      >
        <div className="flex items-start gap-3">
          {danger ? (
            <div
              aria-hidden="true"
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center border-[1.5px] border-accent bg-accent/8 text-accent"
            >
              <AlertIcon size={17} aria-hidden />
            </div>
          ) : null}
          <div className="flex flex-col gap-1.5">
            <h2 id="confirm-dialog-title" className="font-display text-[16.5px] tracking-[-0.015em] text-ink">
              {title}
            </h2>
            <p className="text-[12.5px] leading-relaxed text-mute">{description}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="flex min-h-[40px] flex-1 items-center justify-center border-[1.5px] border-line bg-paper text-[11.5px] font-bold uppercase tracking-[0.09em] text-ink disabled:opacity-60"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className={`flex min-h-[40px] flex-1 items-center justify-center text-[11.5px] font-bold uppercase tracking-[0.09em] disabled:cursor-wait disabled:opacity-70 ${
              danger ? "bg-accent text-paper" : "bg-ink text-hi"
            }`}
          >
            {pending ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
