import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/core/db/database.types";
import { loose } from "@/core/db/loose-client";
import { loaded, loadedFailure, type Loaded } from "./rpc-result";

/**
 * Settings → Security read models. Counts come from platform_admins, auth.mfa_factors
 * and auth.sessions inside admin_security_overview() / admin_list_admin_sessions();
 * the access history is the existing admin_audit_log filtered to this area's
 * actions by admin_access_history(). Nothing here is computed in the browser.
 */

export type SecurityOverview = {
  activeAdmins: number;
  activeOwners: number;
  pendingInvites: number;
  expiredInvites: number;
  suspendedAdmins: number;
  revokedAdmins: number;
  mfaEnabledAdmins: number;
  adminSessions: number;
  securityEvents24h: number;
  isProductionDatabase: boolean;
};

export async function getSecurityOverview(supabase: SupabaseClient<Database>): Promise<Loaded<SecurityOverview>> {
  const { data, error } = await loose(supabase).rpc("admin_security_overview");
  if (error) return loadedFailure(error);
  const raw = data as Record<string, number | boolean>;
  return loaded({
    activeAdmins: Number(raw.active_admins ?? 0),
    activeOwners: Number(raw.active_owners ?? 0),
    pendingInvites: Number(raw.pending_invites ?? 0),
    expiredInvites: Number(raw.expired_invites ?? 0),
    suspendedAdmins: Number(raw.suspended_admins ?? 0),
    revokedAdmins: Number(raw.revoked_admins ?? 0),
    mfaEnabledAdmins: Number(raw.mfa_enabled_admins ?? 0),
    adminSessions: Number(raw.admin_sessions ?? 0),
    securityEvents24h: Number(raw.security_events_24h ?? 0),
    isProductionDatabase: Boolean(raw.is_production_database),
  });
}

export type AdminSession = {
  sessionId: string;
  userId: string;
  email: string;
  createdAt: string;
  refreshedAt: string | null;
  userAgent: string | null;
  ip: string | null;
  aal: string | null;
  isCurrent: boolean;
};

export async function listAdminSessions(supabase: SupabaseClient<Database>): Promise<Loaded<AdminSession[]>> {
  const { data, error } = await loose(supabase).rpc("admin_list_admin_sessions");
  if (error) return loadedFailure(error);
  const rows = (data ?? []) as {
    session_id: string;
    user_id: string;
    email: string;
    created_at: string;
    refreshed_at: string | null;
    user_agent: string | null;
    ip: string | null;
    aal: string | null;
    is_current: boolean;
  }[];
  return loaded(
    rows.map((row) => ({
      sessionId: row.session_id,
      userId: row.user_id,
      email: row.email,
      createdAt: row.created_at,
      refreshedAt: row.refreshed_at,
      userAgent: row.user_agent,
      ip: row.ip,
      aal: row.aal,
      isCurrent: row.is_current,
    })),
  );
}

export const HISTORY_CATEGORIES = [
  { value: "all", label: "All events" },
  { value: "admins", label: "Admins & access" },
  { value: "settings", label: "Settings" },
  { value: "environment", label: "Environment" },
  { value: "security", label: "Security" },
  { value: "integration", label: "Integrations" },
] as const;

export type HistoryCategory = (typeof HISTORY_CATEGORIES)[number]["value"];

export function parseHistoryCategory(value: string | undefined): HistoryCategory {
  return HISTORY_CATEGORIES.some((c) => c.value === value) ? (value as HistoryCategory) : "all";
}

export type AccessEvent = {
  id: number;
  action: string;
  actorEmail: string | null;
  actorRole: string | null;
  entityType: string | null;
  entityId: string | null;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  environment: string | null;
  occurredAt: string;
};

export async function getAccessHistory(
  supabase: SupabaseClient<Database>,
  category: HistoryCategory,
  page: number,
  pageSize: number,
): Promise<Loaded<{ events: AccessEvent[]; total: number }>> {
  const { data, error } = await loose(supabase).rpc("admin_access_history", {
    p_category: category === "all" ? null : category,
    p_limit: pageSize,
    p_offset: (page - 1) * pageSize,
  });
  if (error) return loadedFailure(error);

  const rows = (data ?? []) as {
    event_id: number;
    event_action: string;
    actor_email: string | null;
    actor_role: string | null;
    entity_type: string | null;
    entity_id: string | null;
    old_values: Record<string, unknown> | null;
    new_values: Record<string, unknown> | null;
    metadata: Record<string, unknown> | null;
    event_environment: string | null;
    occurred_at: string;
    total_count: number;
  }[];

  return loaded({
    total: rows.length ? Number(rows[0].total_count) : 0,
    events: rows.map((row) => ({
      id: Number(row.event_id),
      action: row.event_action,
      actorEmail: row.actor_email,
      actorRole: row.actor_role,
      entityType: row.entity_type,
      entityId: row.entity_id,
      oldValues: row.old_values,
      newValues: row.new_values,
      metadata: row.metadata,
      environment: row.event_environment,
      occurredAt: row.occurred_at,
    })),
  });
}
