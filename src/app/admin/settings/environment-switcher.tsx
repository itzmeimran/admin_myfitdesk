"use client";

import { useState, useTransition } from "react";
import { useAdminEnvironment } from "@/core/env/context";
import { setAdminEnvironment } from "@/core/env/actions";
import { ADMIN_ENVIRONMENTS, ADMIN_ENVIRONMENT_LABEL, type AdminEnvironment } from "@/core/config/environments";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";
import { DatabaseIcon, SpinnerIcon } from "@/core/ui/icons";
import { ICON_SIZE } from "@/core/ui/icon-size";

/**
 * The Settings page's DEV/PROD switch (task requirement §1/§2/§7). Reads
 * the active environment from `useAdminEnvironment()` (seeded server-side
 * from the `admin-env` cookie — see core/env/context.tsx) and writes a new
 * one through the `setAdminEnvironment` Server Action (core/env/actions.ts).
 *
 * Switching to DEV is a single click; switching to PROD (§5 "Safety for
 * PROD") requires an extra ConfirmDialog step where the admin has to type
 * "PROD" — the same `requireTypedConfirmation` gate used on this app's other
 * dangerous actions once the environment is already PROD, applied here to
 * the act of entering PROD in the first place.
 *
 * On success this does a **hard browser reload** (`window.location.assign`),
 * not a client-side `router.refresh()`/`redirect()`. That's deliberate, not
 * an oversight: a full reload is the only way to guarantee zero DEV state
 * (Next.js's Router Cache, any component's in-memory state, an in-flight
 * request that was already reading the old project) survives into the PROD
 * render, and vice versa — see the task's requirement §3 ("Prevent Data
 * Mixing"). The brief moment between clicking and the browser actually
 * navigating is covered by the `switching` overlay below; the destination
 * page's own `loading.tsx` (src/app/admin/*\/loading.tsx) takes over once
 * navigation completes.
 */
export function EnvironmentSwitcher() {
  const environment = useAdminEnvironment();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const [confirmTarget, setConfirmTarget] = useState<AdminEnvironment | null>(null);
  const [switching, setSwitching] = useState<AdminEnvironment | null>(null);

  function requestSwitch(target: AdminEnvironment) {
    if (target === environment || isPending || switching) return;
    if (target === "prod") {
      setConfirmTarget(target);
      return;
    }
    performSwitch(target);
  }

  function performSwitch(target: AdminEnvironment) {
    setConfirmTarget(null);
    setSwitching(target);
    startTransition(async () => {
      const { error } = await setAdminEnvironment(target);
      if (error) {
        toast.error(error);
        setSwitching(null);
        return;
      }
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- deliberate hard reload, not a soft navigation; see this file's docblock.
      window.location.assign("/admin/settings");
    });
  }

  return (
    <div className="flex flex-col gap-3 border-[1.5px] border-line bg-paper p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.12em] text-mute">
            <DatabaseIcon size={12} aria-hidden />
            Environment
          </span>
          <p className="max-w-md text-[12.5px] leading-relaxed text-mute">
            Every page, query and mutation in this dashboard — gyms, members, packages, payments,
            reports, logs — reads and writes whichever Supabase project is selected here.
          </p>
        </div>
        <span
          className={`flex h-[26px] flex-shrink-0 items-center border-[1.5px] px-2.5 text-[10.5px] font-bold uppercase tracking-[0.08em] ${
            environment === "prod" ? "border-accent bg-accent/10 text-accent" : "border-line bg-sand text-mute"
          }`}
        >
          Currently: {ADMIN_ENVIRONMENT_LABEL[environment]}
        </span>
      </div>

      <div className="flex gap-2">
        {ADMIN_ENVIRONMENTS.map((env) => {
          const active = env === environment;
          const isProd = env === "prod";
          return (
            <button
              key={env}
              type="button"
              aria-pressed={active}
              disabled={Boolean(switching)}
              onClick={() => requestSwitch(env)}
              className={`press-scale flex min-h-[42px] flex-1 items-center justify-center gap-2 border-[1.5px] text-[12px] font-bold uppercase tracking-[0.08em] disabled:cursor-wait disabled:opacity-70 ${
                active
                  ? isProd
                    ? "border-accent bg-accent text-paper"
                    : "border-ink bg-ink text-hi"
                  : "border-line bg-paper text-ink hover:border-ink"
              }`}
            >
              {switching === env ? <SpinnerIcon size={ICON_SIZE.button} className="animate-spin" aria-hidden /> : null}
              {ADMIN_ENVIRONMENT_LABEL[env]}
            </button>
          );
        })}
      </div>

      <p className="text-[11px] leading-relaxed text-mute3">
        Your selection is remembered across refreshes (a year-long cookie, this browser only).
        Switching triggers a full reload so nothing from the previous environment stays on screen.
      </p>

      {switching ? (
        <div
          role="status"
          aria-live="assertive"
          className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-3 bg-ink/90 text-paper"
        >
          <SpinnerIcon size={28} className="animate-spin" aria-hidden />
          <p className="text-[13px] font-bold uppercase tracking-[0.1em]">
            Switching to {ADMIN_ENVIRONMENT_LABEL[switching]}…
          </p>
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmTarget !== null}
        danger
        title="Switch to Production?"
        description="This dashboard will start reading and writing the live PRODUCTION Supabase project — real gyms, members, subscriptions and payments. Make sure that's what you mean to do."
        confirmLabel="Switch to Production"
        pending={Boolean(switching)}
        requireTypedConfirmation="PROD"
        onConfirm={() => confirmTarget && performSwitch(confirmTarget)}
        onCancel={() => setConfirmTarget(null)}
      />
    </div>
  );
}
