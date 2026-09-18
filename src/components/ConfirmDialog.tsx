"use client";

import { useId, useState } from "react";
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
 *
 * `requireTypedConfirmation` (task: DEV/PROD environment switching, §5
 * "Safety for PROD") adds a second, harder-to-misclick gate on top of the
 * plain click-to-confirm button: the confirm button stays disabled until
 * the admin types the given word exactly. Call sites pass this only when
 * `useAdminEnvironment() === "prod"` — a click alone is enough confirmation
 * on DEV, since a wrong click there can't touch real gym/member/payment
 * data.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  danger = false,
  pending = false,
  requireTypedConfirmation,
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
  /** When set, the confirm button stays disabled until the admin types this
   * exact word (case-insensitive) into the field the dialog renders. */
  requireTypedConfirmation?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const inputId = useId();
  const [typedValue, setTypedValue] = useState("");

  // Reset the typed value whenever the dialog opens — otherwise a leftover
  // "PROD" from a previous confirm could pre-satisfy a later, different
  // dialog instance. Adjusted during render (React's recommended pattern
  // for resetting state on a prop change) rather than in a useEffect, which
  // would fire a redundant extra render on every open.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open && typedValue !== "") setTypedValue("");
  }

  if (!open) return null;

  const typedConfirmationSatisfied =
    !requireTypedConfirmation || typedValue.trim().toLowerCase() === requireTypedConfirmation.trim().toLowerCase();

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
        {requireTypedConfirmation ? (
          <label htmlFor={inputId} className="flex flex-col gap-1.5">
            <span className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-accent">
              Type &quot;{requireTypedConfirmation}&quot; to confirm
            </span>
            <input
              id={inputId}
              type="text"
              autoComplete="off"
              autoFocus
              value={typedValue}
              onChange={(e) => setTypedValue(e.target.value)}
              disabled={pending}
              placeholder={requireTypedConfirmation}
              className="w-full border-[1.5px] border-accent bg-paper px-2.5 py-2 text-[13px] font-bold text-ink outline-none disabled:opacity-60"
            />
          </label>
        ) : null}
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
            disabled={pending || !typedConfirmationSatisfied}
            className={`flex min-h-[40px] flex-1 items-center justify-center text-[11.5px] font-bold uppercase tracking-[0.09em] disabled:cursor-not-allowed disabled:opacity-50 ${
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
