"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "", label: "Overview" },
  { href: "/members", label: "Members" },
  { href: "/team", label: "Branches & Team" },
  { href: "/billing", label: "Subscription & Billing" },
  { href: "/activity", label: "Activity" },
] as const;

/**
 * Client Component only because `usePathname` needs it — every tab route
 * is its own Server Component page under this shared layout, matching this
 * app's existing "?filter=/?period=" pattern of real navigations rather
 * than client-side tab switching, so each tab gets its own URL, its own
 * search/filter/sort state, and works with the back button.
 *
 * Tab set matches the Claude Design "MyFitDesk Gym Detail" canvas exactly
 * (Overview / Members / Branches & Team / Subscription & Billing /
 * Activity) — Entitlements was folded into Overview's usage bars (it was
 * already just a rephrasing of the same caps data, see the old
 * entitlements/page.tsx's own docblock) and Settings stays reachable from
 * the header's "Edit gym" button rather than a tab, since the design has
 * no Settings tab either.
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

  return (
    <nav aria-label="Gym detail sections" className="flex overflow-x-auto border-b-[1.5px] border-ink">
      {TABS.map((tab) => {
        const href = `${base}${tab.href}`;
        const active = tab.href === "" ? pathname === base : pathname.startsWith(href);
        const count = counts[tab.href];
        return (
          <Link
            key={tab.href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex flex-shrink-0 items-center gap-2 whitespace-nowrap border-b-[3px] px-3.5 py-2.5 text-[12px] font-bold uppercase tracking-[0.06em] ${
              active ? "border-accent text-ink" : "border-transparent text-mute hover:text-ink"
            }`}
          >
            {tab.label}
            {count ? <span className={active ? "text-mute" : "text-mute3"}>{count}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
