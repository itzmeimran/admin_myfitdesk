"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AssignablePackage } from "./queries";
import {
  extendSubscription,
  recordManualSubscriptionRenewal,
  changeSubscriptionPackage,
  clearPendingSubscriptionPackage,
  cancelSubscription,
  restoreSubscription,
  type ManualPaymentInput,
  schedulePackage,
  clearScheduledPackage,
  getScheduledPackage,
  type ScheduledPackageInfo,
} from "./actions";
import { PAYMENT_METHODS, DEFAULT_PAYMENT_METHOD, type PaymentMethod } from "./payment-method";
import { Sheet } from "@/components/Sheet";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";
import { useAdminEnvironment } from "@/core/env/context";
import { toMinorUnits } from "@/core/money/format";
import { ExtendIcon, PackagesIcon, ArchiveIcon, RestoreIcon, CalendarIcon } from "@/core/ui/icons";
import { capitalizeBillingPeriod } from "@/core/text/billing-period";
import { formatShortDate } from "@/core/dates/format";

/** Normalized view of "a gym you can manage the subscription of" — the
 * Gyms list row and the Gym Detail header describe a gym with different
 * field names/shapes, so both call sites build one of these rather than
 * this sheet (and its mutation logic, and its Cancel confirmation) being
 * duplicated between the two pages. */
export type SubscriptionSheetGym = {
  organizationId: string;
  name: string;
  packageId: string | null;
  packageLabel: string;
  periodLabel: string;
  renewsLabel: string;
  isCancelled: boolean;
  isTrialing: boolean;
  /** migration 1013 — a package already queued for this gym, shown so an
   * admin doesn't schedule a second one without realising one exists, and
   * given a way to clear it. Null when nothing is queued. */
  pending: { packageLabel: string; startsLabel: string } | null;
};

/**
 * Extend / change package / cancel-restore — the three write actions
 * organization_subscriptions has RPCs for (supabase/migrations/1004_admin_
 * subscription_write_rpcs.sql). Cancel requires confirmation (task brief
 * §16: "dangerous actions must have confirmation dialogs") — a reversal of
 * this app's earlier one-click Cancel/Archive convention.
 */
