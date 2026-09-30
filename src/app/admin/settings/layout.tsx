import { getAdminAccess, requirePermission } from "@/core/auth/access";
import type { Permission } from "@/core/auth/permissions";
import { SettingsTabs, type SettingsTab } from "./settings-tabs";

type TabDefinition = SettingsTab & { permission: Permission };

// Order is the order the user asked for. `permission` decides whether the tab
// is listed; each page re-checks the same permission on the server.
const TABS: TabDefinition[] = [
  { href: "/admin/settings", label: "General", permission: "settings.view" },
  { href: "/admin/settings/defaults", label: "Platform defaults", permission: "settings.view" },
  { href: "/admin/settings/admins", label: "Admins & permissions", permission: "admins.view" },
  { href: "/admin/settings/security", label: "Security", permission: "security.view" },
  { href: "/admin/settings/environments", label: "Environments", permission: "settings.view" },
  { href: "/admin/settings/integrations", label: "Integrations", permission: "integrations.view" },
  { href: "/admin/settings/notifications", label: "Notifications", permission: "settings.view" },
  { href: "/admin/settings/privacy", label: "Data & privacy", permission: "privacy.view" },
  { href: "/admin/settings/system", label: "System", permission: "system.view" },
];

/**
 * Platform → Settings shell: title, description and the section tabs. Reaching
 * anything under /admin/settings needs `settings.view`; each section adds its
 * own permission on top.
 */
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  await requirePermission("settings.view");
  const access = await getAdminAccess();
  const granted = new Set<string>(access?.permissions ?? []);
  const visible = TABS.filter((tab) => granted.has(tab.permission)).map(({ href, label }) => ({ href, label }));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-[24px] tracking-[-0.02em] md:text-[26px]">Settings</h1>
        <p className="text-[12.5px] text-mute">
          Manage platform configuration, environments, administrators and security.
        </p>
      </div>
      <SettingsTabs tabs={visible} />
      <div className="flex flex-col gap-5">{children}</div>
    </div>
  );
}
