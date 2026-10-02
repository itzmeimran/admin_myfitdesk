"use client";

import { Button } from "@/components/Button";
import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/Dialog";
import { useToast } from "@/components/Toast";
import { useAdminEnvironment } from "@/core/env/context";
import { AlertIcon } from "@/core/ui/icons";

/**
 * The one confirmation pattern for privileged Gym Command Center actions.
 * Every action that goes through it has, by construction:
 *   1. a plain-language explanation of the impact,
 *   2. a mandatory admin reason (stored in the audit log server-side),
 *   3. an explicit confirm step — never a single click,
 *   4. optional typed confirmation (e.g. the gym's name) for severe actions,
 *      and on PRODUCTION every `danger` action additionally asks for "PROD",
 *      matching ConfirmDialog's convention elsewhere in this app.
 *
 * The component only collects the decision; `onSubmit` calls the server
 * action, whose RPC re-validates the reason and admin authorization.
 */
export function AdminActionDialog({
  open,
  onClose,
  eyebrow,
  title,
  impact,
  confirmLabel,
  danger = false,
  reasonLabel = "Reason",
  reasonPlaceholder = "Recorded in this gym's audit history",
  typedConfirmation,
  extraValid = true,
  children,
  onSubmit,
  successMessage,
}: {
  open: boolean;
  onClose: () => void;
  eyebrow: string;
  title: string;
  impact: React.ReactNode;
  confirmLabel: string;
  danger?: boolean;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  /** When set, the admin must type this exact text (case-insensitive) first. */
  typedConfirmation?: string;
  /** Lets a caller block submit until its own extra fields are valid. */
  extraValid?: boolean;
  /** Extra form fields rendered above the reason. */
  children?: React.ReactNode;
  onSubmit: (reason: string) => Promise<{ error: string | null; message?: string }>;
  successMessage?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const environment = useAdminEnvironment();
  const [isPending, startTransition] = useTransition();
  const [reason, setReason] = useState("");
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const reasonId = useId();
  const typedId = useId();

  // Reset on every open (adjust state during render, not in an effect).
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setReason("");
      setTyped("");
      setError(null);
    }
  }

  const confirmWord = typedConfirmation ?? (danger && environment === "prod" ? "PROD" : undefined);
  const typedOk = !confirmWord || typed.trim().toLowerCase() === confirmWord.toLowerCase();
  const reasonOk = reason.trim().length >= 3;
  const canSubmit = reasonOk && typedOk && extraValid && !isPending;

  function submit() {
    if (!canSubmit) return;
    setError(null);
    startTransition(async () => {
      const result = await onSubmit(reason.trim());
      if (result.error) {
        setError(result.error);
        return;
      }
      toast.success(result.message ?? successMessage ?? "Done.");
      onClose();
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onClose={isPending ? () => undefined : onClose} eyebrow={eyebrow} title={title}>
      <div className="flex flex-col gap-3.5">
        <div
          className={`flex items-start gap-2.5 border-[1.5px] p-3 text-[12px] leading-relaxed ${
            danger ? "border-accent bg-accent/8 text-ink2" : "border-line bg-sand/50 text-ink2"
          }`}
        >
          {danger ? <AlertIcon size={15} className="mt-0.5 flex-shrink-0 text-accent" aria-hidden /> : null}
          <div>{impact}</div>
        </div>

        {children}

        <label htmlFor={reasonId} className="flex flex-col gap-1">
          <span className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-mute">{reasonLabel} (required)</span>
          <textarea
            id={reasonId}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder={reasonPlaceholder}
            className="w-full resize-none border-[1.5px] border-line bg-paper px-2.5 py-2 text-[13px] text-ink outline-none focus:border-ink"
          />
        </label>

        {confirmWord ? (
          <label htmlFor={typedId} className="flex flex-col gap-1.5">
            <span className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-accent">
              {typedConfirmation ? `Type “${confirmWord}” to confirm` : `This is PRODUCTION. Type “${confirmWord}” to confirm`}
            </span>
            <input
              id={typedId}
              type="text"
              autoComplete="off"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="min-h-[40px] w-full border-[1.5px] border-accent bg-paper px-2.5 text-[13px] text-ink outline-none"
            />
          </label>
        ) : null}

        {error ? (
          <p role="alert" className="text-[12px] font-bold text-accent">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            onClick={onClose}
            disabled={isPending}
            variant="secondary" size="md"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={submit}
            pending={isPending}
            disabled={!canSubmit}
            variant={danger ? "danger" : "primary"} size="md"
          >
            {isPending ? "Working…" : confirmLabel}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
