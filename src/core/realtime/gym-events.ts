/**
 * Event → affected-UI mapping for Admin → Gym Details.
 *
 * The database sends only `{ t: <table>, op, n }` (see the
 * 20260930120000_admin_gym_realtime migration). This file is the single place
 * that says which parts of the Gym Details workspace read from each table.
 *
 * "header" = everything rendered by `[id]/layout.tsx` above the tabs (name,
 * status, plan, expiry, owner, tab counts, owner-invitation card). Because
 * the layout is preserved across tab navigations, a header-affecting event
 * must refresh regardless of which tab is open.
 *
 * Every other section is a tab page. Tab pages are dynamic Server Components
 * that the router refetches on every visit, so an event that only affects an
 * inactive tab needs no work now: the tab is current the moment it is opened.
 */

export type GymSection =
  | "header"
  | "overview"
  | "members"
  | "team"
  | "billing"
  | "activity"
  | "whatsapp"
  | "settings";

export const TABLE_SECTIONS: Record<string, readonly GymSection[]> = {
  // Identity / directory
  organizations: ["header", "overview", "settings"],
  gyms: ["header", "overview", "settings"],
  // Subscription → header (plan/status/expiry), Overview, Subscription & Billing
  organization_subscriptions: ["header", "overview", "billing"],
  // Members → header (count), Overview KPIs, Members tab
  members: ["header", "overview", "members"],
  member_subscriptions: ["overview", "members"],
  // Tenant-side member payments feed Overview revenue + member rows
  payments: ["overview", "members"],
  // Branches & team → header (tab counts), Overview, Branches & Team tab
  branches: ["header", "overview", "team"],
  staff_memberships: ["header", "overview", "team"],
  staff_invitations: ["header", "team"],
  // Platform billing (the gym paying MyFitDesk)
  platform_payments: ["overview", "billing"],
  // WhatsApp
  whatsapp_messages: ["overview", "whatsapp"],
  whatsapp_credit_balances: ["overview", "whatsapp"],
  whatsapp_credit_transactions: ["overview", "whatsapp"],
  whatsapp_credit_purchases: ["overview", "whatsapp"],
  whatsapp_integrations: ["overview", "settings"],
  // Integrations / settings surfaced on Overview
  payment_gateway_integrations: ["overview", "settings"],
  notification_preferences: ["overview", "settings"],
  owner_whatsapp_automation_settings: ["overview", "settings"],
  // Admin-side records
  admin_gym_notes: ["overview"],
  admin_audit_log: ["overview", "activity"],
};

/** Which tab the admin is currently looking at, from the pathname. */
export function sectionFromPathname(pathname: string, organizationId: string): GymSection {
  const rest = pathname.replace(`/admin/gyms/${organizationId}`, "").replace(/^\/+/, "");
  const first = rest.split("/")[0];
  switch (first) {
    case "members":
      return "members";
    case "team":
      return "team";
    case "billing":
      return "billing";
    case "activity":
      return "activity";
    case "whatsapp":
      return "whatsapp";
    case "settings":
      return "settings";
    default:
      return "overview";
  }
}

/**
 * Should this event refresh what is on screen right now?
 * Unknown tables refresh (fail toward fresh, never toward stale).
 */
export function affectsCurrentView(table: string | undefined, current: GymSection): boolean {
  if (!table) return true;
  const affected = TABLE_SECTIONS[table];
  if (!affected) return true;
  return affected.includes("header") || affected.includes(current);
}