export function ManageSubscriptionSheet({
  open,
  gym,
  packages,
  onClose,
}: {
  open: boolean;
  gym: SubscriptionSheetGym;
  packages: AssignablePackage[];
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const environment = useAdminEnvironment();
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState<"renew" | "extend" | "package" | "clear" | "lifecycle" | "schedule" | "clear-schedule" | null>(null);
  const [days, setDays] = useState(gym.isTrialing ? "14" : "7");
  const initialRenewalPackage = packages.find((p) => p.id === gym.packageId) ?? packages[0];
  const [renewalPackageId, setRenewalPackageId] = useState(initialRenewalPackage?.id ?? "");
  const [paymentAmount, setPaymentAmount] = useState(
    initialRenewalPackage ? (initialRenewalPackage.effectivePriceMinor / 100).toFixed(2) : "",
  );
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(DEFAULT_PAYMENT_METHOD);
  const [paymentNote, setPaymentNote] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [packageId, setPackageId] = useState(() =>
    gym.packageId && packages.some((p) => p.id === gym.packageId) ? gym.packageId : "",
  );
  const [scheduled, setScheduled] = useState<ScheduledPackageInfo>(null);
  const [scheduledLoading, setScheduledLoading] = useState(true);
  const [schedulePackageId, setSchedulePackageId] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- kicks off the loading state for the fetch this same effect starts; the state can't be derived any other way without inventing an external store for one sheet
    setScheduledLoading(true);
    getScheduledPackage(gym.organizationId)
      .then((info) => {
        if (!cancelled) setScheduled(info);
      })
      .catch((err) => {
        if (!cancelled) toast.error(err instanceof Error ? err.message : "Couldn't load the scheduled package.");
      })
      .finally(() => {
        if (!cancelled) setScheduledLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-fetch only when the sheet opens for a (possibly new) gym, not on every toast identity change
  }, [open, gym.organizationId]);

  function run(
    kind: "renew" | "extend" | "package" | "clear" | "lifecycle" | "schedule" | "clear-schedule",
    action: () => Promise<{ error: string | null }>,
    successMessage = "Subscription updated.",
  ) {
    setBusy(kind);
    startTransition(async () => {
      const { error } = await action();
      setBusy(null);
      if (error) {
        toast.error(error);
        return;
      }
      toast.success(successMessage);
      if (kind === "schedule" || kind === "clear-schedule") {
        getScheduledPackage(gym.organizationId)
          .then(setScheduled)
          .catch(() => {});
      }
      router.refresh();
    });
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      eyebrow={gym.isTrialing ? "Trial access" : "Writes to organization_subscriptions"}
      title={gym.isTrialing ? `Extend ${gym.name}'s trial` : `Manage ${gym.name}`}
    >
      <div className="flex flex-col gap-4">
        <p className="order-first text-[11.5px] leading-relaxed text-mute">
          {gym.packageLabel} · {gym.periodLabel} · Renews {gym.renewsLabel}
        </p>

        <div className="flex flex-col gap-2 border-t border-line pt-3">
          <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-mute">Record paid renewal</span>
          <select
            value={renewalPackageId}
            onChange={(e) => {
              const nextId = e.target.value;
              const selected = packages.find((p) => p.id === nextId);
              setRenewalPackageId(nextId);
              if (selected) setPaymentAmount((selected.effectivePriceMinor / 100).toFixed(2));
            }}
            className="w-full border-[1.5px] border-line bg-paper px-2.5 py-2 text-[13px] text-ink outline-none focus:border-ink"
          >
            <option value="" disabled>Select the package they paid for</option>
            {packages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {capitalizeBillingPeriod(p.billingPeriod)} · {p.price}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
            <input
              type="text"
              inputMode="decimal"
              placeholder="Amount received"
              value={paymentAmount}
              onChange={(e) => setPaymentAmount(e.target.value)}
              className="min-w-0 border-[1.5px] border-line bg-paper px-2.5 py-2 text-[13px] text-ink outline-none focus:border-ink"
            />
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
              className="min-w-0 border-[1.5px] border-line bg-paper px-2.5 py-2 text-[13px] text-ink outline-none focus:border-ink"
            >
              {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          <input
            type="text"
            maxLength={500}
            placeholder="Payment note (optional)"
            value={paymentNote}
            onChange={(e) => setPaymentNote(e.target.value)}
            className="w-full border-[1.5px] border-line bg-paper px-2.5 py-2 text-[13px] text-ink outline-none focus:border-ink"
          />
          <p className="text-[10.5px] leading-relaxed text-mute3">
            Uses the selected package&apos;s database duration and records a paid manual invoice. A different package
            waits until the current paid/trial period ends; the same package renews from the later of today or the
            current renewal date.
          </p>
          <button
            type="button"
            disabled={isPending || !renewalPackageId || !paymentAmount.trim()}
            onClick={() => {
              const minor = toMinorUnits(paymentAmount);
              if (minor === null || minor <= 0) {
                toast.error("Payment amount isn't a valid amount.");
                return;
              }
              const payment: ManualPaymentInput = { amountMinor: minor, method: paymentMethod, note: paymentNote };
              run(
                "renew",
                () => recordManualSubscriptionRenewal(gym.organizationId, renewalPackageId, payment),
                "Manual renewal and payment recorded.",
              );
            }}
            className="flex min-h-[38px] items-center justify-center gap-1.5 border-[1.5px] border-ink bg-ink text-[11px] font-bold uppercase tracking-[0.09em] text-hi disabled:cursor-wait disabled:opacity-70"
          >
            <ExtendIcon size={13} aria-hidden />
            {busy === "renew" ? "Recording…" : "Record renewal"}
          </button>
        </div>

        <div className={`order-first flex flex-col gap-2 border-[1.5px] p-3 ${gym.isTrialing ? "border-hi bg-hi/10" : "border-line bg-paper"}`}>
          <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-mute">
            {gym.isTrialing ? "Extend trial" : "Free / goodwill extension"}
          </span>
          {gym.isTrialing ? (
            <div className="flex flex-wrap gap-1.5" aria-label="Common trial extensions">
              {[7, 14, 30].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setDays(String(value))}
                  aria-pressed={days === String(value)}
                  className={`min-h-[32px] border px-3 text-[10.5px] font-bold ${days === String(value) ? "border-ink bg-ink text-hi" : "border-line bg-paper text-ink"}`}
                >
                  +{value} days
                </button>
              ))}
            </div>
          ) : null}
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="1"
              step="1"
              value={days}
              onChange={(e) => setDays(e.target.value)}
              className="w-20 border-[1.5px] border-line bg-paper px-2.5 py-2 text-[13px] text-ink outline-none focus:border-ink"
            />
            <span className="text-[11.5px] text-mute">
              days added after the current {gym.isTrialing ? "trial end" : "renewal date"} (or from today if already expired)
            </span>
          </div>
          <p className="text-[10.5px] text-mute3">
            {gym.isTrialing
              ? "Keeps the subscription in Trialing status and records the exact before/after dates in the admin audit log. No invoice or revenue is created."
              : "Moves access only. It deliberately creates no invoice or revenue."}
          </p>
          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              const n = Number(days);
              if (!Number.isInteger(n) || n <= 0) {
                toast.error("Days must be a positive whole number.");
                return;
              }
              run(
                "extend",
                () => extendSubscription(gym.organizationId, n),
                gym.isTrialing ? `Trial extended by ${n} days.` : "Subscription extended without payment.",
              );
            }}
            className="flex min-h-[38px] items-center justify-center gap-1.5 border-[1.5px] border-line text-[11px] font-bold text-ink disabled:cursor-wait disabled:opacity-60"
          >
            <ExtendIcon size={13} aria-hidden />
            {busy === "extend" ? "Extending…" : gym.isTrialing ? `Extend trial by ${days || "…"} days` : "Extend without payment"}
          </button>
        </div>

        <div className="flex flex-col gap-2 border-t border-line pt-3">
          <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-mute">Change package</span>
          {gym.pending ? (
            <div className="flex flex-col gap-1.5 border-[1.5px] border-hi bg-hi/15 px-2.5 py-2">
              <p className="text-[11px] font-bold text-ink">
                {gym.pending.packageLabel} is already queued — starts {gym.pending.startsLabel}.
              </p>
              <p className="text-[10.5px] text-mute3">
                Picking another package below replaces this queued one. Today&apos;s access, price and caps are
                unaffected either way.
              </p>
              <button
                type="button"
                disabled={isPending}
                onClick={() => run("clear", () => clearPendingSubscriptionPackage(gym.organizationId), "Scheduled change cleared.")}
                className="flex min-h-[32px] items-center justify-center text-[10.5px] font-bold text-accent underline underline-offset-2 disabled:cursor-wait disabled:opacity-60"
              >
                {busy === "clear" ? "Clearing…" : "Clear scheduled change"}
              </button>
            </div>
          ) : null}
          <select
            value={packageId}
            onChange={(e) => setPackageId(e.target.value)}
            className="w-full border-[1.5px] border-line bg-paper px-2.5 py-2 text-[13px] text-ink outline-none focus:border-ink"
          >
            <option value="" disabled>
              Select a package
            </option>
            {packages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {capitalizeBillingPeriod(p.billingPeriod)} · {p.price}
                {p.listPrice ? ` (was ${p.listPrice})` : ""}
              </option>
            ))}
          </select>
          <p className="text-[10.5px] text-mute3">
            If the gym is still inside its current period (trialing or already paid), this queues the new package to
            start automatically when that period ends — today&apos;s access, price and caps are untouched until then.
            Only applies immediately if the gym has already lapsed past its renewal date.
          </p>
          <button
            type="button"
            disabled={isPending || !packageId}
            onClick={() => run("package", () => changeSubscriptionPackage(gym.organizationId, packageId))}
            className="flex min-h-[38px] items-center justify-center gap-1.5 border-[1.5px] border-line text-[11px] font-bold text-ink disabled:cursor-wait disabled:opacity-60"
          >
            <PackagesIcon size={13} aria-hidden />
            {busy === "package" ? "Saving…" : "Change package"}
          </button>
        </div>

        <div className="flex flex-col gap-2 border-t border-line pt-3">
          <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-mute">Schedule a package</span>
          {scheduledLoading ? (
            <p className="text-[10.5px] text-mute3">Checking for a scheduled package…</p>
          ) : scheduled ? (
            <div className="flex flex-col gap-2 border-[1.5px] border-hi/60 bg-hi/10 px-3 py-2.5">
              <p className="text-[12px] font-bold text-ink">
                {scheduled.packageName} starts {formatShortDate(new Date(scheduled.periodStart))}
              </p>
              <p className="text-[10.5px] text-mute3">
                Queued automatically — nothing else to do. Runs through {formatShortDate(new Date(scheduled.periodEnd))}.
              </p>
              <button
                type="button"
                disabled={isPending}
                onClick={() => run("clear-schedule", () => clearScheduledPackage(gym.organizationId))}
                className="flex min-h-[34px] items-center justify-center gap-1.5 border-[1.5px] border-line text-[10.5px] font-bold text-ink disabled:cursor-wait disabled:opacity-60"
              >
                {busy === "clear-schedule" ? "Clearing…" : "Clear scheduled package"}
              </button>
            </div>
          ) : (
            <>
              <select
                value={schedulePackageId}
                onChange={(e) => setSchedulePackageId(e.target.value)}
                className="w-full border-[1.5px] border-line bg-paper px-2.5 py-2 text-[13px] text-ink outline-none focus:border-ink"
              >
                <option value="" disabled>
                  Select a package
                </option>
                {packages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {capitalizeBillingPeriod(p.billingPeriod)} · {p.price}
                  </option>
                ))}
              </select>
              <p className="text-[10.5px] text-mute3">
                Starts automatically at {gym.renewsLabel} — today&apos;s access, price and caps are untouched until then.
              </p>
              <button
                type="button"
                disabled={isPending || !schedulePackageId}
                onClick={() => run("schedule", () => schedulePackage(gym.organizationId, schedulePackageId))}
                className="flex min-h-[38px] items-center justify-center gap-1.5 border-[1.5px] border-line text-[11px] font-bold text-ink disabled:cursor-wait disabled:opacity-60"
              >
                <CalendarIcon size={13} aria-hidden />
                {busy === "schedule" ? "Scheduling…" : "Schedule package"}
              </button>
            </>
          )}
        </div>

        <div className="flex flex-col gap-2 border-t border-line pt-3">
          <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-mute">
            {gym.isCancelled ? "Reactivate" : "Cancel"}
          </span>
          <p className="text-[10.5px] text-mute3">
            {gym.isCancelled
              ? "Restores billing status without changing the renewal date — Extend separately if they should get access back today."
              : "Ends auto-renew immediately. The gym keeps whatever access its dates already say (grace/read-only rules still apply)."}
          </p>
          <button
            type="button"
            disabled={isPending}
            onClick={() =>
              gym.isCancelled
                ? run("lifecycle", () => restoreSubscription(gym.organizationId))
                : setConfirmCancel(true)
            }
            className="flex min-h-[38px] items-center justify-center gap-1.5 border-[1.5px] border-line text-[11px] font-bold text-ink disabled:cursor-wait disabled:opacity-60"
          >
            {gym.isCancelled ? <RestoreIcon size={13} aria-hidden /> : <ArchiveIcon size={13} aria-hidden />}
            {busy === "lifecycle" ? "Working…" : gym.isCancelled ? "Restore subscription" : "Cancel subscription"}
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmCancel}
        title={`Cancel ${gym.name}'s subscription?`}
        description="Ends auto-renew immediately. The gym keeps whatever access its current dates already allow — this doesn't cut them off today by itself."
        confirmLabel="Cancel subscription"
        danger
        pending={isPending}
        requireTypedConfirmation={environment === "prod" ? "PROD" : undefined}
        onConfirm={() => {
          setConfirmCancel(false);
          run("lifecycle", () => cancelSubscription(gym.organizationId));
        }}
        onCancel={() => setConfirmCancel(false)}
      />
    </Sheet>
  );
}
