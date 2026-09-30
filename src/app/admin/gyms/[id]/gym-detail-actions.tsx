"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
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
  ExtendIcon,
  WhatsAppIcon,
  RetryIcon,
  ReadOnlyIcon,
  RevealIcon,
  SignOutIcon,
  InviteIcon,
  ArchiveIcon,
  MoreIcon,
} from "@/core/ui/icons";
import { formatMinorWhole } from "@/core/money/format";
import { capitalizeBillingPeriod } from "@/core/text/billing-period";

type Panel = null | "subscription" | "suspend" | "reactivate" | "credits" | "retry" | "sessions-owner" | "sessions-all" | "impersonate" | "resend";

const PRIMARY =
  "flex min-h-[38px] items-center gap-1.5 border-[1.5px] border-ink bg-paper px-3 text-[11px] font-bold uppercase tracking-[0.08em] text-ink hover:bg-sand";

/**
 * Header quick actions. Primary: View as owner, Manage subscription, WhatsApp
 * credits, Retry failed operations, Lock operations. Everything rarer sits in
 * "More actions". Every privileged action goes through AdminActionDialog
 * (impact text + mandatory reason + explicit confirm) and an audited RPC.
 */
export function GymDetailActions({
  gym,
  packages,
  invitation,
}: {
  gym: GymDetail;
  packages: AssignablePackage[];
  invitation: OwnerInvitation | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [panel, setPanel] = useState<Panel>(null);
  const [isPending, startTransition] = useTransition();
  const close = () => setPanel(null);

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
    isTrialing: gym.status === "Trialing",
    pending: sub?.pending
      ? {
          packageLabel: sub.pending.packageName ?? "Package",
          startsLabel: new Date(sub.pending.periodStart).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }),
        }
      : null,
  };

  const canResend =
    invitation !== null &&
    (invitation.effectiveStatus === "invited" || invitation.effectiveStatus === "expired" || invitation.effectiveStatus === "email_verified");

  const moreItems: ActionMenuItem[] = [
    { key: "extend", label: gym.status === "Trialing" ? "Extend trial" : "Extend access", icon: ExtendIcon, onSelect: () => setPanel("subscription") },
    { key: "activate", label: gym.status === "Trialing" ? "Activate subscription" : "Change package", icon: PackagesIcon, onSelect: () => setPanel("subscription") },
    { key: "cancel", label: "Cancel / restore subscription", icon: RestoreIcon, onSelect: () => setPanel("subscription") },
    { key: "edit", label: "Edit gym", icon: EditIcon, onSelect: () => router.push(`/admin/gyms/${gym.id}/settings`), separated: true },
    {
      key: "resend",
      label: "Resend owner invitation",
      icon: InviteIcon,
      disabled: !canResend,
      hint: canResend ? undefined : "No pending invitation to resend",
      onSelect: () => setPanel("resend"),
    },
    {
      key: "otp",
      label: "Trigger owner login / OTP",
      icon: InviteIcon,
      disabled: true,
      hint: "Sign-in codes are issued by the gym app itself",
      onSelect: () => undefined,
    },
    { key: "logout-owner", label: "Force logout owner", icon: SignOutIcon, onSelect: () => setPanel("sessions-owner"), separated: true },
    { key: "logout-all", label: "Force logout all users", icon: SignOutIcon, onSelect: () => setPanel("sessions-all"), danger: true },
    gym.status === "Suspended"
      ? { key: "unsuspend", label: "Unsuspend gym", icon: RestoreIcon, onSelect: () => setPanel("reactivate") }
      : { key: "suspend", label: "Suspend gym", icon: AlertIcon, onSelect: () => setPanel("suspend"), danger: true },
    {
      key: "archive",
      label: "Archive gym",
      icon: ArchiveIcon,
      disabled: true,
      hint: "Not supported — suspend the gym instead",
      onSelect: () => undefined,
    },
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

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={() => setPanel("impersonate")} className={PRIMARY}>
          <RevealIcon size={14} aria-hidden />
          View as owner
        </button>
        <button type="button" onClick={() => setPanel("subscription")} className="flex min-h-[38px] items-center gap-1.5 bg-ink px-3 text-[11px] font-bold uppercase tracking-[0.08em] text-hi">
          <PackagesIcon size={14} aria-hidden />
          Manage subscription
        </button>
        <button type="button" onClick={() => setPanel("credits")} className={PRIMARY}>
          <WhatsAppIcon size={14} aria-hidden />
          WhatsApp credits
        </button>
        <button type="button" onClick={() => setPanel("retry")} className={PRIMARY}>
          <RetryIcon size={14} aria-hidden />
          Retry failed
        </button>
        <Link href={`/admin/gyms/${gym.id}/operations?section=locks`} className={PRIMARY}>
          <ReadOnlyIcon size={14} aria-hidden />
          Lock operations
        </Link>
        <span className="flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-[0.08em] text-mute">
          <MoreIcon size={14} aria-hidden />
          <ActionMenu items={moreItems} ariaLabel="More actions" />
        </span>
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
            <button type="button" onClick={close} className="min-h-[38px] bg-ink px-4 text-[11px] font-bold uppercase tracking-[0.09em] text-hi">
              Got it
            </button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
