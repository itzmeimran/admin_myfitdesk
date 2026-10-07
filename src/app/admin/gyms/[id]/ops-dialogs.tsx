"use client";

import { DatePicker } from "@/components/DatePicker";
import { TimePicker } from "@/components/TimePicker";
import { Button } from "@/components/Button";
import { istDateKey, istInputToIso } from "@/core/dates/ist";
import { useState } from "react";
import { AdminActionDialog } from "@/components/AdminActionDialog";
import {
  adjustWhatsAppCredits,
  retryFailedWhatsApp,
  revokeSessions,
  setFeatureFlag,
  setOperationLock,
  setAlertStatus,
} from "@/features/gyms/ops/actions";
import { LOCK_CATALOG, type FlagRow, type LockType, type OpsAlert } from "@/features/gyms/ops/types";
import { AddIcon, CancelIcon } from '@/core/ui/icons';

/**
 * Every privileged-action dialog for the Gym Command Center, in one place so
 * the header's quick actions, the Operations tab and the Danger Zone all open
 * the identical flow (impact text + mandatory reason + confirm + audited RPC).
 */

type Base = { open: boolean; onClose: () => void; organizationId: string; gymName: string };

const isFuture = (local: string) => Date.parse(istInputToIso(local) ?? "") > Date.now();

export function CreditsDialog({ open, onClose, organizationId, gymName }: Base) {
  const [mode, setMode] = useState<"add" | "remove">("add");
  const [amount, setAmount] = useState("");
  const parsed = Number(amount);
  const valid = Number.isInteger(parsed) && parsed > 0 && parsed <= 10_000_000;

  return (
    <AdminActionDialog
      open={open}
      onClose={onClose}
      eyebrow="WhatsApp credits"
      title={`${mode === "add" ? "Add" : "Remove"} credits · ${gymName}`}
      confirmLabel={mode === "add" ? "Add credits" : "Remove credits"}
      danger={mode === "remove"}
      extraValid={valid}
      impact={
        mode === "add"
          ? "Credits are added to this gym's balance immediately as an adjustment (not a purchase) and recorded in the credit history with your reason."
          : "Credits are taken off this gym's balance immediately. The balance can never go below zero. The removal is recorded in the credit history with your reason."
      }
      onSubmit={(reason) => adjustWhatsAppCredits({ organizationId, delta: mode === "add" ? parsed : -parsed, reason })}
    >
      <div className="flex flex-col gap-2">
        <div className="flex" role="group" aria-label="Add or remove">
          {(["add", "remove"] as const).map((m) => (
            <Button icon={m === "add" ? AddIcon : CancelIcon}
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
              variant={mode === m ? "primary" : "ghost"} size="sm" className={`flex-1   ${m === "remove" ? "border-l-0" : ""} `}
            >
              {m === "add" ? "Add credits" : "Remove credits"}
            </Button>
          ))}
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-mute">Number of credits</span>
          <input
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))}
            placeholder="e.g. 500"
            className="min-h-[40px] w-full border-[1.5px] border-line bg-paper px-2.5 text-[13px] text-ink outline-none focus:border-ink"
          />
        </label>
      </div>
    </AdminActionDialog>
  );
}

export function RetryDialog({ open, onClose, organizationId }: Omit<Base, "gymName">) {
  return (
    <AdminActionDialog
      open={open}
      onClose={onClose}
      eyebrow="WhatsApp operations"
      title="Retry failed messages"
      confirmLabel="Retry safe messages"
      impact={
        <>
          Only messages that are safe to resend are re-queued: never accepted by Meta, failed with a temporary error (or skipped for credits),
          under 7 days old, not part of a bulk campaign, and with no equivalent message already sent. Credits are not charged twice. Everything
          else is left alone, and the attempt is recorded in this gym&apos;s history.
        </>
      }
      onSubmit={(reason) => retryFailedWhatsApp({ organizationId, reason })}
    />
  );
}

