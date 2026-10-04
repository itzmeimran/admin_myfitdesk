/**
 * The permission vocabulary shared by the database and the app. The source of
 * truth for WHICH ROLE HOLDS WHICH PERMISSION is the database
 * (platform_role_permissions, supabase/migrations/20260930180000_platform_settings.sql);
 * this file only names the permissions the app checks, so a typo is a type
 * error instead of a silently-always-false string.
 *
 * Plain module (no "server-only"/"use client") so both Server Components and
 * Client Components (which only ever receive a resolved list, never decide)
 * can import the names.
 */
export const PERMISSIONS = [
  "sales.view",
  "sales.manage",
  "sales.reassign",
  "settings.view",
  "settings.manage",
  "admins.view",
  "admins.manage",
  "security.view",
  "audit.view",
  "integrations.view",
  "privacy.view",
  "privacy.manage",
  "system.view",
  "gyms.view",
  "gyms.manage",
  "subscriptions.manage",
  "packages.view",
  "packages.manage",
  "revenue.view",
  "whatsapp.view",
  "whatsapp.manage",
  "recovery.view",
  "recovery.manage",
  "api_performance.view",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_LABEL: Record<string, string> = {
  sales_manager: "Sales Manager",
  sales_rep: "Sales Rep",
  platform_owner: "Platform Owner",
  operations_admin: "Operations Admin",
  support_admin: "Support Admin",
  finance_admin: "Finance Admin",
};

export type AdminStatus = "pending" | "active" | "suspended" | "revoked" | "expired";

export const ADMIN_STATUS_LABEL: Record<AdminStatus, string> = {
  pending: "Pending",
  active: "Active",
  suspended: "Suspended",
  revoked: "Revoked",
  expired: "Expired",
};
