"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { GymListRow, AssignablePackage } from "@/features/gyms/queries";
import { suspendGym, reactivateGym } from "@/features/gyms/actions";
import { ManageSubscriptionSheet, type SubscriptionSheetGym } from "@/features/gyms/ManageSubscriptionSheet";
import { ActionMenu, type ActionMenuItem } from "@/components/ActionMenu";
import { Sheet } from "@/components/Sheet";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";
import { useAdminEnvironment } from "@/core/env/context";
import { PackagesIcon, RestoreIcon, AlertIcon, UsageIcon, NextPageIcon } from "@/core/ui/icons";

/**
 * Section 11 of the task brief: "the existing Manage button should not
 * become overloaded" — clicking a gym's name/row opens the Gym Detail page
 * (page.tsx), and this ⋯ menu (the shared `ActionMenu`) holds the quick
 * actions instead of one button directly opening the subscription sheet the
 * way the old single-purpose button did. Dangerous actions (Suspend) sit below
 * a divider and require confirmation; Cancel's own confirmation lives inside
 * ManageSubscriptionSheet (shared with the Gym Detail header's identical
 * action).
 */
export function GymRowActions({ gym, packages }: { gym: GymListRow; packages: AssignablePackage[] }) {
  const router = useRouter();
  const [subscriptionSheetOpen, setSubscriptionSheetOpen] = useState(false);
  const [suspendSheetOpen, setSuspendSheetOpen] = useState(false);
  const [confirmReactivate, setConfirmReactivate] = useState(false);

  const isSuspended = gym.status === "Suspended";

  const subscriptionGym: SubscriptionSheetGym = {
    organizationId: gym.organizationId,
    name: gym.name,
    packageId: gym.packageId,
    packageLabel: gym.packageName,
    periodLabel: gym.period,
    renewsLabel: gym.renews,
    isCancelled: gym.status === "Cancelled",
    isTrialing: gym.status === "Trialing",
    // admin_gyms_list()/admin_gym_directory() (this row's own source) don't
    // carry the queued-package fields admin_gym_detail() does — the sheet
    // just won't show the "already queued" notice from this list-row entry
    // point; opening it from the Gym Detail page (gym-detail-actions.tsx)
    // shows the real one.
    pending: null,
  };

  const menuItems: ActionMenuItem[] = [
    { key: "view", label: "View gym", icon: NextPageIcon, onSelect: () => router.push(`/admin/gyms/${gym.organizationId}`) },
    {
      key: "subscription",
      label: gym.status === "Trialing" ? "Extend trial / manage" : "Manage subscription",
      icon: PackagesIcon,
      onSelect: () => setSubscriptionSheetOpen(true),
    },
    { key: "members", label: "View members", icon: UsageIcon, onSelect: () => router.push(`/admin/gyms/${gym.organizationId}/members`) },
    isSuspended
      ? { key: "reactivate", label: "Reactivate gym", icon: RestoreIcon, separated: true, onSelect: () => setConfirmReactivate(true) }
      : { key: "suspend", label: "Suspend gym", icon: AlertIcon, danger: true, separated: true, onSelect: () => setSuspendSheetOpen(true) },
  ];

  return (
    <>
      <ActionMenu ariaLabel={`Actions for ${gym.name}`} items={menuItems} />

      <ManageSubscriptionSheet
        key={gym.organizationId}
        open={subscriptionSheetOpen}
        gym={subscriptionGym}
        packages={packages}
        onClose={() => setSubscriptionSheetOpen(false)}
      />
      <SuspendSheet open={suspendSheetOpen} organizationId={gym.organizationId} name={gym.name} onClose={() => setSuspendSheetOpen(false)} />
      <ReactivateConfirm
        open={confirmReactivate}
        organizationId={gym.organizationId}
        name={gym.name}
        onClose={() => setConfirmReactivate(false)}
      />
    </>
  );
}

/** Shared by the Gyms list row menu and the Gym Detail header — both just
 * need an organizationId + display name, so this doesn't need its own
 * per-row-shape variant the way the subscription sheet did. */
export function SuspendSheet({
  open,
  organizationId,
  name,
  onClose,
}: {
  open: boolean;
  organizationId: string;
  name: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const environment = useAdminEnvironment();
  const [isPending, startTransition] = useTransition();
  const [reason, setReason] = useState("");
  const [prodConfirmText, setProdConfirmText] = useState("");

  const requiresTypedConfirm = environment === "prod";
  // A reason is mandatory for a suspension (Gym Command Center rule); the
  // server action refuses an empty one as well.
  const canSubmit = reason.trim().length >= 3 && (!requiresTypedConfirm || prodConfirmText.trim().toUpperCase() === "PRODUCTION");

  function confirm() {
    startTransition(async () => {
      const { error } = await suspendGym(organizationId, reason);
      if (error) {
        toast.error(error);
        return;
      }
      toast.success(`${name} suspended.`);
      setProdConfirmText("");
      onClose();
      router.refresh();
    });
  }

  return (
    <Sheet open={open} onClose={onClose} eyebrow="Blocks this gym independent of billing" title={`Suspend ${name}`}>
      <div className="flex flex-col gap-4">
        <p className="text-[12px] leading-relaxed text-mute">
          This flags the gym as suspended across the admin panel and records who suspended it and why. It does not
          itself change the gym&apos;s subscription state.
        </p>
        <label className="flex flex-col gap-1">
          <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-mute">Reason (required)</span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Shown in this gym's activity log"
            className="w-full resize-none border-[1.5px] border-line bg-paper px-2.5 py-2 text-[13px] text-ink outline-none focus:border-ink"
          />
        </label>
        {requiresTypedConfirm ? (
          <label className="flex flex-col gap-1.5">
            <span className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-accent">
              This is PRODUCTION. Type &quot;PRODUCTION&quot; to confirm
            </span>
            <input
              type="text"
              autoComplete="off"
              value={prodConfirmText}
              onChange={(e) => setProdConfirmText(e.target.value)}
              placeholder="PRODUCTION"
              className="w-full border-[1.5px] border-accent bg-paper px-2.5 py-2 text-[13px] font-bold text-ink outline-none"
            />
          </label>
        ) : null}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex min-h-[42px] flex-1 items-center justify-center border-[1.5px] border-line bg-paper text-[11.5px] font-bold uppercase tracking-[0.09em] text-ink transition-colors hover:border-ink hover:bg-sand"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isPending || !canSubmit}
            onClick={confirm}
            className="flex min-h-[42px] flex-1 items-center justify-center gap-1.5 bg-accent text-[11.5px] font-bold uppercase tracking-[0.09em] text-paper disabled:cursor-not-allowed disabled:opacity-50"
          >
            <AlertIcon size={13} aria-hidden />
            {isPending ? "Suspending…" : "Suspend gym"}
          </button>
        </div>
      </div>
    </Sheet>
  );
}

export function ReactivateConfirm({
  open,
  organizationId,
  name,
  onClose,
}: {
  open: boolean;
  organizationId: string;
  name: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      const { error } = await reactivateGym(organizationId);
      if (error) {
        toast.error(error);
        return;
      }
      toast.success(`${name} reactivated.`);
      onClose();
      router.refresh();
    });
  }

  return (
    <ConfirmDialog
      open={open}
      title={`Reactivate ${name}?`}
      description="Lifts the suspension. The gym's access then depends on its subscription state (active/grace/read-only) as usual."
      confirmLabel="Reactivate gym"
      pending={isPending}
      onConfirm={confirm}
      onCancel={onClose}
    />
  );
}
