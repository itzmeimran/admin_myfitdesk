"use client";

import { usePathname } from "next/navigation";
import { TabsNav } from "@/components/Tabs";

export type SettingsTab = { href: string; label: string };

/**
 * Client Component only for `usePathname`. Every tab is its own route (its own
 * Server Component page, guarded on the server by its own permission), so a
 * tab has a real URL, survives refresh and the back button, and only fetches
 * its own data. The list arrives pre-filtered by the admin's role — a tab you
 * can't open isn't shown, and opening its URL anyway is refused server-side.
 *
 * Renders the shared `TabsNav` (segmented bar below `xl`, side rail from `xl`);
 * the layout wraps the page body in `TabsLayout` so the rail has its column.
 */
export function SettingsTabs({ tabs }: { tabs: SettingsTab[] }) {
  const pathname = usePathname();
  const active =
    tabs.find((tab) => (tab.href === "/admin/settings" ? pathname === tab.href : pathname.startsWith(tab.href)))?.href ?? "";

  return (
    <TabsNav
      ariaLabel="Settings sections"
      activeKey={active}
      items={tabs.map((tab) => ({ key: tab.href, label: tab.label, href: tab.href }))}
    />
  );
}
