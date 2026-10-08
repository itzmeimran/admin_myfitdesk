"use client";

import { usePathname } from "next/navigation";
import { TabsNav } from "@/components/Tabs";

const TABS = [
  { href: "", label: "Overview" },
  { href: "/members", label: "Members" },
  { href: "/team", label: "Branches & team" },
  { href: "/billing", label: "Subscription & billing" },
  { href: "/operations", label: "Operations" },
  { href: "/activity", label: "Activity" },
] as const;

/**
 * Client Component only because `usePathname` needs it — every tab route
 * is its own Server Component page under this shared layout, matching this
 * app's existing "?filter=/?period=" pattern of real navigations rather
 * than client-side tab switching, so each tab gets its own URL, its own
 * search/filter/sort state, and works with the back button.
 *
 * Renders the shared `TabsNav` (segmented bar below `xl`, side rail from `xl`);
 * the layout wraps the page body in `TabsLayout`.
 *
 * Tab set matches the Claude Design "MyFitDesk Gym Detail" canvas — Entitlements
 * was folded into Overview's usage bars, and Settings stays reachable from the
 * header's "Edit gym" button rather than a tab.
 */
export function GymDetailTabs({
  organizationId,
  memberCount,
  branchCount,
  staffCount,
}: {
  organizationId: string;
  memberCount: number;
  branchCount: number;
  staffCount: number;
}) {
  const pathname = usePathname();
  const base = `/admin/gyms/${organizationId}`;

  const counts: Record<string, string> = {
    "/members": memberCount.toLocaleString("en-IN"),
    "/team": `${branchCount} · ${staffCount}`,
  };

  const active =
    TABS.find((tab) => (tab.href === "" ? pathname === base : pathname.startsWith(`${base}${tab.href}`)))?.href ?? "";

  return (
    <TabsNav
      ariaLabel="Gym detail sections"
      activeKey={active}
      sticky
      items={TABS.map((tab) => ({ key: tab.href, label: tab.label, href: `${base}${tab.href}`, meta: counts[tab.href] }))}
    />
  );
}
