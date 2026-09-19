"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { GymListRow, AssignablePackage } from "@/features/gyms/queries";
import { suspendGym, reactivateGym } from "@/features/gyms/actions";
import { ManageSubscriptionSheet, type SubscriptionSheetGym } from "@/features/gyms/ManageSubscriptionSheet";
import { Sheet } from "@/components/Sheet";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";
import { useAdminEnvironment } from "@/core/env/context";
import { ManageIcon, PackagesIcon, RestoreIcon, AlertIcon, UsageIcon, NextPageIcon } from "@/core/ui/icons";

/**
 * Section 11 of the task brief: "the existing Manage button should not
 * become overloaded" — clicking a gym's name/row opens the Gym Detail page
 * (page.tsx), and this Manage button is a dropdown of quick actions instead
 * of directly opening the subscription sheet the way the old single-purpose
 * button did. Dangerous actions (Suspend) sit below a divider and require
 * confirmation; Cancel's own confirmation lives inside
 * ManageSubscriptionSheet (shared with the Gym Detail header's identical
 * action).
 */
export function GymRowActions({ gym, packages }: { gym: GymListRow; packages: AssignablePackage[] }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [subscriptionSheetOpen, setSubscriptionSheetOpen] = useState(false);
  const [suspendSheetOpen, setSuspendSheetOpen] = useState(false);
  const [confirmReactivate, setConfirmReactivate] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [menuOpen]);

  const isSuspended = gym.status === "Suspended";

  const subscriptionGym: SubscriptionSheetGym = {
    organizationId: gym.organizationId,
    name: gym.name,
    packageId: gym.packageId,
    packageLabel: gym.packageName,
    periodLabel: gym.period,
    renewsLabel: gym.renews,
    isCancelled: gym.status === "Cancelled",
    // admin_gyms_list()/admin_gym_directory() (this row's own source) don't
    // carry the queued-package fields admin_gym_detail() does — the sheet
    // just won't show the "already queued" notice from this list-row entry
    // point; opening it from the Gym Detail page (gym-detail-actions.tsx)
    // shows the real one.
    pending: null,
  };

  return (
    <div className="relative inline-block" ref={menuRef}>
      <button
        type="button"
        onClick={() => setMenuOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        className="inline-flex min-h-[30px] items-center gap-1.5 border-[1.5px] border-line px-2.5 text-[11px] font-bold text-ink"
      >
        <ManageIcon size={13} aria-hidden />
        Manage
      </button>

      {menuOpen ? (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+4px)] z-20 flex w-56 flex-col border-[1.5px] border-ink bg-paper py-1 text-left shadow-lg"
        >
          <Link
            href={`/admin/gyms/${gym.organizationId}`}
            role="menuitem"
            onClick={() => setMenuOpen(false)}
            className="flex items-center gap-2 px-3 py-2 text-[12px] font-bold text-ink hover:bg-sand"
          >
            <NextPageIcon size={13} aria-hidden />
            View gym
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setSubscriptionSheetOpen(true);
              setMenuOpen(false);
            }}
            className="flex items-center gap-2 px-3 py-2 text-left text-[12px] font-bold text-ink hover:bg-sand"
          >
            <PackagesIcon size={13} aria-hidden />
            Manage subscription
          </button>
          <Link
            href={`/admin/gyms/${gym.organizationId}/members`}
            role="menuitem"
            onClick={() => setMenuOpen(false)}
            className="flex items-center gap-2 px-3 py-2 text-[12px] font-bold text-ink hover:bg-sand"
          >
            <UsageIcon size={13} aria-hidden />
            View members
          </Link>
          <div className="my-1 border-t border-line" />
          {isSuspended ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setConfirmReactivate(true);
                setMenuOpen(false);
              }}
              className="flex items-center gap-2 px-3 py-2 text-left text-[12px] font-bold text-ink hover:bg-sand"
            >
              <RestoreIcon size={13} aria-hidden />
              Reactivate gym
            </button>
          ) : (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setSuspendSheetOpen(true);
                setMenuOpen(false);
              }}
              className="flex items-center gap-2 px-3 py-2 text-left text-[12px] font-bold text-accent hover:bg-accent/8"
            >
              <AlertIcon size={13} aria-hidden />
              Suspend gym
            </button>
          )}
        </div>
      ) : null}

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
    </div>
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
  const canSubmit = !requiresTypedConfirm || prodConfirmText.trim().toUpperCase() === "PROD";

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
          <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-mute">Reason (optional)</span>
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
              This is PRODUCTION. Type &quot;PROD&quot; to confirm
            </span>
            <input
              type="text"
              autoComplete="off"
              value={prodConfirmText}
              onChange={(e) => setProdConfirmText(e.target.value)}
              placeholder="PROD"
              className="w-full border-[1.5px] border-accent bg-paper px-2.5 py-2 text-[13px] font-bold text-ink outline-none"
            />
          </label>
        ) : null}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex min-h-[42px] flex-1 items-center justify-center border-[1.5px] border-line bg-paper text-[11.5px] font-bold uppercase tracking-[0.09em] text-ink"
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
