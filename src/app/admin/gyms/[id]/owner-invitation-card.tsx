"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";
import { resendGymOwnerInvitation, revokeGymOwnerInvitation } from "../invite-actions";
import { OWNER_INVITATION_STATUS_LABEL, type OwnerInvitation } from "@/features/gyms/onboarding-types";
import { AlertIcon, ExtendIcon } from "@/core/ui/icons";

const TONE: Record<OwnerInvitation["effectiveStatus"], string> = {
  invited: "border-line text-ink",
  email_verified: "border-ink text-ink",
  active: "border-ink bg-ink text-hi",
  expired: "border-accent bg-accent/8 text-accent",
  revoked: "border-accent bg-accent/8 text-accent",
};

/**
 * Onboarding-status card for the Gym Detail header (task brief §6: "show
 * clearly — Invitation Sent → Email Verified → Account Active" plus expired/
 * revoked/resend handling). Reads `admin_get_gym_owner_invitation()`
 * (supabase/migrations/1012_gym_owner_onboarding.sql), which reuses
 * FitDeskApp's own `staff_invitations` table (role='owner') — see that
 * migration's header for why this is reuse, not a parallel system.
 */
export function OwnerInvitationCard({ invitation }: { invitation: OwnerInvitation }) {
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  const canResend = invitation.effectiveStatus === "invited" || invitation.effectiveStatus === "expired" || invitation.effectiveStatus === "email_verified";
  const canRevoke = invitation.status === "pending";

  function resend() {
    startTransition(async () => {
      const { error } = await resendGymOwnerInvitation(invitation.id);
      if (error) {
        toast.error(error);
        return;
      }
      toast.success("Invitation resent.");
      router.refresh();
    });
  }

  function revoke() {
    startTransition(async () => {
      const { error } = await revokeGymOwnerInvitation(invitation.id);
      setConfirmRevoke(false);
      if (error) {
        toast.error(error);
        return;
      }
      toast.success("Invitation revoked.");
      router.refresh();
    });
  }

  return (
    <div className={`flex flex-wrap items-center gap-3 border-[1.5px] p-3.5 ${TONE[invitation.effectiveStatus]}`}>
      <span
        aria-hidden="true"
        className="flex h-8 w-8 flex-shrink-0 items-center justify-center border-[1.5px] border-current"
      >
        <AlertIcon size={16} aria-hidden />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[13px] font-bold">
          Owner onboarding — {OWNER_INVITATION_STATUS_LABEL[invitation.effectiveStatus]}
        </span>
        <span className="text-[12px] leading-relaxed opacity-90">
          {invitation.email}
          {invitation.effectiveStatus === "expired" ? " · the link expired, use Resend to send a fresh one." : null}
          {invitation.effectiveStatus === "revoked" ? " · this invitation was revoked." : null}
          {invitation.effectiveStatus === "invited" ? ` · sent ${new Date(invitation.invitedAt).toLocaleDateString("en-IN")}` : null}
          {invitation.resendCount > 0 ? ` · resent ${invitation.resendCount}×` : null}
        </span>
      </span>
      {canResend ? (
        <button
          type="button"
          disabled={isPending}
          onClick={resend}
          className="flex min-h-[34px] items-center gap-1.5 border-[1.5px] border-current px-3 text-[11px] font-bold uppercase tracking-[0.08em] disabled:cursor-wait disabled:opacity-60"
        >
          <ExtendIcon size={13} aria-hidden />
          {isPending ? "Sending…" : "Resend invitation"}
        </button>
      ) : null}
      {canRevoke ? (
        <button
          type="button"
          disabled={isPending}
          onClick={() => setConfirmRevoke(true)}
          className="flex min-h-[34px] items-center px-3 text-[11px] font-bold uppercase tracking-[0.08em] underline underline-offset-2"
        >
          Revoke
        </button>
      ) : null}

      <ConfirmDialog
        open={confirmRevoke}
        title="Revoke this invitation?"
        description="The owner will no longer be able to use this invitation link. The gym itself is unaffected — you can invite a different email afterward."
        confirmLabel="Revoke invitation"
        danger
        pending={isPending}
        onConfirm={revoke}
        onCancel={() => setConfirmRevoke(false)}
      />
    </div>
  );
}
