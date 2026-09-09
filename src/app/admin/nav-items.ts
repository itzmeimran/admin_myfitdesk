import {
  OverviewIcon,
  GymsIcon,
  PackagesIcon,
  PlansIcon,
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
};

// The design mock had a static `badge: "18"` on Gyms only — that's now a
// live count(organizations) instead (AdminChromeCounts.gymsCount, threaded
// in from admin/layout.tsx), so it's computed at render time in
// admin-sidebar.tsx/admin-chrome.tsx rather than stored here.
// "Packages" (legacy, fixed Starter/Growth/Pro rows) and "Plans" (the newer
// dynamic system — arbitrary plans/cycles/features/offers) are deliberately
// two separate nav entries, not one merged screen: the admin manages both
// catalogues independently, and platform_billing_settings.billing_model
// (Settings) decides which one buyers actually see — see that migration's
// (1006) own header comment for why this is additive rather than a
// replacement.
export const NAV_ITEMS: NavItem[] = [
  { href: "/admin", label: "Overview", icon: OverviewIcon },
  { href: "/admin/gyms", label: "Gyms", icon: GymsIcon },
  { href: "/admin/packages", label: "Packages", icon: PackagesIcon },
  { href: "/admin/plans", label: "Plans", icon: PlansIcon },
  { href: "/admin/revenue", label: "Platform revenue", icon: RevenueIcon },
  { href: "/admin/settings", label: "Settings", icon: SettingsIcon },
];
