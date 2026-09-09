"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import type { PlatformAdminRow } from "@/features/settings/queries";
import {
  grantPlatformAdmin,
  revokePlatformAdmin,
  reactivatePlatformAdmin,
  type GrantAdminFormState,
} from "@/features/settings/actions";
import { useToast } from "@/components/Toast";
import { pillTone, PILL_CLASS } from "@/core/ui/status-style";
import { InviteIcon, RevokeIcon, RestoreIcon, ConfirmIcon } from "@/core/ui/icons";
import { ICON_SIZE } from "@/core/ui/icon-size";
import { formatShortDate } from "@/core/dates/format";

/**
 * Admin roster — the one Settings feature built out of the design's 4
 * candidates (CLAUDE.md's Plan, P2 #8: grace-period default, invoice
 * prefix, webhook endpoints, admin accounts — product owner chose admin
 * accounts). Grace-period default/invoice prefix/webhook endpoints remain
 * undecided and unbuilt.
 *
 * Granting only works for an email that already has a Supabase Auth
 * account — see 1007_admin_roster_rpcs.sql's header for why a brand-new
 * account still needs scripts/grant-platform-admin.mjs (creating a GoTrue
 * user needs the service-role Admin API, unreachable from a plain
 * SECURITY DEFINER function).
 */
export function SettingsView({ admins }: { admins: PlatformAdminRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  function runRowAction(userId: string, action: () => Promise<{ error: string | null }>, successMessage: string) {
    setBusyUserId(userId);
    startTransition(async () => {
      const { error } = await action();
      setBusyUserId(null);
      if (error) {
        toast.error(error);
        return;
      }
      toast.success(successMessage);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-[24px] tracking-[-0.02em] md:text-[26px]">Settings</h1>
        <p className="text-[12.5px] text-mute">
          Platform admins — who can reach this dashboard. Grace-period default, invoice prefix and
          webhook endpoints aren&apos;t built yet.
        </p>
      </div>

      <GrantAdminForm onGranted={() => router.refresh()} />

      <div className="overflow-x-auto border-[1.5px] border-line">
        <table className="w-full min-w-[560px] border-collapse text-[12.5px]">
          <thead>
            <tr className="border-b-[1.5px] border-line bg-sand text-left text-[10px] font-bold uppercase tracking-[0.1em] text-mute">
              <th className="px-3 py-2.5">Email</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="px-3 py-2.5">Granted</th>
              <th className="px-3 py-2.5">Granted by</th>
              <th className="px-3 py-2.5 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {admins.map((admin) => {
              const status = admin.revokedAt ? "Revoked" : "Active";
              const busy = isPending && busyUserId === admin.userId;
              return (
                <tr key={admin.userId} className="border-b border-line last:border-b-0">
                  <td className="px-3 py-2.5 font-medium text-ink">
                    {admin.email}
                    {admin.isSelf ? <span className="ml-1.5 text-[10.5px] text-mute3">(you)</span> : null}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={PILL_CLASS} style={pillTone(status)}>
                      {status}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-mute">{formatShortDate(new Date(admin.grantedAt))}</td>
                  <td className="px-3 py-2.5 text-mute">{admin.grantedByEmail ?? "—"}</td>
                  <td className="px-3 py-2.5 text-right">
                    {admin.revokedAt ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          runRowAction(
                            admin.userId,
                            () => reactivatePlatformAdmin(admin.email),
                            `${admin.email} reactivated.`,
                          )
                        }
                        className="press-scale inline-flex min-h-[32px] items-center gap-1.5 border-[1.5px] border-line px-2.5 text-[11px] font-bold disabled:cursor-wait disabled:opacity-60"
                      >
                        <RestoreIcon size={13} aria-hidden />
                        {busy ? "Working…" : "Reactivate"}
                      </button>
                    ) : admin.isSelf ? (
                      <span className="text-[11px] text-mute3" title="You cannot revoke your own admin access.">
                        —
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          runRowAction(
                            admin.userId,
                            () => revokePlatformAdmin(admin.userId),
                            `${admin.email} revoked.`,
                          )
                        }
                        className="press-scale inline-flex min-h-[32px] items-center gap-1.5 border-[1.5px] border-line px-2.5 text-[11px] font-bold text-accent disabled:cursor-wait disabled:opacity-60"
                      >
                        <RevokeIcon size={13} aria-hidden />
                        {busy ? "Working…" : "Revoke"}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="max-w-2xl text-[11.5px] leading-relaxed text-mute3">
        Every grant/revoke lands a row in admin_audit_log. Revoking is soft — the row stays for the
        audit trail, and reactivating restores it. You cannot revoke your own access, to avoid
        locking yourself out with no recovery flow.
      </p>
    </div>
  );
}

const initialGrantState: GrantAdminFormState = { error: null };

function GrantAdminForm({ onGranted }: { onGranted: () => void }) {
  const toast = useToast();
  const [state, formAction, isPending] = useActionState(grantPlatformAdmin, initialGrantState);
  const [lastHandledState, setLastHandledState] = useState(initialGrantState);
  const [emailInput, setEmailInput] = useState("");

  if (state !== lastHandledState) {
    setLastHandledState(state);
    if (state.error) {
      toast.error(state.error);
    } else if (state !== initialGrantState) {
      toast.success(`${emailInput || "Admin"} granted access.`);
      setEmailInput("");
      onGranted();
    }
  }

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3 border-[1.5px] border-line bg-paper p-4">
      <label className="flex min-w-[240px] flex-1 flex-col gap-1">
        <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-mute">
          Grant admin access<span className="text-accent"> *</span>
        </span>
        <input
          type="email"
          name="email"
          value={emailInput}
          onChange={(e) => setEmailInput(e.target.value)}
          placeholder="teammate@myfitdesk.app"
          required
          className="w-full border-[1.5px] border-line bg-paper px-2.5 py-2 text-[13px] text-ink outline-none focus:border-ink"
        />
        <span className="text-[10.5px] text-mute3">
          Must already have signed in once — a brand-new admin still needs scripts/grant-platform-admin.mjs.
        </span>
      </label>
      <button
        type="submit"
        disabled={isPending}
        className="press-scale flex min-h-[40px] items-center gap-2 bg-ink px-3.5 text-[11.5px] font-bold uppercase tracking-[0.09em] text-hi disabled:cursor-wait disabled:opacity-70"
      >
        {isPending ? <ConfirmIcon size={ICON_SIZE.button} aria-hidden /> : <InviteIcon size={ICON_SIZE.button} aria-hidden />}
        {isPending ? "Granting…" : "Grant access"}
      </button>
    </form>
  );
}
