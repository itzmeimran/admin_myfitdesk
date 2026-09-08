import {
  OverviewIcon,
  GymsIcon,
  PackagesIcon,
  RevenueIcon,
  SettingsIcon,
  type IconType,
} from "@/core/ui/icons";

// Plain data, deliberately NOT in a "use client" file — same reasoning as
// FitDeskApp/src/app/dashboard/nav-items.ts: admin-chrome.tsx (a Client
// Component) and admin/layout.tsx (a Server Component) both need this array
// as real data, and importing a non-component value export from a "use
// client" module into a Server Component silently hands back a client
// reference instead (breaks `.map()` at runtime, no type/build error).
//
// `icon` holds the component reference (not JSX), so this stays a plain
// `.ts` module even though @/core/ui/icons is itself "use client" for the
// same reason (see that file's docblock).
export type NavItem = {
  href: string;
  label: string;
  icon: IconType;
  /** Static per the design mock (NAV's `badge: "18"` on Gyms only) — not
   * derived from anything live yet. */
  badge?: string;
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/admin", label: "Overview", icon: OverviewIcon },
  // TODO(real-data): badge should be a live count once Gyms reads from
  // organizations — see design-audit.md's Data mapping section
  // ("count(organizations) where deleted_at is null").
  { href: "/admin/gyms", label: "Gyms", icon: GymsIcon, badge: "18" },
  { href: "/admin/packages", label: "Packages", icon: PackagesIcon },
  { href: "/admin/revenue", label: "Platform revenue", icon: RevenueIcon },
  { href: "/admin/settings", label: "Settings", icon: SettingsIcon },
];
