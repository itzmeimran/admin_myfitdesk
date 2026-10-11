"use client";

import { ConfirmedForm } from '@/components/ConfirmedForm';
import { PendingLink, useNavigationPending } from "@/components/NavigationPending";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { signOut } from "@/features/auth/actions";
import { SubmitButton } from "@/components/SubmitButton";
import { Button } from "@/components/Button";
import { ChevronIcon, SignOutIcon, SpinnerIcon } from "@/core/ui/icons";
import { ICON_SIZE } from "@/core/ui/icon-size";
import { NAV_ITEMS, visibleNavItems } from "./nav-items";

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
export function AdminSidebar({ email, gymsCount, salesAttentionCount, permissions }: { email: string; gymsCount: number; salesAttentionCount: number | null; permissions: string[] }) {
  const pathname = usePathname();
  const { collapsed, toggle } = useSidebarCollapse();
  const { pendingHref } = useNavigationPending();
  const isActive = (href: string) => (href === "/admin" ? pathname === href : pathname.startsWith(href));
  // The row a click came from shows a spinner until the page arrives.
  const pendingPath = pendingHref ? pendingHref.split("?")[0] : null;
  const isPendingFor = (href: string) =>
    pendingPath !== null && (href === "/admin" ? pendingPath === href : pendingPath.startsWith(href));
  const initials = email.slice(0, 2).toUpperCase();
  const badgeFor = (href: string) => (href === "/admin/gyms" ? String(gymsCount) : href === '/admin/sales' && salesAttentionCount ? String(salesAttentionCount) : undefined);

  return (
    <aside className="hidden md:fixed md:inset-y-0 md:left-0 md:z-10 md:flex md:h-dvh md:w-[var(--sidebar-w)] md:flex-shrink-0 md:flex-col md:justify-between md:overflow-y-auto md:border-r-[1.5px] md:border-ink md:bg-ink md:p-3.5 md:text-paper">
      <div className="flex flex-col gap-6">
        <span className="mfd-sb-center flex items-center gap-2.5 px-1.5">
          <span className="flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center bg-hi text-[10.5px] font-bold text-ink">
            MF
          </span>
          <span className="mfd-sb-hide flex min-w-0 flex-col gap-0.5">
            <span className="truncate text-[11px] font-bold uppercase tracking-[0.12em]">
              MyFitDesk
            </span>
            <span className="truncate text-[10px] uppercase tracking-[0.1em] text-mute3">
              Platform admin
            </span>
          </span>
        </span>

        <Button
          type="button"
          variant="ghost"
          tone="inverse"
          size="sm"
          iconOnly
          onClick={toggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-pressed={collapsed}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="-mt-3 self-end"
        >
          <ChevronIcon size={15} className={collapsed ? "-rotate-90" : "rotate-90"} aria-hidden />
        </Button>

        <nav className="-mt-3 flex flex-col gap-0.5" aria-label="Platform sections">
          {visibleNavItems(NAV_ITEMS, permissions).map((item) => {
            const active = isActive(item.href);
            const badge = badgeFor(item.href);
            // A plain link, not a ButtonLink: .mfd-button carries a 1.5px
            // border on all four sides (and recolours it on :focus), so the
            // active row's `border-hi` drew a yellow box instead of
            // FitDeskApp's single left bar. Same classes as its NavList.
            return (
              <PendingLink
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                title={collapsed ? item.label : undefined}
                className={`mfd-sb-item flex min-h-[44px] items-center gap-3.5 border-l-2 px-3 text-[14px] transition-colors ${
                  active
                    ? "border-hi bg-[#302620] font-bold text-paper"
                    : "border-transparent text-mute3 hover:bg-[#302620] hover:text-paper"
                }`}
              >
                <item.icon size={ICON_SIZE.nav} className="flex-shrink-0" aria-hidden />
                <span className="mfd-sb-hide flex-1 truncate">{item.label}</span>
                {isPendingFor(item.href) ? (
                  <SpinnerIcon size={13} className="mfd-sb-hide flex-shrink-0 animate-spin text-mute3" aria-hidden />
                ) : badge ? (
                  <span
                    aria-label={`${badge} ${item.href === '/admin/sales' ? 'need attention' : 'total'}`}
                    className="mfd-sb-hide flex-shrink-0 text-[11px] font-bold tabular-nums text-mute3"
                  >
                    {badge}
                  </span>
                ) : null}
              </PendingLink>
            );
          })}
        </nav>
      </div>

      <div className="flex flex-col gap-3 border-t border-inkline px-1.5 pt-3.5">
        <div className="mfd-sb-center flex items-center gap-2.5">
          <span className="flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center bg-hi text-[10.5px] font-bold text-ink" title={email}>
            {initials}
          </span>
          <span className="mfd-sb-hide flex min-w-0 flex-col gap-0.5">
            <span className="truncate text-[11.5px] font-bold">{email}</span>
            <span className="truncate text-[10px] text-mute3">Platform owner</span>
          </span>
        </div>
        <ConfirmedForm confirmation="Sign out of the admin dashboard?" action={signOut}>
          <SubmitButton tone="inverse" variant="ghost" size="sm"
            icon={SignOutIcon}
            pendingLabel="Signing out…"
            className="w-full border"
            aria-label="Sign out"
            title="Sign out"
          >
            <span className="mfd-sb-hide">Sign out</span>
          </SubmitButton>
        </ConfirmedForm>
      </div>
    </aside>
  );
}

const SIDEBAR_KEY = "admin-sidebar";
const COLLAPSED_WIDTH = "72px";

/**
 * The rail is 72px between 768 and 1023px unless the admin expands it, and
 * 236px from 1024px unless they collapse it. CSS (globals.css) does the
 * sizing from `html[data-sidebar]`; this only records the choice and reports
 * the current state so the button reads correctly.
 */
function useSidebarCollapse() {
  const [collapsed, setCollapsed] = useState(false);
  const sync = useCallback(() => {
    setCollapsed(getComputedStyle(document.documentElement).getPropertyValue("--sidebar-w").trim() === COLLAPSED_WIDTH);
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(SIDEBAR_KEY);
      if (saved === "expanded" || saved === "collapsed") document.documentElement.dataset.sidebar = saved;
    } catch {
      // Storage can be blocked; the width then simply follows the breakpoint.
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads the width CSS resolved after the saved choice was applied
    sync();
    const query = window.matchMedia("(min-width: 1024px)");
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, [sync]);

  const toggle = useCallback(() => {
    const next = collapsed ? "expanded" : "collapsed";
    document.documentElement.dataset.sidebar = next;
    try {
      localStorage.setItem(SIDEBAR_KEY, next);
    } catch {
      // Not remembered across visits; still applies now.
    }
    sync();
  }, [collapsed, sync]);

  return { collapsed, toggle };
}