export function SessionsDialog({ open, onClose, organizationId, gymName, scope }: Base & { scope: "owner" | "all" }) {
  return (
    <AdminActionDialog
      open={open}
      onClose={onClose}
      eyebrow="Access & security"
      title={scope === "all" ? "Force logout all users" : "Force logout owner"}
      confirmLabel="Sign out now"
      danger={scope === "all"}
      typedConfirmation={scope === "all" ? gymName : undefined}
      impact={
        <>
          {scope === "all"
            ? "Every owner, staff member and trainer of this gym is signed out on all devices and must sign in again."
            : "The owner is signed out on all devices and must sign in again."}{" "}
          Their current access token can keep working for up to an hour but cannot be refreshed. Platform admins are never affected.
        </>
      }
      onSubmit={(reason) => revokeSessions({ organizationId, scope, reason })}
    />
  );
}

/** Enable or lift one restriction. Enabling can carry an optional expiry. */
export function LockDialog({
  open,
  onClose,
  organizationId,
  gymName,
  lockType,
  enable,
}: Base & { lockType: LockType; enable: boolean }) {
  const entry = LOCK_CATALOG.find((l) => l.type === lockType);
  const [expiryDate, setExpiryDate] = useState("");
  const [expiryTime, setExpiryTime] = useState("");
  const expires = expiryDate && expiryTime ? `${expiryDate}T${expiryTime}` : "";
  const expiresIso = expires ? istInputToIso(expires) : null;
  const expiryValid = (!expiryDate && !expiryTime) || Boolean(expires && isFuture(expires));

  return (
    <AdminActionDialog
      open={open}
      onClose={onClose}
      eyebrow={enable ? "Restrict this gym" : "Lift restriction"}
      title={`${enable ? "Enable" : "Lift"}: ${entry?.label ?? lockType}`}
      confirmLabel={enable ? "Enable restriction" : "Lift restriction"}
      danger={enable && Boolean(entry?.severe)}
      typedConfirmation={enable && entry?.severe ? gymName : undefined}
      extraValid={expiryValid}
      impact={
        <>
          {enable ? entry?.impact : `This removes the restriction “${entry?.label}” so the gym can use that area again.`}{" "}
          {enable ? (
            <>
              The restriction is recorded against this gym and audited. The gym app enforces it by checking{" "}
              <code className="font-mono text-[11px]">organization_operation_locked()</code>.
            </>
          ) : null}
        </>
      }
      onSubmit={(reason) => setOperationLock({ organizationId, lockType, enabled: enable, reason, expiresAt: enable ? expiresIso : null })}
    >
      {enable ? (
        <div className="flex flex-col gap-1">
          <span className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-mute">Automatically lift on (IST, optional)</span>
          <div className="grid gap-2 sm:grid-cols-2">
            <DatePicker value={expiryDate} onChange={setExpiryDate} ariaLabel="Restriction expiry date" size="field" min={istDateKey()} today={istDateKey()} />
            <TimePicker value={expiryTime} onChange={setExpiryTime} ariaLabel="Restriction expiry time in IST" />
          </div>
          {!expiryValid ? <span className="text-[11px] text-accent">Choose both a date and time in the future, or clear both to keep the restriction without an expiry.</span> : null}
        </div>
      ) : null}
    </AdminActionDialog>
  );
}

export function FlagDialog({
  open,
  onClose,
  organizationId,
  flag,
}: Omit<Base, "gymName"> & { flag: FlagRow }) {
  const next = !flag.isEnabled;
  return (
    <AdminActionDialog
      open={open}
      onClose={onClose}
      eyebrow="Feature flag"
      title={`${next ? "Enable" : "Disable"} “${flag.label}”`}
      confirmLabel={next ? "Enable for this gym" : "Disable for this gym"}
      impact={`${flag.description} This changes the feature only for this gym; every other gym keeps its own setting.`}
      onSubmit={(reason) => setFeatureFlag({ organizationId, flagKey: flag.flagKey, enabled: next, reason })}
    />
  );
}

export function ResolveAlertDialog({
  open,
  onClose,
  organizationId,
  alert,
}: Omit<Base, "gymName"> & { alert: OpsAlert }) {
  return (
    <AdminActionDialog
      open={open}
      onClose={onClose}
      eyebrow="Alert"
      title={`Resolve: ${alert.title}`}
      confirmLabel="Mark resolved"
      reasonLabel="Resolution note"
      reasonPlaceholder="What was done, or why it can be closed"
      impact="The alert is closed. If the underlying condition is still true it will not be raised again for 24 hours."
      onSubmit={(note) => setAlertStatus({ organizationId, alertId: alert.id, action: "resolve", note })}
    />
  );
}
