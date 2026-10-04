"use client";

import { Button } from "@/components/Button";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sheet } from "@/components/Sheet";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Dropdown } from "@/components/Dropdown";
import { useToast } from "@/components/Toast";
import { SkeletonBlock } from "@/components/Skeleton";
import { changeAdminRole, changeAdminStatus, changeSalesTeam, loadAdminDetail } from "@/features/settings/admin-actions";
import { resendPlatformAdminInvite } from "../_server/invite-actions";
import type { AdminDetail, PlatformAdminRow, PlatformRole } from "@/features/settings/admins";
import { ADMIN_STATUS_LABEL } from "@/core/auth/permissions";
import type { AdminEnvironment } from "@/core/config/environments";
import { ADMIN_ENVIRONMENT_LABEL } from "@/core/config/environments";
import { useAdminEnvironment } from "@/core/env/context";
import { RestoreIcon, RevokeIcon, SuspendIcon, InviteIcon } from "@/core/ui/icons";
import { HINT_CLASS, LABEL_CLASS, StatusPill, formatWhen, timeAgo } from "../_components/ui";
import { EnvAccessSummary } from "./env-access-cell";

type Pending =
  | { kind: 'team'; team: string }
  | { kind: "role"; role: string }
  | { kind: "suspend" }
  | { kind: "reactivate" }
  | { kind: "revoke" }
  | { kind: "resend" };

const CONFIRM_COPY: Record<Pending["kind"], { title: (who: string) => string; body: string; label: string; danger: boolean }> = {
  team: {title:who=>`Change ${who}'s sales team?`,body:'Sales managers see leads assigned within their team. This change is recorded in the audit log.',label:'Change team',danger:true},
  role: {
    title: (who) => `Change ${who}'s role?`,
    body: "Their permissions change immediately. Role changes are recorded in the access history.",
    label: "Change role",
    danger: true,
  },
  suspend: {
    title: (who) => `Suspend ${who}?`,
    body: "They lose access right away and are signed out. You can reactivate them later.",
    label: "Suspend",
    danger: true,
  },
  reactivate: {
    title: (who) => `Reactivate ${who}?`,
    body: "They regain access with their current role.",
    label: "Reactivate",
    danger: false,
  },
  revoke: {
    title: (who) => `Revoke ${who}'s access?`,
    body: "They lose access right away and are signed out. The record is kept for the audit trail.",
    label: "Revoke access",
    danger: true,
  },
  resend: {
    title: (who) => `Resend the invitation to ${who}?`,
    body: "This issues a fresh link and restarts the 7-day window.",
    label: "Resend invitation",
    danger: false,
  },
};

