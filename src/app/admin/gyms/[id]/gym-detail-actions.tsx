"use client";

import { useState } from "react";
import Link from "next/link";
import type { GymDetail } from "@/features/gyms/detail";
import type { AssignablePackage } from "@/features/gyms/queries";
import { ManageSubscriptionSheet, type SubscriptionSheetGym } from "@/features/gyms/ManageSubscriptionSheet";
import { SuspendSheet, ReactivateConfirm } from "../gym-row-actions";
import { EditIcon, PackagesIcon, AlertIcon, RestoreIcon } from "@/core/ui/icons";
import { formatMinorWhole } from "@/core/money/format";

/**
 * Section 2's header quick actions: Edit gym / Manage subscription /
 * Suspend or Reactivate. "Edit gym" links to the Settings tab's real edit
 * form (admin_update_organization_profile) rather than opening yet another
 * sheet — general profile fields are exactly what Settings already shows,
 * so editing them there keeps one source of truth for that form instead of
 * a second copy living in the header.
 *
 * Impersonation is deliberately not offered here — per the product owner's
 * explicit decision this pass, it would need new session-minting
 * infrastructure this app doesn't have, and was scoped out rather than
 * built as a fake/disabled button (there is nothing today for it to be a
 * placeholder in front of).
 */
export function GymDetailActions({ gym, packages }: { gym: GymDetail; packages: AssignablePackage[] }) {
  const [subscriptionSheetOpen, setSubscriptionSheetOpen] = useState(false);
  const [suspendSheetOpen, setSuspendSheetOpen] = useState(false);
  const [confirmReactivate, setConfirmReactivate] = useState(false);

  const sub = gym.subscription;
  const packageLabel = sub?.packageName ?? "No package";
  const periodLabel = sub
    ? sub.priceMinor !== null
      ? `${sub.billingPeriod === "yearly" ? "Yearly" : "Monthly"} · ${formatMinorWhole(sub.priceMinor, sub.currency ?? "INR")}`
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
    <div className="flex flex-wrap gap-2">
      <Link
        href={`/admin/gyms/${gym.id}/settings`}
        className="flex min-h-[36px] items-center gap-1.5 border-[1.5px] border-line bg-paper px-3 text-[11px] font-bold uppercase tracking-[0.09em] text-ink"
      >
        <EditIcon size={13} aria-hidden />
        Edit gym
      </Link>
      <button
        type="button"
        onClick={() => setSubscriptionSheetOpen(true)}
        className="flex min-h-[36px] items-center gap-1.5 bg-ink px-3 text-[11px] font-bold uppercase tracking-[0.09em] text-hi"
      >
        <PackagesIcon size={13} aria-hidden />
        Manage subscription
      </button>
      {gym.status === "Suspended" ? (
        <button
          type="button"
          onClick={() => setConfirmReactivate(true)}
          className="flex min-h-[36px] items-center gap-1.5 border-[1.5px] border-line bg-paper px-3 text-[11px] font-bold text-ink"
        >
          <RestoreIcon size={13} aria-hidden />
          Reactivate gym
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setSuspendSheetOpen(true)}
          className="flex min-h-[36px] items-center gap-1.5 border-[1.5px] border-accent bg-accent/8 px-3 text-[11px] font-bold text-accent"
        >
          <AlertIcon size={13} aria-hidden />
          Suspend gym
        </button>
      )}

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
