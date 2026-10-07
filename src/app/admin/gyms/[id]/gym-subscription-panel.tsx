"use client";

import { useConfirmedTransition } from '@/components/use-confirmed-transition';
import { Button } from "@/components/Button";
import { IST_TIME_ZONE } from "@/core/dates/ist";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { GymDetail } from "@/features/gyms/detail";
import type { AssignablePackage } from "@/features/gyms/queries";
import type { OwnerInvitation } from "@/features/gyms/onboarding-types";
import { ManageSubscriptionSheet, type SubscriptionSheetGym } from "@/features/gyms/ManageSubscriptionSheet";
import { SuspendSheet, ReactivateConfirm } from "../gym-row-actions";
import { resendGymOwnerInvitation } from "../invite-actions";
import { ActionMenu, type ActionMenuItem } from "@/components/ActionMenu";
import { CreditsDialog, RetryDialog, SessionsDialog } from "./ops-dialogs";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Dialog } from "@/components/Dialog";
import { useToast } from "@/components/Toast";
import {
  EditIcon,
  PackagesIcon,
  AlertIcon,
  RestoreIcon,
  WhatsAppIcon,
  RetryIcon,
  ReadOnlyIcon,
  RevealIcon,
  SignOutIcon,
  InviteIcon,
} from "@/core/ui/icons";
import { formatMinorWhole } from "@/core/money/format";
import { capitalizeBillingPeriod } from "@/core/text/billing-period";
import { formatZonedDate } from "@/core/dates/format";
import type { SubscriptionPanelView } from "./subscription-view";

type Panel = null | "subscription" | "suspend" | "reactivate" | "credits" | "retry" | "sessions-owner" | "sessions-all" | "impersonate" | "resend";

/** Warn tone: the accent at 8% over the paper, solid so the meter's tick gaps can match it exactly. */
const WARN_BG = "#f3e3d9";
const CALM_BG = "var(--sand)";


/**
 * The header's right-hand panel: the subscription at a glance (days left, a
 * meter of the elapsed period, the next step when something needs attention)
 * plus every gym-level action. One filled button for the common job, an icon
 * button for View as owner, and one "⋯" menu for the rest. Every privileged
 * action still goes through its own confirmation dialog and audited RPC.
 */
