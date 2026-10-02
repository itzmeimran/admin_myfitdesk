"use client";

import { Button } from "@/components/Button";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { signOutAllOtherAdmins } from "@/features/settings/admin-actions";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";
import { useAdminEnvironment } from "@/core/env/context";
import { ADMIN_ENVIRONMENT_LABEL } from "@/core/config/environments";
import { SignOutIcon } from "@/core/ui/icons";
import { SettingsCard } from "../_components/ui";

/**
 * The one genuinely dangerous PLATFORM action that exists today: end every
 * other platform admin's session on this environment (a lost laptop, a
 * suspected compromise). Your own session survives. It is recorded in the
 * access history. Everything else destructive (restore a backup, maintenance
 * mode) already has its own guarded home in Recovery and is deliberately NOT
 * duplicated here.
 */
export function DangerZone() {
  const router = useRouter();
  const toast = useToast();
  const environment = useAdminEnvironment();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const label = ADMIN_ENVIRONMENT_LABEL[environment];

  function run(confirmation: string) {
    startTransition(async () => {
      const result = await signOutAllOtherAdmins(confirmation);
      setOpen(false);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(result.revoked === 0 ? "No other admin sessions were active." : `Ended ${result.revoked} other admin session${result.revoked === 1 ? "" : "s"}.`);
      router.refresh();
    });
  }

  return (
    <>
      <SettingsCard
        tone="danger"
        title="Danger zone"
        description={`Emergency controls for the ${label} environment. These take effect immediately and are recorded in the access history.`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-[1.5px] border-accent/40 p-3.5">
          <div className="flex max-w-xl flex-col gap-1">
            <span className="text-[13.5px] font-bold text-ink">Sign out all other admins</span>
            <span className="text-[12px] leading-relaxed text-mute">
              Ends every other platform admin&apos;s session on {label}. They keep their role and can sign in again; use
              Suspend or Revoke on the Admins tab to remove someone&apos;s access. Your own session is not affected.
            </span>
          </div>
          <Button icon={SignOutIcon} type="button" disabled={isPending} onClick={() => setOpen(true)} variant="danger-secondary" size="sm" >
             Sign out others
          </Button>
        </div>
      </SettingsCard>

      <ConfirmDialog
        open={open}
        danger
        title={`Sign out all other ${label} admins?`}
        description="Every other platform admin on this environment is signed out right away. This cannot be undone, but they can sign back in."
        confirmLabel="Sign them out"
        pending={isPending}
        requireTypedConfirmation={environment === "prod" ? "PRODUCTION" : undefined}
        onConfirm={run}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}
