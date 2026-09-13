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
};

// The design mock had a static `badge: "18"` on Gyms only — that's now a
// live count(organizations) instead (AdminChromeCounts.gymsCount, threaded
// in from admin/layout.tsx), so it's computed at render time in
// admin-sidebar.tsx/admin-chrome.tsx rather than stored here.
// There is ONE catalogue entry, "Packages", because there is one thing to
// manage: the package gym owners buy, on its three billing terms. The older
// Starter/Growth/Pro tier catalogue lives at /admin/packages/legacy and the
// general Plans screen is gone (/admin/plans redirects) — both were a second
// nav entry for the same question ("what can a gym buy?"), which is exactly
// the confusion this collapses. Which catalogue buyers actually see is
// platform_billing_settings.billing_model, switched from the banner on
// /admin/packages.
export const NAV_ITEMS: NavItem[] = [
  { href: "/admin", label: "Overview", icon: OverviewIcon },
  { href: "/admin/gyms", label: "Gyms", icon: GymsIcon },
  { href: "/admin/packages", label: "Packages", icon: PackagesIcon },
  { href: "/admin/revenue", label: "Platform revenue", icon: RevenueIcon },
  { href: "/admin/settings", label: "Settings", icon: SettingsIcon },
];
