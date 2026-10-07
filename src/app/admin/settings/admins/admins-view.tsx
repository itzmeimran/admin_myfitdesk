"use client";

import { Button } from "@/components/Button";
import { DetailsIcon } from '@/core/ui/icons';
import { useState } from "react";
import type { PlatformAdminRow, PlatformRole } from "@/features/settings/admins";
import type { OtherEnvironmentAccess } from "../_server/env-access";
import type { AdminEnvironment } from "@/core/config/environments";
import { ADMIN_STATUS_LABEL } from "@/core/auth/permissions";
import { EmptyState } from "@/components/EmptyState";
import { SettingsCard, StatusPill, formatWhen, timeAgo } from "../_components/ui";
import { InviteAdminForm } from "./invite-form";
import { AdminDrawer } from "./admin-drawer";
import { EnvAccessSummary } from "./env-access-cell";

/**
 * Roster + invite + role reference. Rows are real buttons (keyboard and screen
 * reader friendly); the table is the desktop layout and the same data renders
 * as stacked cards below `md`.
 */
export function AdminsView({
  admins,
  roles,
  otherEnvironment,
  currentEnvironment,
  canManage,
}: {
  admins: PlatformAdminRow[];
  roles: PlatformRole[];
  otherEnvironment: OtherEnvironmentAccess;
  currentEnvironment: AdminEnvironment;
  canManage: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = admins.find((a) => a.userId === selectedId) ?? null;

  const otherStatusFor = (admin: PlatformAdminRow): string => {
    if (!otherEnvironment.available) return "unknown";
    return otherEnvironment.byEmail[admin.email.toLowerCase()] ?? "none";
  };

  return (
    <>
      <SettingsCard
        title="Invite a platform admin"
        description="Invited people choose their own password. Their role decides what they can see and do; environment access decides which database they can reach."
      >
        <InviteAdminForm roles={roles} currentEnvironment={currentEnvironment} canManage={canManage} />
      </SettingsCard>

      <SettingsCard
        title="Platform admins"
        description={`Everyone with access to the ${currentEnvironment === "prod" ? "Production" : "Development"} environment, plus pending and former admins. Select a row for details and actions.`}
      >
        {admins.length === 0 ? (
          <EmptyState message="No platform admins yet." />
        ) : (
          <>
            <div className="hidden overflow-x-auto border-[1.5px] border-line md:block">
              <table className="w-full min-w-[980px] border-collapse text-[12.5px]">
                <thead>
                  <tr className="border-b-[1.5px] border-line bg-sand text-left text-[10px] font-bold uppercase tracking-[0.1em] text-mute">
                    <th className="px-3 py-2.5">Admin</th>
                    <th className="px-3 py-2.5">Role</th>
                    <th className="px-3 py-2.5">Environment access</th>
                    <th className="px-3 py-2.5">Status</th>
                    <th className="px-3 py-2.5">Invited / granted</th>
                    <th className="px-3 py-2.5">Granted by</th>
                    <th className="px-3 py-2.5">Last active</th>
                    <th className="px-3 py-2.5">2FA</th>
                  </tr>
                </thead>
                <tbody>
                  {admins.map((admin) => (
                    <tr key={admin.userId} className="mfd-table-row border-b border-line last:border-b-0">
                      <td className="px-3 py-2.5">
                        <Button
                          type="button"
                          onClick={() => setSelectedId(admin.userId)}
                          variant="surface" size="custom" className="flex max-w-[260px] flex-col text-left"
                          aria-label={`Open details for ${admin.email}`}
                        >
                          <span className="flex items-center gap-2 font-medium text-ink underline-offset-2 hover:underline">
                            <DetailsIcon size={15} className="flex-shrink-0 text-mute" aria-hidden />
                            {admin.displayName || admin.email}
                            {admin.isSelf ? <span className="ml-1.5 text-[10.5px] font-normal text-mute3">(you)</span> : null}
                          </span>
                          {admin.displayName ? <span className="truncate text-[11px] text-mute">{admin.email}</span> : null}
                        </Button>
                      </td>
                      <td className="px-3 py-2.5 text-ink">{admin.roleLabel}</td>
                      <td className="px-3 py-2.5">
                        <EnvAccessSummary
                          current={currentEnvironment}
                          currentStatus={admin.status}
                          other={otherEnvironment.environment}
                          otherStatus={otherStatusFor(admin)}
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <StatusPill label={ADMIN_STATUS_LABEL[admin.status]} />
                      </td>
                      <td className="px-3 py-2.5 text-mute" title={admin.invitedAt ?? admin.grantedAt}>
                        {formatWhen(admin.invitedAt ?? admin.grantedAt)}
                      </td>
                      <td className="px-3 py-2.5 text-mute">{admin.grantedByEmail ?? "—"}</td>
                      <td className="px-3 py-2.5 text-mute" title={admin.lastActiveAt ?? undefined}>
                        {timeAgo(admin.lastActiveAt)}
                      </td>
                      <td className="px-3 py-2.5">
                        <StatusPill label={admin.mfaEnabled ? "On" : "Off"} tone={admin.mfaEnabled ? "Active" : "Cancelled"} />
                        <span className="sr-only">{admin.mfaEnabled ? "Two-factor enabled" : "Two-factor not enabled"}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="flex flex-col gap-2.5 md:hidden">
              {admins.map((admin) => (
                <li key={admin.userId}>
                  <Button
                    type="button"
                    onClick={() => setSelectedId(admin.userId)}
                    variant="surface" size="custom" className="flex w-full flex-col gap-2.5 border-[1.5px] border-line bg-paper p-3.5 text-left hover:border-ink"
                  >
                    <span className="flex items-start justify-between gap-2">
                      <DetailsIcon size={15} className="flex-shrink-0 text-mute" aria-hidden />
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-[13.5px] font-bold text-ink">
                          {admin.displayName || admin.email}
                          {admin.isSelf ? <span className="ml-1.5 text-[10.5px] font-normal text-mute3">(you)</span> : null}
                        </span>
                        {admin.displayName ? <span className="truncate text-[11.5px] text-mute">{admin.email}</span> : null}
                      </span>
                      <StatusPill label={ADMIN_STATUS_LABEL[admin.status]} />
                    </span>
                    <span className="flex flex-wrap items-center justify-between gap-2 text-[12px]">
                      <span className="font-bold text-ink">{admin.roleLabel}</span>
                      <span className="text-mute">Active {timeAgo(admin.lastActiveAt)}</span>
                    </span>
                    <EnvAccessSummary
                      current={currentEnvironment}
                      currentStatus={admin.status}
                      other={otherEnvironment.environment}
                      otherStatus={otherStatusFor(admin)}
                    />
                  </Button>
                </li>
              ))}
            </ul>
          </>
        )}
        {!otherEnvironment.available ? (
          <p className="text-[11px] text-mute3">
            The other environment couldn&apos;t be checked from here, so its access shows as Unknown.
          </p>
        ) : null}
      </SettingsCard>

      <SettingsCard title="What each role can do" description="Roles are enforced by the database on every request, not just by hiding buttons.">
        <div className="grid gap-3 md:grid-cols-2">
          {roles.map((role) => (
            <div key={role.role} className="flex flex-col gap-2 border-[1.5px] border-line p-3.5">
              <div className="flex flex-col gap-0.5">
                <span className="font-display text-[14px] text-ink">{role.label}</span>
                <span className="text-[12px] leading-relaxed text-mute">{role.description}</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {role.permissions.map((permission) => (
                  <span key={permission} className="border border-line bg-sand px-1.5 py-0.5 font-mono text-[10px] text-ink2">
                    {permission}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </SettingsCard>

      <AdminDrawer
        admin={selected}
        roles={roles}
        otherEnvironment={otherEnvironment.environment}
        otherStatus={selected ? otherStatusFor(selected) : "unknown"}
        canManage={canManage}
        onClose={() => setSelectedId(null)}
      />
    </>
  );
}
