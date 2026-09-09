"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/features/auth/actions";
import { SubmitButton } from "@/components/SubmitButton";
import { SignOutIcon } from "@/core/ui/icons";
import { ICON_SIZE } from "@/core/ui/icon-size";
import { NAV_ITEMS } from "./nav-items";

/**
 * Persistent nav rail for tablet + desktop (≥768px) — adapted from
 * FitDeskApp/src/app/dashboard/dashboard-sidebar.tsx, with two deliberate
 * differences from that pattern: 236px wide (the design's own spec, vs the
 * tenant app's 240px/w-60 — close enough to be the "same shape", not
 * copy-pasted without checking) and no `navItemsForRole` filtering, since
 * every platform admin sees every section — there is no "staff vs owner"
 * distinction on this side of the product yet.
 *
 * Breakpoint note: the design's own render logic collapses its three
 * demo viewports (desktop/tablet/mobile) into a single `wide`/`narrow`
 * flag (`narrow = vw === "mobile"`) that every page — this sidebar, the
 * header search/bell, and every table-vs-card-list split on Gyms/Revenue/
 * Overview — keys off identically, and the canvas itself renders the
 * sidebar at its 834px "tablet" frame width. So "wide" starts at tablet,
 * not desktop: this uses Tailwind's `md:` (768px) prefix throughout,
 * matching that flag, rather than `lg:` (1024px) — the design's separately
 * documented "desktop ≥1024 / tablet 768–1023 / mobile <768" breakpoint
 * list describes finer per-section reflow (e.g. tile/card wrap counts),
 * not a different chrome cutoff.
 */
export function AdminSidebar({ email, gymsCount }: { email: string; gymsCount: number }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/admin" ? pathname === href : pathname.startsWith(href));
  const initials = email.slice(0, 2).toUpperCase();
  const badgeFor = (href: string) => (href === "/admin/gyms" ? String(gymsCount) : undefined);

  return (
    <aside className="hidden md:fixed md:inset-y-0 md:left-0 md:z-10 md:flex md:h-dvh md:w-[236px] md:flex-shrink-0 md:flex-col md:justify-between md:overflow-y-auto md:border-r-[1.5px] md:border-ink md:bg-ink md:p-3.5 md:text-paper">
      <div className="flex flex-col gap-6">
        <span className="flex items-center gap-2.5 px-1.5">
          <span className="flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center bg-hi text-[10.5px] font-bold text-ink">
            MF
          </span>
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate text-[11px] font-bold uppercase tracking-[0.12em]">
              MyFitDesk
            </span>
            <span className="truncate text-[10px] uppercase tracking-[0.1em] text-mute3">
              Platform admin
            </span>
          </span>
        </span>

        <nav className="flex flex-col gap-0.5" aria-label="Platform sections">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.href);
            const badge = badgeFor(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-[44px] items-center gap-3 border-l-2 px-3 text-[13.5px] ${
                  active
                    ? "border-hi bg-[#302620] font-bold text-paper"
                    : "border-transparent text-mute3 hover:bg-[#302620] hover:text-paper"
                }`}
              >
                <item.icon size={ICON_SIZE.nav} className="flex-shrink-0" aria-hidden />
                <span className="flex-1 truncate">{item.label}</span>
                {badge ? (
                  <span className="flex h-[18px] min-w-[18px] flex-shrink-0 items-center justify-center bg-accent px-1 text-[9.5px] font-bold text-paper">
                    {badge}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="flex flex-col gap-3 border-t border-inkline px-1.5 pt-3.5">
        <div className="flex items-center gap-2.5">
          <span className="flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center bg-hi text-[10.5px] font-bold text-ink">
            {initials}
          </span>
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate text-[11.5px] font-bold">{email}</span>
            <span className="truncate text-[10px] text-mute3">Platform owner</span>
          </span>
        </div>
        <form action={signOut}>
          <SubmitButton
            icon={SignOutIcon}
            pendingLabel="Signing out…"
            className="min-h-[36px] w-full border border-inkline text-[10px] font-bold text-mute3 hover:border-paper hover:text-paper"
          >
            Sign out
          </SubmitButton>
        </form>
      </div>
    </aside>
  );
}