export function AdminDrawer({
  admin,
  roles,
  otherEnvironment,
  otherStatus,
  canManage,
  onClose,
}: {
  admin: PlatformAdminRow | null;
  roles: PlatformRole[];
  otherEnvironment: AdminEnvironment;
  otherStatus: string;
  canManage: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const environment = useAdminEnvironment();
  const [detail, setDetail] = useState<AdminDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [newRole, setNewRole] = useState("");
  const [newTeam,setNewTeam]=useState('');
  const [reason, setReason] = useState("");
  const [pendingAction, setPendingAction] = useState<Pending | null>(null);
  const [isPending, startTransition] = useTransition();

  // Load the exact-timestamp detail whenever a different admin is opened.
  const userId = admin?.userId ?? null;
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset before the fetch for a newly opened admin; the sheet opens/closes without remounting this component
    setDetail(null);
    setDetailError(null);
    setLoadedFor(null);
    loadAdminDetail(userId).then((result) => {
      if (cancelled) return;
      setDetail(result.detail);
      setNewTeam(result.detail?.salesTeam??'');
      setDetailError(result.error);
      setLoadedFor(userId);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reseed the role picker and reason when a different admin is opened
    setNewRole(admin?.role ?? "");
    setReason("");
  }, [admin?.userId, admin?.role]);

  const loading = Boolean(userId) && loadedFor !== userId;
  const who = admin?.displayName || admin?.email || "this admin";

  function run(confirmation: string) {
    if (!admin || !pendingAction) return;
    const action = pendingAction;
    startTransition(async () => {
      let error: string | null = null;
      let message = "Done.";
      if(action.kind === 'team') {
        ({error}=await changeSalesTeam(admin.userId,action.team,confirmation));
        message=`Sales team updated for ${who}.`;
      } else if (action.kind === "role") {
        ({ error } = await changeAdminRole(admin.userId, action.role, confirmation));
        message = `${who} is now ${roles.find((r) => r.role === action.role)?.label ?? action.role}.`;
      } else if (action.kind === "resend") {
        const result = await resendPlatformAdminInvite(admin.email, admin.role, confirmation);
        error = result.error ?? (result.results[0]?.ok === false ? result.results[0].message : null);
        message = result.results[0]?.message ?? "Invitation resent.";
        if (result.results[0]?.manualLink) {
          try {
            await navigator.clipboard.writeText(result.results[0].manualLink);
            message += " The link was copied to your clipboard.";
          } catch {
            // clipboard unavailable — the message above still says what happened
          }
        }
      } else {
        ({ error } = await changeAdminStatus(admin.userId, action.kind, reason, confirmation));
        message = action.kind === "suspend" ? `${who} suspended.` : action.kind === "revoke" ? `${who}'s access revoked.` : `${who} reactivated.`;
      }
      setPendingAction(null);
      if (error) {
        toast.error(error);
        return;
      }
      toast.success(message);
      router.refresh();
      onClose();
    });
  }

  const canReactivate = admin && (admin.status === "suspended" || admin.status === "revoked") && admin.activatedAt;
  const canResend = admin && (admin.status === "pending" || admin.status === "expired" || (admin.status === "revoked" && !admin.activatedAt));
  const canSuspend = admin && admin.status === "active" && !admin.isSelf;
  const canRevoke = admin && admin.status !== "revoked" && !admin.isSelf;

  return (
    <>
      <Sheet
        open={admin !== null}
        onClose={onClose}
        eyebrow="Platform admin"
        title={admin?.displayName || admin?.email || ""}
        maxWidthClassName="md:max-w-xl"
        maxHeightClassName="max-h-[92%]"
      >
        {admin ? (
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill label={ADMIN_STATUS_LABEL[admin.status]} />
              <span className="text-[12px] font-bold text-ink">{admin.roleLabel}</span>
              {admin.isSelf ? <span className="text-[11px] text-mute3">(you)</span> : null}
            </div>

            <dl className="grid gap-x-4 gap-y-3 text-[12.5px] sm:grid-cols-2">
              <Item label="Email" value={admin.email} />
              <Item label="Environment access">
                <EnvAccessSummary
                  current={environment}
                  currentStatus={admin.status}
                  other={otherEnvironment}
                  otherStatus={otherStatus}
                />
              </Item>
              <Item label={admin.status === "pending" || admin.status === "expired" ? "Invited" : "Granted"} value={formatWhen(admin.invitedAt ?? admin.grantedAt)} />
              {admin.status === "pending" || admin.status === "expired" ? (
                <Item label="Invitation expires" value={formatWhen(admin.inviteExpiresAt)} />
              ) : (
                <Item label="Activated" value={formatWhen(admin.activatedAt)} />
              )}
              <Item label="Granted by" value={admin.grantedByEmail ?? "—"} />
              <Item label="Last sign-in" value={admin.lastSignInAt ? `${formatWhen(admin.lastSignInAt)} (${timeAgo(admin.lastSignInAt)})` : "Never"} />
              <Item label="Last active" value={admin.lastActiveAt ? `${formatWhen(admin.lastActiveAt)} (${timeAgo(admin.lastActiveAt)})` : "Never"} />
              <Item
                label="Two-factor authentication"
                value={admin.mfaEnabled ? "Enabled" : "Not enabled"}
                hint={admin.mfaEnabled ? undefined : "Managed on the Supabase account; this dashboard can't enrol it yet."}
              />
              {admin.suspendedAt ? <Item label="Suspended" value={`${formatWhen(admin.suspendedAt)}${detail?.suspendedByEmail ? ` by ${detail.suspendedByEmail}` : ""}`} /> : null}
              {admin.revokedAt ? <Item label="Revoked" value={`${formatWhen(admin.revokedAt)}${detail?.revokedByEmail ? ` by ${detail.revokedByEmail}` : ""}`} /> : null}
              <Item label="Active sessions" value={loading ? "…" : String(detail?.sessionCount ?? "—")} />
            </dl>

            <section className="flex flex-col gap-2">
              <span className={LABEL_CLASS}>Permissions</span>
              {loading ? (
                <SkeletonBlock className="h-[48px] w-full" />
              ) : detailError ? (
                <p className="text-[12px] text-accent">{detailError}</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {(detail?.permissions ?? []).map((permission) => (
                    <span key={permission} className="border border-line bg-sand px-1.5 py-0.5 font-mono text-[10.5px] text-ink2">
                      {permission}
                    </span>
                  ))}
                </div>
              )}
            </section>

            <section className="flex flex-col gap-2">
              <span className={LABEL_CLASS}>Recent platform-admin activity</span>
              {loading ? (
                <SkeletonBlock className="h-[72px] w-full" />
              ) : detail && detail.recentActivity.length ? (
                <ul className="flex flex-col divide-y divide-line border-[1.5px] border-line">
                  {detail.recentActivity.map((event) => (
                    <li key={event.id} className="flex items-start justify-between gap-3 px-3 py-2 text-[12px]">
                      <span className="min-w-0 break-words font-medium text-ink">{event.action}</span>
                      <span className="flex-shrink-0 text-right text-[11px] text-mute" title={event.at}>
                        {timeAgo(event.at)}
                        {event.environment ? ` · ${event.environment === "production" ? "Prod" : "Dev"}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={HINT_CLASS}>No recorded activity yet.</p>
              )}
            </section>

            {canManage ? (
              <section className="flex flex-col gap-3 border-t-[1.5px] border-ink pt-4">
                <span className={LABEL_CLASS}>Manage access</span>
                {['sales_rep','sales_manager','platform_owner'].includes(admin.role) ? (
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="flex min-w-[200px] flex-1 flex-col gap-1.5">
                      <span className="text-[10.5px] text-mute">Sales team</span>
                      <input value={newTeam} onChange={e=>setNewTeam(e.target.value)} maxLength={80} disabled={isPending||loading}
                        placeholder="e.g. South" className="border-[1.5px] border-line bg-paper px-2.5 py-2 text-[13px] outline-none focus:border-ink" />
                    </label>
                    <Button variant="secondary" size="sm" disabled={isPending||loading||newTeam.trim()===(detail?.salesTeam??'')}
                      onClick={()=>setPendingAction({kind:'team',team:newTeam.trim()})}>Change team</Button>
                  </div>
                ):null}

                {admin.status === "active" || admin.status === "suspended" || admin.status === "pending" ? (
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="flex min-w-[200px] flex-1 flex-col gap-1.5">
                      <span className="text-[10.5px] text-mute">Role</span>
                      <Dropdown
                        value={newRole}
                        onChange={setNewRole}
                        ariaLabel="Role"
                        options={roles.map((r) => ({ value: r.role, label: r.label }))}
                        className="w-full"
                        disabled={isPending}
                      />
                    </div>
                    <Button
                      type="button"
                      disabled={isPending || !newRole || newRole === admin.role}
                      onClick={() => setPendingAction({ kind: "role", role: newRole })}
                      variant="secondary" size="sm"
                    >
                      Change role
                    </Button>
                  </div>
                ) : null}

                {canSuspend || canRevoke ? (
                  <label className="flex flex-col gap-1.5">
                    <span className="text-[10.5px] text-mute">Reason (optional, recorded in the audit log)</span>
                    <input
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      maxLength={300}
                      className="w-full border-[1.5px] border-line bg-paper px-2.5 py-2 text-[13px] outline-none focus:border-ink"
                    />
                  </label>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  {canResend ? (
                    <Button icon={InviteIcon} type="button" disabled={isPending} onClick={() => setPendingAction({ kind: "resend" })} variant="secondary" size="sm">
                       Resend invitation
                    </Button>
                  ) : null}
                  {canReactivate ? (
                    <Button icon={RestoreIcon} type="button" disabled={isPending} onClick={() => setPendingAction({ kind: "reactivate" })} variant="secondary" size="sm">
                       Reactivate
                    </Button>
                  ) : null}
                  {canSuspend ? (
                    <Button icon={SuspendIcon} type="button" disabled={isPending} onClick={() => setPendingAction({ kind: "suspend" })} variant="danger-secondary" size="sm" >
                       Suspend
                    </Button>
                  ) : null}
                  {canRevoke ? (
                    <Button icon={RevokeIcon} type="button" disabled={isPending} onClick={() => setPendingAction({ kind: "revoke" })} variant="danger-secondary" size="sm" >
                       {admin.status === "pending" || admin.status === "expired" ? "Cancel invitation" : "Revoke access"}
                    </Button>
                  ) : null}
                </div>
                {admin.isSelf ? (
                  <p className={HINT_CLASS}>You can&apos;t suspend or revoke your own access. Ask another Platform Owner.</p>
                ) : null}
                <p className={HINT_CLASS}>
                  Changes here apply to the <strong>{ADMIN_ENVIRONMENT_LABEL[environment]}</strong> environment only. To change access on
                  the other environment, switch to it first. There must always be at least one active Platform Owner.
                </p>
              </section>
            ) : null}
          </div>
        ) : null}
      </Sheet>

      {pendingAction ? (
        <ConfirmDialog
          open
          danger={CONFIRM_COPY[pendingAction.kind].danger}
          title={CONFIRM_COPY[pendingAction.kind].title(who)}
          description={CONFIRM_COPY[pendingAction.kind].body}
          confirmLabel={CONFIRM_COPY[pendingAction.kind].label}
          pending={isPending}
          requireTypedConfirmation={environment === "prod" ? "PRODUCTION" : undefined}
          onConfirm={run}
          onCancel={() => setPendingAction(null)}
        />
      ) : null}
    </>
  );
}

function Item({ label, value, hint, children }: { label: string; value?: string; hint?: string; children?: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className={LABEL_CLASS}>{label}</dt>
      <dd className="break-words text-ink">{children ?? value}</dd>
      {hint ? <span className={HINT_CLASS}>{hint}</span> : null}
    </div>
  );
}
