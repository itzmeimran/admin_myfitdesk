"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AssignablePackage } from "./queries";
import {
  extendSubscription,
  changeSubscriptionPackage,
  clearPendingSubscriptionPackage,
  cancelSubscription,
  restoreSubscription,
  type ManualPaymentInput,
} from "./actions";
import { PAYMENT_METHODS, DEFAULT_PAYMENT_METHOD, type PaymentMethod } from "./payment-method";
import { Sheet } from "@/components/Sheet";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";
import { useAdminEnvironment } from "@/core/env/context";
import { toMinorUnits } from "@/core/money/format";
import { ExtendIcon, PackagesIcon, ArchiveIcon, RestoreIcon } from "@/core/ui/icons";
import { capitalizeBillingPeriod } from "@/core/text/billing-period";

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
  const [busy, setBusy] = useState<"extend" | "package" | "clear" | "lifecycle" | null>(null);
  const [days, setDays] = useState("7");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(DEFAULT_PAYMENT_METHOD);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [packageId, setPackageId] = useState(() =>
    gym.packageId && packages.some((p) => p.id === gym.packageId) ? gym.packageId : "",
  );

  function run(
    kind: "extend" | "package" | "clear" | "lifecycle",
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
      router.refresh();
    });
  }

  return (
    <Sheet open={open} onClose={onClose} eyebrow="Writes to organization_subscriptions" title={`Manage ${gym.name}`}>
      <div className="flex flex-col gap-4">
        <p className="text-[11.5px] leading-relaxed text-mute">
          {gym.packageLabel} · {gym.periodLabel} · Renews {gym.renewsLabel}
        </p>

        <div className="flex flex-col gap-2 border-t border-line pt-3">
          <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-mute">Extend</span>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="1"
              step="1"
              value={days}
              onChange={(e) => setDays(e.target.value)}
              className="w-20 border-[1.5px] border-line bg-paper px-2.5 py-2 text-[13px] text-ink outline-none focus:border-ink"
            />
            <span className="text-[11.5px] text-mute">days from today (or from the current renewal date, if later)</span>
          </div>

          <div className="flex flex-col gap-2 border-t border-line pt-2.5">
            <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-mute3">
              Payment collected (optional)
            </span>
            <div className="flex items-center gap-2">
              <input
                type="text"
                inputMode="decimal"
                placeholder="Amount, e.g. 999"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                className="w-32 border-[1.5px] border-line bg-paper px-2.5 py-2 text-[13px] text-ink outline-none focus:border-ink"
              />
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                className="flex-1 border-[1.5px] border-line bg-paper px-2.5 py-2 text-[13px] text-ink outline-none focus:border-ink"
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-[10.5px] text-mute3">
              Fill this in only if you collected the payment yourself (e.g. cash handed over in person) — it records
              an invoice against this gym. Leave the amount blank for a free/goodwill extension.
            </p>
          </div>

          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              const n = Number(days);
              if (!Number.isInteger(n) || n <= 0) {
                toast.error("Days must be a positive whole number.");
                return;
              }
              let payment: ManualPaymentInput | null = null;
              if (paymentAmount.trim() !== "") {
                const minor = toMinorUnits(paymentAmount);
                if (minor === null || minor <= 0) {
                  toast.error("Payment amount isn't a valid amount.");
                  return;
                }
                payment = { amountMinor: minor, method: paymentMethod };
              }
              run(
                "extend",
                () => extendSubscription(gym.organizationId, n, payment),
                payment ? "Subscription extended and payment recorded." : "Subscription extended.",
              );
            }}
            className="flex min-h-[38px] items-center justify-center gap-1.5 border-[1.5px] border-ink bg-ink text-[11px] font-bold uppercase tracking-[0.09em] text-hi disabled:cursor-wait disabled:opacity-70"
          >
            <ExtendIcon size={13} aria-hidden />
            {busy === "extend" ? "Extending…" : "Extend subscription"}
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
