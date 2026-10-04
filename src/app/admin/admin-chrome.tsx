"use client";

import { Button } from "@/components/Button";
import { ButtonLink } from "@/components/ButtonLink";
import { useState } from "react";

import { usePathname } from "next/navigation";
import { signOut } from "@/features/auth/actions";
import { SubmitButton } from "@/components/SubmitButton";
import { MenuIcon, CancelIcon, SignOutIcon, SearchIcon, NudgeIcon } from "@/core/ui/icons";
import { ICON_SIZE } from "@/core/ui/icon-size";
import { MOBILE_NAV_ITEMS, NAV_ITEMS, visibleNavItems } from "./nav-items";
import { EnvironmentPill } from "./environment-pill";

/**
 * Everything below `md` (the design's "narrow" flag, <768px — see
 * admin-sidebar.tsx's docblock for why 768 rather than 1024): the
 * hamburger button + slide-in drawer, the fixed 5-tab bottom bar, the
 * header's search input, and the alerts bell. Bundled into one Client
 * Component (mirrors
 * FitDeskApp/src/app/dashboard/dashboard-chrome.tsx's hamburger+drawer+
 * bottom-tabs bundling) because the hamburger and the drawer share
 * `menuOpen` state; the search input and bell are stateless today but live
 * here too since the design specs them as part of the same header row.
 *
 * The desktop search submits to the real server-filtered Gyms directory.
 * The alert icon links to Overview's live "Needs attention" band when a
 * badge exists and becomes a quiet status indicator at zero, so neither
 * control presents a dead interaction.
 */
