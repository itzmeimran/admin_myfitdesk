import { createClient } from "@/core/db/server-client";
import { getAdminAccess, hasPermission, requirePermission } from "@/core/auth/access";
import {
  getAccessHistory,
  getSecurityOverview,
  HISTORY_CATEGORIES,
  listAdminSessions,
  parseHistoryCategory,
} from "@/features/settings/security";
import { Pagination, parsePagination } from "@/components/Pagination";
import { CustomFilterDropdown } from "@/components/CustomFilterDropdown";
import { EmptyState } from "@/components/EmptyState";
import { SectionError, SettingsCard, StatTile, StatusPill, formatWhen, Notice } from "../_components/ui";
import { eventChanges, eventLabel, eventTarget } from "../_components/describe-event";
import { SessionsTable } from "./sessions-table";
import { DangerZone } from "./danger-zone";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Settings -> Security: a live overview of who can get in, the active admin
 * sessions, the access history (the existing admin_audit_log filtered to this
 * area's events — not a second audit system) and the emergency sign-out lever.
 */
export default async function SecurityPage({ searchParams }: { searchParams: SearchParams }) {
  await requirePermission("security.view");
  const sp = await searchParams;
  const access = await getAdminAccess();
  const canManage = hasPermission(access, "admins.manage");
  const category = parseHistoryCategory(Array.isArray(sp.category) ? sp.category[0] : sp.category);
  const { page, pageSize } = parsePagination(sp);

  const supabase = await createClient();
  const [overview, sessions, history] = await Promise.all([
    getSecurityOverview(supabase),
    listAdminSessions(supabase),
    getAccessHistory(supabase, category, page, pageSize),
  ]);

  return (
    <>
      {overview.ok ? (
        <section className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5" aria-label="Security summary">
          <StatTile label="Active admins" value={overview.data.activeAdmins} hint={`${overview.data.activeOwners} Platform Owner${overview.data.activeOwners === 1 ? "" : "s"}`} />
          <StatTile
            label={overview.data.isProductionDatabase ? "With Production access" : "With Development access"}
            value={overview.data.activeAdmins}
            hint="Active admins on this environment"
          />
          <StatTile label="Pending invitations" value={overview.data.pendingInvites} hint={overview.data.expiredInvites ? `${overview.data.expiredInvites} expired` : undefined} />
          <StatTile label="Suspended" value={overview.data.suspendedAdmins} tone={overview.data.suspendedAdmins ? "attention" : "default"} />
          <StatTile
            label="Two-factor enabled"
            value={`${overview.data.mfaEnabledAdmins}/${overview.data.activeAdmins}`}
            hint="Active admins with a verified factor"
            tone={overview.data.activeAdmins > 0 && overview.data.mfaEnabledAdmins < overview.data.activeAdmins ? "attention" : "default"}
          />
        </section>
      ) : (
        <SectionError message={overview.error} notInstalled={overview.notInstalled} />
      )}

      <SettingsCard
        title="Admin sessions"
        description="Signed-in platform admin sessions on this environment. Ending a session stops it refreshing immediately; a session already holding a short-lived access token can keep working for up to an hour, which is why Suspend and Revoke (Admins & permissions) also cut access instantly at the database."
      >
        {sessions.ok ? (
          <SessionsTable sessions={sessions.data} canManage={canManage} />
        ) : (
          <SectionError message={sessions.error} notInstalled={sessions.notInstalled} />
        )}
      </SettingsCard>

      <SettingsCard
        title="Access history"
        description="Admin invitations, role and access changes, settings changes, environment switches and session revocations — who did what, when, and on which environment."
        actions={
          <CustomFilterDropdown
            param="category"
            placeholder="All events"
            options={HISTORY_CATEGORIES.map((c) => ({ value: c.value === "all" ? "" : c.value, label: c.label }))}
          />
        }
      >
        {history.ok ? (
          history.data.events.length === 0 ? (
            <EmptyState message="No events recorded for this filter yet." />
          ) : (
            <>
              <div className="hidden overflow-x-auto border-[1.5px] border-line md:block">
                <table className="w-full min-w-[820px] border-collapse text-[12.5px]">
                  <thead>
                    <tr className="border-b-[1.5px] border-line bg-sand text-left text-[10px] font-bold uppercase tracking-[0.1em] text-mute">
                      <th className="px-3 py-2.5">When</th>
                      <th className="px-3 py-2.5">Event</th>
                      <th className="px-3 py-2.5">Target</th>
                      <th className="px-3 py-2.5">Change</th>
                      <th className="px-3 py-2.5">By</th>
                      <th className="px-3 py-2.5">Env</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.data.events.map((event) => (
                      <tr key={event.id} className="mfd-table-row border-b border-line align-top last:border-b-0">
                        <td className="whitespace-nowrap px-3 py-2.5 text-mute" title={event.occurredAt}>{formatWhen(event.occurredAt)}</td>
                        <td className="px-3 py-2.5 font-medium text-ink">{eventLabel(event.action)}</td>
                        <td className="px-3 py-2.5 text-mute">{eventTarget(event) ?? "—"}</td>
                        <td className="px-3 py-2.5 text-[11.5px] text-mute">
                          {eventChanges(event).map((line) => (
                            <div key={line}>{line}</div>
                          ))}
                        </td>
                        <td className="px-3 py-2.5 text-mute">
                          {event.actorEmail ?? "System"}
                          {event.actorRole ? <div className="text-[10.5px] text-mute3">{event.actorRole}</div> : null}
                        </td>
                        <td className="px-3 py-2.5">
                          {event.environment ? (
                            <StatusPill
                              label={event.environment === "production" ? "Production" : "Development"}
                              tone={event.environment === "production" ? "Attention" : "Cancelled"}
                            />
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="flex flex-col gap-2.5 md:hidden">
                {history.data.events.map((event) => (
                  <li key={event.id} className="flex flex-col gap-1.5 border-[1.5px] border-line p-3.5">
                    <span className="text-[13px] font-bold text-ink">{eventLabel(event.action)}</span>
                    {eventTarget(event) ? <span className="text-[12px] text-mute">{eventTarget(event)}</span> : null}
                    {eventChanges(event).map((line) => (
                      <span key={line} className="text-[11.5px] text-mute">{line}</span>
                    ))}
                    <span className="text-[11px] text-mute3">
                      {formatWhen(event.occurredAt)} · {event.actorEmail ?? "System"}
                      {event.environment ? ` · ${event.environment === "production" ? "Production" : "Development"}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
              <Pagination pathname="/admin/settings/security" searchParams={sp} page={page} pageSize={pageSize} total={history.data.total} itemLabel="events" />
            </>
          )
        ) : (
          <SectionError message={history.error} notInstalled={history.notInstalled} />
        )}
      </SettingsCard>

      {canManage ? <DangerZone /> : null}
      {!canManage ? <Notice>Only a Platform Owner can end sessions or use the emergency controls.</Notice> : null}
    </>
  );
}