export function GymSubscriptionPanel({
  gym,
  packages,
  invitation,
  view,
}: {
  gym: GymDetail;
  packages: AssignablePackage[];
  invitation: OwnerInvitation | null;
  view: SubscriptionPanelView;
}) {
  const router = useRouter();
  const toast = useToast();
  const [panel, setPanel] = useState<Panel>(null);
  const [isPending, startTransition] = useConfirmedTransition('Resend the owner invitation for this gym?');
  const close = () => setPanel(null);

  const sub = gym.subscription;
  const packageLabel = sub?.packageName ?? "No package";
  const periodLabel = sub
    ? sub.priceMinor !== null
      ? `${capitalizeBillingPeriod(sub.billingPeriod)} · ${formatMinorWhole(sub.priceMinor, sub.currency ?? "INR")}`
      : "Trial"
    : "No subscription";
  const renewsLabel = sub?.currentPeriodEnd ? formatZonedDate(sub.currentPeriodEnd, IST_TIME_ZONE) : "—";

  const subscriptionGym: SubscriptionSheetGym = {
    organizationId: gym.id,
    name: gym.name,
    packageId: sub?.packageId ?? null,
    packageLabel,
    periodLabel,
    renewsLabel,
    isCancelled: gym.status === "Cancelled",
    isTrialing: gym.status === "Trialing",
    pending: sub?.pending
      ? {
          packageLabel: sub.pending.packageName ?? "Package",
          startsLabel: formatZonedDate(sub.pending.periodStart, IST_TIME_ZONE),
        }
      : null,
  };

  const canResend =
    invitation !== null &&
    (invitation.effectiveStatus === "invited" || invitation.effectiveStatus === "expired" || invitation.effectiveStatus === "email_verified");

  const menuItems: ActionMenuItem[] = [
    { key: "credits", label: "WhatsApp credits", icon: WhatsAppIcon, heading: "Operations", onSelect: () => setPanel("credits") },
    { key: "retry", label: "Retry failed operations", icon: RetryIcon, onSelect: () => setPanel("retry") },
    {
      key: "locks",
      label: "Lock operations",
      icon: ReadOnlyIcon,
      onSelect: () => router.push(`/admin/gyms/${gym.id}/operations?section=locks`),
    },
    { key: "edit", label: "Edit gym", icon: EditIcon, heading: "Gym", separated: true, onSelect: () => router.push(`/admin/gyms/${gym.id}/settings`) },
    {
      key: "resend",
      label: "Resend owner invitation",
      icon: InviteIcon,
      disabled: !canResend,
      hint: canResend ? undefined : "No pending invitation to resend",
      onSelect: () => setPanel("resend"),
    },
    { key: "logout-owner", label: "Force logout owner", icon: SignOutIcon, onSelect: () => setPanel("sessions-owner") },
    { key: "logout-all", label: "Force logout all users", icon: SignOutIcon, danger: true, onSelect: () => setPanel("sessions-all") },
    gym.status === "Suspended"
      ? { key: "unsuspend", label: "Unsuspend gym", icon: RestoreIcon, separated: true, onSelect: () => setPanel("reactivate") }
      : { key: "suspend", label: "Suspend gym", icon: AlertIcon, danger: true, separated: true, onSelect: () => setPanel("suspend") },
  ];

  function resend() {
    if (!invitation) return;
    startTransition(async () => {
      const { error } = await resendGymOwnerInvitation(invitation.id);
      if (error) {
        toast.error(error);
        return;
      }
      toast.success("Invitation resent.");
      close();
      router.refresh();
    });
  }

  const warn = view.tone === "warn";
  const { headline, meter } = view;
  const tickGap = warn ? WARN_BG : CALM_BG;

  return (
    <section
      aria-label="Subscription"
      style={{ backgroundColor: warn ? WARN_BG : CALM_BG }}
      className="flex min-w-0 flex-col gap-3.5 border-t-[1.5px] border-line p-4 md:p-5 lg:border-l-[1.5px] lg:border-t-0"
    >
      <div className="flex items-center justify-between gap-3 text-[9.5px] font-bold uppercase tracking-[0.14em] text-mute2">
        <span>Subscription</span>
        <span className="min-w-0 truncate tracking-[0.08em] text-ink2">{view.plan}</span>
      </div>

      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <span
            className={`font-display leading-[0.9] tracking-[-0.02em] ${headline.compact ? "text-[26px] md:text-[28px]" : "text-[38px] md:text-[44px]"} ${
              warn ? "text-accent" : "text-ink"
            }`}
          >
            {headline.value}
          </span>
          {headline.unit ? <span className="ml-1.5 text-[13px] font-bold text-ink2">{headline.unit}</span> : null}
        </div>
        {view.anchor ? (
          <p className="flex-shrink-0 text-right text-[12px] leading-snug text-mute">
            {view.anchor.label}
            <b className="block text-[13px] text-ink">{view.anchor.value}</b>
          </p>
        ) : null}
      </div>

      {meter ? (
        <div className="flex flex-col gap-1.5">
          <div
            role="progressbar"
            aria-label="Subscription period elapsed"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={meter.pct}
            className="relative h-1.5 bg-line"
          >
            <div className={`absolute inset-y-0 left-0 ${warn ? "bg-accent" : "bg-ink"}`} style={{ width: `${meter.pct}%` }} />
            {meter.ticks ? (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0"
                style={{
                  backgroundImage: `repeating-linear-gradient(90deg, transparent 0, transparent calc(100% / ${meter.ticks} - 1px), ${tickGap} calc(100% / ${meter.ticks} - 1px), ${tickGap} calc(100% / ${meter.ticks}))`,
                }}
              />
            ) : null}
          </div>
          <div className="flex justify-between gap-2 text-[10.5px] text-mute2">
            <span className="truncate">{meter.from}</span>
            <b className="flex-shrink-0 text-ink2">{meter.mid}</b>
            <span className="flex-shrink-0">{meter.to}</span>
          </div>
        </div>
      ) : null}

      {view.note ? (
        <p
          className={`border-l-2 pl-2.5 text-[11.5px] leading-relaxed ${
            view.noteMuted ? "border-mute3 text-mute" : "border-accent text-ink2"
          }`}
        >
          {view.note}
        </p>
      ) : null}

      <div className="mt-auto flex gap-2 pt-0.5">
        {view.primary === "reactivate" ? (
          <Button icon={RestoreIcon} type="button" onClick={() => setPanel("reactivate")} variant="primary" size="md" className="min-w-0 flex-1">
            <span className="truncate">Reactivate gym</span>
          </Button>
        ) : (
          <Button icon={PackagesIcon} type="button" onClick={() => setPanel("subscription")} variant="primary" size="md" className="min-w-0 flex-1">
            <span className="truncate">Manage subscription</span>
          </Button>
        )}
        <Button
          type="button"
          onClick={() => setPanel("impersonate")}
          aria-label="View as owner"
          title="View as owner"
          variant="secondary" size="md" iconOnly
        >
          <RevealIcon size={15} aria-hidden />
        </Button>
        <ActionMenu items={menuItems} ariaLabel="More actions" size="md" menuWidth={248} />
      </div>

      <ManageSubscriptionSheet open={panel === "subscription"} gym={subscriptionGym} packages={packages} onClose={close} />
      <SuspendSheet open={panel === "suspend"} organizationId={gym.id} name={gym.name} onClose={close} />
      <ReactivateConfirm open={panel === "reactivate"} organizationId={gym.id} name={gym.name} onClose={close} />

      <CreditsDialog open={panel === "credits"} organizationId={gym.id} gymName={gym.name} onClose={close} />
      <RetryDialog open={panel === "retry"} organizationId={gym.id} onClose={close} />
      <SessionsDialog
        open={panel === "sessions-owner" || panel === "sessions-all"}
        organizationId={gym.id}
        gymName={gym.name}
        scope={panel === "sessions-all" ? "all" : "owner"}
        onClose={close}
      />

      <ConfirmDialog
        open={panel === "resend"}
        title="Resend the owner invitation?"
        description="A fresh invitation email is sent to the owner and the 7-day expiry restarts. Any earlier link stops working."
        confirmLabel="Resend invitation"
        pending={isPending}
        onConfirm={resend}
        onCancel={close}
      />

      <Dialog open={panel === "impersonate"} onClose={close} eyebrow="View as gym owner" title="Not available yet">
        <div className="flex flex-col gap-3 text-[12.5px] leading-relaxed text-ink2">
          <p>
            Opening the gym exactly as its owner sees it needs a secure, audited session hand-off between this admin app and the gym app. That
            infrastructure does not exist yet, and it will not be faked with the owner&apos;s password or a borrowed login.
          </p>
          <p className="font-bold text-ink">What is required (documented in docs/gym-command-center.md):</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>A short-lived, single-use token minted server-side and bound to the admin and the gym.</li>
            <li>The gym app to honour it, show an “Admin impersonation” banner, and block anything the admin should not do.</li>
            <li>A session table recording start, end and actions, plus an Exit impersonation control.</li>
          </ul>
          <p>Until then, use the Members, Billing and Operations tabs here, which read the same data through audited, read-only views.</p>
          <div className="flex justify-end">
            <Button
              type="button"
              onClick={close}
              variant="primary" size="sm"
            >
              Got it
            </Button>
          </div>
        </div>
      </Dialog>
    </section>
  );
}