export function AdminChrome({
  email,
  gymsCount,
  alertsCount,
  salesAttentionCount,
  permissions,
}: {
  email: string;
  gymsCount: number;
  alertsCount: number;
  salesAttentionCount: number | null;
  permissions: string[];
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/admin" ? pathname === href : pathname.startsWith(href));
  const initials = email.slice(0, 2).toUpperCase();
  const badgeFor = (href: string) => (href === "/admin/gyms" ? String(gymsCount) : href === '/admin/sales' && salesAttentionCount ? String(salesAttentionCount) : undefined);

  return (
    <>
      <Button
        type="button"
        aria-label="Open menu"
        onClick={() => setMenuOpen(true)}
        variant="ghost" size="lg" iconOnly className="-ml-2 flex-shrink-0 md:hidden"
      >
        <MenuIcon size={20} aria-hidden />
      </Button>

      <div className="mr-auto flex min-w-0 items-center gap-2.5">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[10px] font-bold uppercase tracking-[0.13em] text-mute">Platform</span>
          <span className="truncate text-[13.5px] font-bold tracking-[-0.01em]">All gyms</span>
        </div>
        <EnvironmentPill compact />
      </div>

      <form
        action="/admin/gyms"
        method="get"
        role="search"
        className="hidden w-[230px] items-center gap-2 border-[1.5px] border-line bg-paper px-2.5 transition-colors focus-within:border-ink md:flex"
        style={{ minHeight: 34 }}
      >
        <SearchIcon size={15} className="text-mute2" aria-hidden />
        <input
          type="text"
          name="q"
          aria-label="Search gyms, owners or city"
          placeholder="Search gyms, owners or city"
          className="w-full border-0 bg-transparent text-[12.5px] text-ink outline-none placeholder:text-mute2"
        />
      </form>

      {alertsCount > 0 ? (
        <ButtonLink
          href="/admin#mfd-attn"
          aria-label={`View ${alertsCount} accounts needing attention`}
          title="View accounts needing attention"
          variant="secondary" size="sm" iconOnly className="relative flex-shrink-0"
        >
          <NudgeIcon size={16} aria-hidden />
          <span className="absolute -right-[7px] -top-[7px] flex h-[17px] min-w-[17px] items-center justify-center bg-accent px-1 text-[9.5px] font-bold text-paper">
            {alertsCount}
          </span>
        </ButtonLink>
      ) : (
        <span
          aria-label="No accounts currently need attention"
          title="No accounts need attention"
          className="relative flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center border-[1.5px] border-line bg-paper text-mute3"
        >
          <NudgeIcon size={16} aria-hidden />
        </span>
      )}

      <span className="flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center border-[1.5px] border-ink text-[11px] font-bold md:hidden">
        {initials}
      </span>

      <nav
        className="fixed inset-x-0 bottom-0 z-20 grid border-t-[1.5px] border-ink bg-paper md:hidden"
        style={{ gridTemplateColumns: `repeat(${Math.max(visibleNavItems(MOBILE_NAV_ITEMS, permissions).length, 1)}, minmax(0, 1fr))` }}
        aria-label="Primary mobile navigation"
      >
        {visibleNavItems(MOBILE_NAV_ITEMS, permissions).map((item) => {
          const badge = badgeFor(item.href);
          return (
            <ButtonLink
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? "page" : undefined}
              variant="control" size="custom" className={`relative flex min-h-[62px] flex-col items-center justify-center gap-1.5 px-0.5 ${
                isActive(item.href) ? "bg-ink text-hi" : "text-mute"
              }`}
            >
              <item.icon size={ICON_SIZE.nav} className="flex-shrink-0" aria-hidden />
              <span className="text-center text-[11px] font-bold leading-[1.05]">
                {item.label === "Platform revenue" ? "Revenue" : item.label}
              </span>
              {badge ? (
                <span
                  aria-label={`${badge} total`}
                  className="absolute right-2 top-1 text-[9.5px] font-bold tabular-nums text-mute2"
                >
                  {badge}
                </span>
              ) : null}
            </ButtonLink>
          );
        })}
      </nav>

      {menuOpen ? (
        <div className="fixed inset-0 z-30 flex">
          <nav className="flex w-[270px] flex-shrink-0 flex-col justify-between overflow-y-auto bg-ink p-3 text-paper">
            <div className="flex flex-col gap-5">
              <div className="flex items-center justify-between gap-2.5 px-1.5">
                <span className="flex items-center gap-2.5">
                  <span className="flex h-[30px] w-[30px] items-center justify-center bg-hi text-[10.5px] font-bold text-ink">
                    MF
                  </span>
                  <span className="flex flex-col gap-0.5">
                    <span className="text-[11px] font-bold uppercase tracking-[0.12em]">MyFitDesk</span>
                    <span className="text-[10px] uppercase tracking-[0.1em] text-mute3">Platform admin</span>
                  </span>
                </span>
                <Button tone="inverse"
                  type="button"
                  aria-label="Close menu"
                  onClick={() => setMenuOpen(false)}
                  variant="ghost" size="lg" iconOnly className="-mr-2 flex-shrink-0"
                >
                  <CancelIcon size={18} aria-hidden />
                </Button>
              </div>

              <div className="flex flex-col gap-0.5">
                {visibleNavItems(NAV_ITEMS, permissions).map((item) => {
                  const active = isActive(item.href);
                  const badge = badgeFor(item.href);
                  return (
                    <ButtonLink
                      key={item.href}
                      href={item.href}
                      onClick={() => setMenuOpen(false)}
                      variant="control" size="custom" className={`flex min-h-[48px] items-center gap-3.5 border-l-2 px-3 text-[14px] ${
                        active
                          ? "border-hi bg-[#302620] font-bold text-paper"
                          : "border-transparent text-mute3 hover:bg-[#302620] hover:text-paper"
                      }`}
                    >
                      <item.icon size={ICON_SIZE.nav} className="flex-shrink-0" aria-hidden />
                      <span className="flex-1">{item.label}</span>
                      {badge ? (
                        <span
                          aria-label={`${badge} total`}
                          className="flex-shrink-0 text-[11px] font-bold tabular-nums text-mute3"
                        >
                          {badge}
                        </span>
                      ) : null}
                    </ButtonLink>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-col gap-3 border-t border-inkline px-2.5 pt-3.5">
              <div className="flex items-center gap-2.5">
                <span className="flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center bg-hi text-[11px] font-bold text-ink">
                  {initials}
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-[12.5px] font-bold">{email}</span>
                  <span className="truncate text-[10px] text-mute3">Platform owner</span>
                </span>
              </div>
              <form action={signOut}>
                <SubmitButton tone="inverse" variant="ghost" size="sm"
                  icon={SignOutIcon}
                  pendingLabel="Signing out…"
                  className="w-full border"
                >
                  Sign out
                </SubmitButton>
              </form>
            </div>
          </nav>
          <Button
            type="button"
            aria-label="Dismiss"
            onClick={() => setMenuOpen(false)}
            variant="overlay" size="custom" className="flex-1 cursor-pointer border-none bg-black/45"
          />
        </div>
      ) : null}
    </>
  );
}
