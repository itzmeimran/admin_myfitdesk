"use client";

import { useState } from "react";
import Link from "next/link";
import type { GymDetail } from "@/features/gyms/detail";
import type { AssignablePackage } from "@/features/gyms/queries";
import { ManageSubscriptionSheet, type SubscriptionSheetGym } from "@/features/gyms/ManageSubscriptionSheet";
import { SuspendSheet, ReactivateConfirm } from "../gym-row-actions";
import { EditIcon, PackagesIcon, AlertIcon, RestoreIcon, ExtendIcon } from "@/core/ui/icons";
import { formatMinorWhole } from "@/core/money/format";
import { capitalizeBillingPeriod } from "@/core/text/billing-period";

/**
 * Header quick actions, matching the design's two primary buttons ("Extend
 * access" / "Manage subscription") plus this app's own real Suspend/
 * Reactivate/Edit capabilities as a smaller secondary row — the design
 * canvas doesn't show those three at all (it's a single-state mockup, not a
 * spec for every admin capability), so they're kept rather than dropped;
 * D-4(b)/(c) in CLAUDE.md are why suspend exists and impersonation doesn't.
 *
 * "Extend access" and "Manage subscription" open the same sheet — its
 * Extend section is already the first one, so a dedicated "Extend access"
 * button just gets the admin straight to it without a second implementation
 * of the same write path.
 */
export function GymDetailActions({ gym, packages }: { gym: GymDetail; packages: AssignablePackage[] }) {
  const [subscriptionSheetOpen, setSubscriptionSheetOpen] = useState(false);
  const [suspendSheetOpen, setSuspendSheetOpen] = useState(false);
  const [confirmReactivate, setConfirmReactivate] = useState(false);

  const sub = gym.subscription;
  const packageLabel = sub?.packageName ?? "No package";
  const periodLabel = sub
    ? sub.priceMinor !== null
      ? `${capitalizeBillingPeriod(sub.billingPeriod)} · ${formatMinorWhole(sub.priceMinor, sub.currency ?? "INR")}`
      : "Trial"
    : "No subscription";
  const renewsLabel = sub?.currentPeriodEnd
    ? new Date(sub.currentPeriodEnd).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
    : "—";

  const subscriptionGym: SubscriptionSheetGym = {
    organizationId: gym.id,
    name: gym.name,
    packageId: sub?.packageId ?? null,
    packageLabel,
    periodLabel,
    renewsLabel,
    isCancelled: gym.status === "Cancelled",
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={() => setSubscriptionSheetOpen(true)}
          className="flex min-h-[38px] items-center gap-1.5 border-[1.5px] border-ink bg-paper px-3.5 text-[11.5px] font-bold uppercase tracking-[0.09em] text-ink"
        >
          <ExtendIcon size={14} aria-hidden />
          Extend access
        </button>
        <button
          type="button"
          onClick={() => setSubscriptionSheetOpen(true)}
          className="flex min-h-[38px] items-center gap-1.5 bg-ink px-3.5 text-[11.5px] font-bold uppercase tracking-[0.09em] text-hi"
        >
          <PackagesIcon size={14} aria-hidden />
          Manage subscription
        </button>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Link
          href={`/admin/gyms/${gym.id}/settings`}
          className="flex min-h-[32px] items-center gap-1.5 border border-line px-2.5 text-[10.5px] font-bold uppercase tracking-[0.08em] text-mute hover:text-ink"
        >
          <EditIcon size={12} aria-hidden />
          Edit gym
        </Link>
        {gym.status === "Suspended" ? (
          <button
            type="button"
            onClick={() => setConfirmReactivate(true)}
            className="flex min-h-[32px] items-center gap-1.5 border border-line px-2.5 text-[10.5px] font-bold uppercase tracking-[0.08em] text-mute hover:text-ink"
          >
            <RestoreIcon size={12} aria-hidden />
            Reactivate gym
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setSuspendSheetOpen(true)}
            className="flex min-h-[32px] items-center gap-1.5 border border-accent px-2.5 text-[10.5px] font-bold uppercase tracking-[0.08em] text-accent"
          >
            <AlertIcon size={12} aria-hidden />
            Suspend gym
          </button>
        )}
      </div>

      <ManageSubscriptionSheet
        open={subscriptionSheetOpen}
        gym={subscriptionGym}
        packages={packages}
        onClose={() => setSubscriptionSheetOpen(false)}
      />
      <SuspendSheet open={suspendSheetOpen} organizationId={gym.id} name={gym.name} onClose={() => setSuspendSheetOpen(false)} />
      <ReactivateConfirm
        open={confirmReactivate}
        organizationId={gym.id}
        name={gym.name}
        onClose={() => setConfirmReactivate(false)}
      />
    </div>
  );
}
