"use client";

import { Button } from "@/components/Button";
import { IST_TIME_ZONE } from "@/core/dates/ist";
import { useState } from "react";
import type { GymDetail } from "@/features/gyms/detail";
import type { AssignablePackage } from "@/features/gyms/queries";
import { ManageSubscriptionSheet, type SubscriptionSheetGym } from "@/features/gyms/ManageSubscriptionSheet";
import { ExtendIcon, PackagesIcon, ArchiveIcon, RestoreIcon } from "@/core/ui/icons";
import { formatMinorWhole } from "@/core/money/format";
import { capitalizeBillingPeriod } from "@/core/text/billing-period";
import { iconForAction } from '@/core/ui/action-icons';

/**
 * "Admin actions" card row, matching the design's three-card layout
 * (Extend / Change package / Cancel-restore). All three open the one
 * ManageSubscriptionSheet — same real RPC-backed write paths as the header
 * button, just presented as the design's three distinct entry points
 * rather than duplicating the sheet's logic three times.
 */
export function BillingActions({ gym, packages }: { gym: GymDetail; packages: AssignablePackage[] }) {
  const [open, setOpen] = useState(false);
  const sub = gym.subscription;
  const isCancelled = gym.status === "Cancelled";

  const subscriptionGym: SubscriptionSheetGym = {
    organizationId: gym.id,
    name: gym.name,
    packageId: sub?.packageId ?? null,
    packageLabel: sub?.packageName ?? "No package",
    periodLabel: sub?.priceMinor != null ? `${capitalizeBillingPeriod(sub.billingPeriod)} · ${formatMinorWhole(sub.priceMinor, sub.currency ?? "INR")}` : "Trial",
    renewsLabel: sub?.currentPeriodEnd
      ? new Date(sub.currentPeriodEnd).toLocaleDateString("en-IN", { timeZone: IST_TIME_ZONE, day: "numeric", month: "short", year: "numeric" })
      : "—",
    isCancelled,
    isTrialing: gym.status === "Trialing",
    pending: sub?.pending
      ? {
          packageLabel: sub.pending.packageName ?? "Package",
          startsLabel: new Date(sub.pending.periodStart).toLocaleDateString("en-IN", { timeZone: IST_TIME_ZONE,
            day: "numeric",
            month: "short",
            year: "numeric",
          }),
        }
      : null,
  };

  return (
    <section className="flex flex-col gap-3 border-[1.5px] border-line bg-paper p-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <h2 className="mfd-micro-label">Admin actions</h2>
        <span className="ml-auto text-[11.5px] text-mute3">Every action is written to the activity log</span>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <ActionCard
          title={gym.status === "Trialing" ? "Extend trial" : "Record paid renewal"}
          body={gym.status === "Trialing" ? "Add 7, 14 or 30 days without creating an invoice or revenue." : "Choose what the gym paid for, record the offline payment and renew for that package's duration."}
          cta={gym.status === "Trialing" ? "Extend trial" : "Record renewal"}
          icon={ExtendIcon}
          onClick={() => setOpen(true)}
        />
        <ActionCard
          title="Change package"
          body={
            subscriptionGym.pending
              ? `${subscriptionGym.pending.packageLabel} is already queued for ${subscriptionGym.pending.startsLabel}.`
              : "Queues a package to start at the gym's own renewal date — never replaces a live trial or paid period today."
          }
          cta="Choose package"
          icon={PackagesIcon}
          onClick={() => setOpen(true)}
        />
        <ActionCard
          title={isCancelled ? "Restore subscription" : "Cancel subscription"}
          body={
            isCancelled
              ? "Re-open writing for this gym immediately."
              : "Access stays until the period ends, then the gym drops to read-only. Data is retained."
          }
          cta={isCancelled ? "Restore…" : "Cancel subscription…"}
          icon={isCancelled ? RestoreIcon : ArchiveIcon}
          danger={!isCancelled}
          onClick={() => setOpen(true)}
        />
      </div>

      <ManageSubscriptionSheet open={open} gym={subscriptionGym} packages={packages} onClose={() => setOpen(false)} />
    </section>
  );
}

function ActionCard({
  title,
  body,
  cta,
  icon: Icon,
  danger,
  onClick,
}: {
  title: string;
  body: string;
  cta: string;
  icon: React.ComponentType<{ size?: number; "aria-hidden"?: boolean }>;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <div
      className={`flex flex-col gap-2.5 border p-3.5 ${danger ? "border-accent bg-accent/5" : "border-line"}`}
    >
      <span className={`flex items-center gap-1.5 text-[12.5px] font-bold ${danger ? "text-accent" : "text-ink"}`}>
        <Icon size={14} aria-hidden />
        {title}
      </span>
      <span className="text-[11.5px] leading-relaxed text-ink2">{body}</span>
      <Button icon={iconForAction(cta)}
        type="button"
        onClick={onClick}
        variant={danger ? "danger" : "secondary"} size="sm" className="mt-auto"
      >
        {cta}
      </Button>
    </div>
  );
}
