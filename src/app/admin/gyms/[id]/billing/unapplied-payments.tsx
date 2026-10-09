"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { applyPaidPayment } from "@/features/gyms/actions";
import type { UnappliedPayment } from "@/features/gyms/billing";
import { formatShortDate } from "@/core/dates/format";
import { RestoreIcon } from "@/core/ui/icons";

/**
 * Shown when a gym has paid for a package that its subscription never
 * received (e.g. paid during the trial, but nothing was queued). One click
 * applies it the way it should have been: starting where the trial ended.
 */
export function UnappliedPayments({ payments }: { payments: UnappliedPayment[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  if (payments.length === 0) return null;
  const now = new Date();

  return (
    <section className="flex flex-col gap-3 border-[1.5px] border-accent bg-accent/5 px-4 py-3.5">
      <span className="text-[10px] font-bold uppercase tracking-[0.13em] text-accent">Paid but not applied</span>
      {payments.map((p) => (
        <div key={p.paymentId} className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-[13px] font-bold text-ink">
              {p.packageName} · {p.billingPeriod.charAt(0).toUpperCase() + p.billingPeriod.slice(1)} · {p.amount}
            </span>
            <span className="text-[12px] text-ink2">
              Invoice {p.invoiceNumber}
              {p.paidAt ? ` · paid ${formatShortDate(new Date(p.paidAt), now)}` : ""}. The gym paid for this package, but its
              subscription never received it. Applying starts it where the current period ended (or queues it if that is still
              ahead).
            </span>
          </div>
          <Button
            type="button"
            icon={RestoreIcon}
            size="sm"
            pending={pending && busyId === p.paymentId}
            disabled={pending}
            onClick={() => {
              setError(null);
              setBusyId(p.paymentId);
              startTransition(async () => {
                const res = await applyPaidPayment(p.paymentId);
                if (res.error) setError(res.error);
                else router.refresh();
              });
            }}
          >
            Apply package
          </Button>
        </div>
      ))}
      {error ? <p role="alert" className="text-[12px] font-bold text-accent">{error}</p> : null}
    </section>
  );
}
