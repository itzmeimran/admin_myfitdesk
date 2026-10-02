"use client";

import { ButtonLink } from "@/components/ButtonLink";

import { usePathname } from "next/navigation";

export type SettingsTab = { href: string; label: string };

/**
 * Client Component only for `usePathname`. Every tab is its own route (its own
 * Server Component page, guarded on the server by its own permission), so a
 * tab has a real URL, survives refresh and the back button, and only fetches
 * its own data. The list arrives pre-filtered by the admin's role — a tab you
 * can't open isn't shown, and opening its URL anyway is refused server-side.
 *
 * Horizontally scrollable on phones instead of wrapping into several rows.
 */
export function SettingsTabs({ tabs }: { tabs: SettingsTab[] }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Settings sections"
      className="-mx-4 flex overflow-x-auto border-b-[1.5px] border-ink px-4 md:mx-0 md:px-0"
    >
      {tabs.map((tab) => {
        const active = tab.href === "/admin/settings" ? pathname === tab.href : pathname.startsWith(tab.href);
        return (
          <ButtonLink
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            variant="control" size="custom" className={`flex flex-shrink-0 items-center whitespace-nowrap border-b-[3px] px-3.5 py-2.5 text-[12px] font-bold uppercase tracking-[0.06em] ${
              active ? "border-accent text-ink" : "border-transparent text-mute hover:text-ink"
            }`}
          >
            {tab.label}
          </ButtonLink>
        );
      })}
    </nav>
  );
}
