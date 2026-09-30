import { createClient } from "@/core/db/server-client";
import { getAdminAccess, hasPermission, requirePermission } from "@/core/auth/access";
import { getSystemInfo } from "@/features/settings/system";
import { SettingsCard, StatusPill, TextLink, Notice } from "../_components/ui";

type Source = {
  category: string;
  description: string;
  where: { href: string; label: string };
  permission?: "recovery.view" | "api_performance.view" | "integrations.view" | "revenue.view" | "gyms.view";
};

// Every entry below is a REAL alert source that exists today, with the screen
// where it surfaces. Nothing here is a toggle, because nothing can yet deliver
// an alert outside this dashboard.
const SOURCES: Source[] = [
  {
    category: "Backup and restore failures",
    description: "Failed or overdue database backups and restore problems raise platform alerts.",
    where: { href: "/admin/system/disaster-recovery", label: "Recovery → Alerts" },
    permission: "recovery.view",
  },
  {
    category: "Database and API performance",
    description: "Slow endpoints, rising failure rates, repeated 5xx errors and unusual traffic are flagged automatically.",
    where: { href: "/admin/api-performance", label: "API Performance → Alerts" },
    permission: "api_performance.view",
  },
  {
    category: "Payment webhooks and subscription issues",
    description: "Razorpay signature failures and stuck orders, and gyms in grace or read-only, show on the Overview.",
    where: { href: "/admin", label: "Overview → Needs attention" },
  },
  {
    category: "Integration failures",
    description: "Gym WhatsApp connections with errors or expiring tokens, and email failures, are summarised per integration.",
    where: { href: "/admin/settings/integrations", label: "Settings → Integrations" },
    permission: "integrations.view",
  },
  {
    category: "Suspicious admin or security activity",
    description: "Invitations, role changes, suspensions, environment switches and session revocations are all recorded.",
    where: { href: "/admin/settings/security", label: "Settings → Security → Access history" },
  },
];

/**
 * Settings -> Notifications. Honest by design: platform alerts currently appear
 * INSIDE this dashboard only. The platform has no email/push delivery for admin
 * alerts yet, so there are no per-admin alert toggles here — a switch that
 * changed nothing would be worse than none. (Adding delivery is a follow-up:
 * a preferences table plus a scheduled dispatcher; see CLAUDE.md.)
 */
export default async function NotificationsPage() {
  await requirePermission("settings.view");
  const access = await getAdminAccess();
  const supabase = await createClient();
  const info = hasPermission(access, "system.view") ? await getSystemInfo(supabase) : null;

  return (
    <>
      <SettingsCard
        title="Platform alerts"
        description="Alerts are for the people who run MyFitDesk, not for gyms or members. Today they surface inside this dashboard; here is where each kind lives."
        actions={
          info?.ok ? (
            <StatusPill
              label={info.data.openCriticalAlerts > 0 ? `${info.data.openCriticalAlerts} critical open` : "No critical alerts"}
              tone={info.data.openCriticalAlerts > 0 ? "Down" : "Healthy"}
            />
          ) : undefined
        }
      >
        <Notice>
          Email and push delivery of platform alerts isn&apos;t available yet, so there are no notification switches to set.
          Check the screens below, or the bell in the header for gyms needing attention.
        </Notice>
        <ul className="flex flex-col divide-y divide-line border-[1.5px] border-line">
          {SOURCES.filter((source) => !source.permission || hasPermission(access, source.permission)).map((source) => (
            <li key={source.category} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3.5">
              <div className="flex min-w-0 max-w-xl flex-col gap-0.5">
                <span className="text-[13.5px] font-bold text-ink">{source.category}</span>
                <span className="text-[12px] leading-relaxed text-mute">{source.description}</span>
              </div>
              <span className="text-[12px]">
                <TextLink href={source.where.href}>{source.where.label}</TextLink>
              </span>
            </li>
          ))}
        </ul>
      </SettingsCard>
    </>
  );
}
