"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "", label: "Overview" },
  { href: "/billing", label: "Subscription & Billing" },
  { href: "/branches", label: "Branches" },
  { href: "/staff", label: "Staff" },
  { href: "/members", label: "Members" },
  { href: "/entitlements", label: "Entitlements" },
  { href: "/activity", label: "Activity" },
  { href: "/settings", label: "Settings" },
] as const;

/** Client Component only because `usePathname` needs it — every tab route
 * is its own Server Component page under this shared layout, matching this
 * app's existing "?filter=/?period=" pattern of real navigations rather
 * than client-side tab switching, so each tab gets its own URL, its own
 * search/filter/sort state, and works with the back button. */
export function GymDetailTabs({ organizationId }: { organizationId: string }) {
  const pathname = usePathname();
  const base = `/admin/gyms/${organizationId}`;

  return (
    <nav aria-label="Gym detail sections" className="flex overflow-x-auto border-b-[1.5px] border-ink">
      {TABS.map((tab) => {
        const href = `${base}${tab.href}`;
        const active = tab.href === "" ? pathname === base : pathname.startsWith(href);
        return (
          <Link
            key={tab.href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex-shrink-0 whitespace-nowrap border-b-[3px] px-3.5 py-2.5 text-[12px] font-bold uppercase tracking-[0.06em] ${
              active ? "border-accent text-ink" : "border-transparent text-mute hover:text-ink"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
