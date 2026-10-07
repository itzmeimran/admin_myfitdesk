import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/core/db/database.types";
import { camelize } from "@/core/text/camelize";
import type {
  AccessInfo,
  CheckFinding,
  CreditHistoryRow,
  FlagRow,
  JobRow,
  LockRow,
  NoteRow,
  OpsAlert,
  OpsSummary,
  TimelineEvent,
  WebhookOverview,
  WhatsAppOps,
} from "./types";

type Client = SupabaseClient<Database>;

/** Turns a PostgREST failure into a message an admin can act on. The most
 * common real cause is the environment's database not having the Gym
 * Command Center migrations yet (DEV before its SQL Editor run), which must
 * read as "not available yet", not as a crash. */
function fail(error: { message: string; code?: string }, what: string): never {
  if (error.code === "PGRST202" || /could not find the function|schema cache/i.test(error.message)) {
    throw new Error(
      "This section isn't available in this environment yet — the gym operations database update hasn't been applied here.",
    );
  }
  throw new Error(`${what}: ${error.message}`);
}

export async function getOpsSummary(supabase: Client, organizationId: string): Promise<OpsSummary> {
  const { data, error } = await supabase.rpc("admin_gym_ops_summary", { p_organization_id: organizationId });
  if (error) fail(error, "Couldn't load the operations summary");
  return camelize<OpsSummary>(data);
}

export async function getWhatsAppOps(supabase: Client, organizationId: string): Promise<WhatsAppOps> {
  const { data, error } = await supabase.rpc("admin_gym_whatsapp_ops", { p_organization_id: organizationId });
  if (error) fail(error, "Couldn't load WhatsApp operations");
  return camelize<WhatsAppOps>(data);
}

export async function getCreditHistory(
  supabase: Client,
  organizationId: string,
  limit = 10,
  offset = 0,
): Promise<{ rows: CreditHistoryRow[]; total: number }> {
  const { data, error } = await supabase.rpc("admin_gym_credit_history", {
    p_organization_id: organizationId,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) fail(error, "Couldn't load credit history");
  const rows = data ?? [];
  return {
    total: rows[0]?.total_count ?? 0,
    rows: rows.map((r) => ({
      id: r.id,
      delta: r.delta,
      reason: r.reason,
      balanceAfter: r.balance_after,
      createdAt: r.created_at,
      createdByEmail: r.created_by_email,
      adminReason: r.admin_reason,
    })),
  };
}

export async function getJobs(supabase: Client, organizationId: string): Promise<JobRow[]> {
  const { data, error } = await supabase.rpc("admin_gym_jobs", { p_organization_id: organizationId });
  if (error) fail(error, "Couldn't load job health");
  return camelize<JobRow[]>(data);
}

export async function getWebhooks(supabase: Client, organizationId: string): Promise<WebhookOverview> {
  const { data, error } = await supabase.rpc("admin_gym_webhooks", { p_organization_id: organizationId });
  if (error) fail(error, "Couldn't load webhook health");
  return camelize<WebhookOverview>(data);
}

export async function getReconciliation(supabase: Client, organizationId: string): Promise<CheckFinding[]> {
  const { data, error } = await supabase.rpc("admin_gym_reconciliation", { p_organization_id: organizationId });
  if (error) fail(error, "Couldn't load payment reconciliation");
  return camelize<CheckFinding[]>(data);
}

export async function getDataHealth(supabase: Client, organizationId: string): Promise<CheckFinding[]> {
  const { data, error } = await supabase.rpc("admin_gym_data_health", { p_organization_id: organizationId });
  if (error) fail(error, "Couldn't load data health");
  return camelize<CheckFinding[]>(data);
}

export async function getAlerts(supabase: Client, organizationId: string, includeResolved = false): Promise<OpsAlert[]> {
  const { data, error } = await supabase.rpc("admin_gym_alerts", {
    p_organization_id: organizationId,
    p_include_resolved: includeResolved,
    p_limit: 50,
  });
  if (error) fail(error, "Couldn't load alerts");
  return (data ?? []).map((a) => ({
    id: a.id,
    severity: a.severity as OpsAlert["severity"],
    type: a.type,
    title: a.title,
    message: a.message,
    createdAt: a.created_at,
    status: a.status as OpsAlert["status"],
    acknowledgedAt: a.acknowledged_at,
    acknowledgedByEmail: a.acknowledged_by_email,
    resolvedAt: a.resolved_at,
    resolvedByEmail: a.resolved_by_email,
    resolutionNote: a.resolution_note,
  }));
}

export async function getAccess(supabase: Client, organizationId: string): Promise<AccessInfo> {
  const { data, error } = await supabase.rpc("admin_gym_access", { p_organization_id: organizationId });
  if (error) fail(error, "Couldn't load access details");
  const result = camelize<AccessInfo>(data);
  if (result.owner?.email?.endsWith("@staff.myfitdesk.internal")) {
    result.owner.email = null;
    result.owner.emailVerified = false;
    result.owner.loginMethod = "WhatsApp OTP";
    const { data: invitation } = await supabase.rpc("admin_get_gym_owner_invitation", { p_organization_id: organizationId });
    const phoneInvite = invitation as { invitation_channel?: string; phone_verified_at?: string | null } | null;
    if (phoneInvite?.invitation_channel === "whatsapp") result.owner.phoneVerified = Boolean(phoneInvite.phone_verified_at);
  }
  return result;
}

export async function getLocks(supabase: Client, organizationId: string): Promise<LockRow[]> {
  const { data, error } = await supabase.rpc("admin_gym_locks", { p_organization_id: organizationId });
  if (error) fail(error, "Couldn't load restrictions");
  return (data ?? []).map((l) => ({
    lockType: l.lock_type as LockRow["lockType"],
    isEnabled: l.is_enabled,
    isActive: l.is_active,
    reason: l.reason,
    expiresAt: l.expires_at,
    updatedAt: l.updated_at,
    updatedByEmail: l.updated_by_email,
  }));
}

export async function getFeatureFlags(supabase: Client, organizationId: string): Promise<FlagRow[]> {
  const { data, error } = await supabase.rpc("admin_gym_feature_flags", { p_organization_id: organizationId });
  if (error) fail(error, "Couldn't load feature flags");
  return (data ?? []).map((f) => ({
    flagKey: f.flag_key,
    label: f.label,
    description: f.description,
    defaultEnabled: f.default_enabled,
    isEnabled: f.is_enabled,
    overridden: f.overridden,
    updatedAt: f.updated_at,
    updatedByEmail: f.updated_by_email,
    reason: f.reason,
  }));
}

export async function getNotes(supabase: Client, organizationId: string): Promise<NoteRow[]> {
  const { data, error } = await supabase.rpc("admin_gym_notes_list", { p_organization_id: organizationId });
  if (error) fail(error, "Couldn't load notes");
  return (data ?? []).map((n) => ({
    id: n.id,
    content: n.content,
    category: n.category,
    createdAt: n.created_at,
    updatedAt: n.updated_at,
    createdByEmail: n.created_by_email,
    createdByMe: n.created_by_me,
  }));
}

export type TimelineFilters = {
  search?: string;
  category?: string;
  actorType?: string;
  status?: string;
  from?: string;
  to?: string;
  sortDir?: "asc" | "desc";
};

export async function getTimeline(
  supabase: Client,
  organizationId: string,
  filters: TimelineFilters,
  limit: number,
  offset: number,
): Promise<{ rows: TimelineEvent[]; total: number }> {
  const { data, error } = await supabase.rpc("admin_gym_timeline", {
    p_organization_id: organizationId,
    p_search: filters.search || undefined,
    p_category: filters.category || undefined,
    p_actor_type: filters.actorType || undefined,
    p_status: filters.status || undefined,
    p_from: filters.from || undefined,
    p_to: filters.to || undefined,
    p_sort_dir: filters.sortDir ?? "desc",
    p_limit: limit,
    p_offset: offset,
  });
  if (error) fail(error, "Couldn't load the activity timeline");
  const rows = data ?? [];
  return {
    total: rows[0]?.total_count ?? 0,
    rows: rows.map((r) => ({
      eventId: r.event_id,
      source: r.source,
      occurredAt: r.occurred_at,
      actionKey: r.action_key,
      operation: r.operation,
      entityType: r.entity_type,
      entityId: r.entity_id,
      actorId: r.actor_id,
      actorLabel: r.actor_label,
      actorRole: r.actor_role,
      actorType: r.actor_type,
      category: r.category,
      status: r.status as TimelineEvent["status"],
      memberId: r.member_id,
      memberName: r.member_name,
      amountMinor: r.amount_minor,
      currency: r.currency,
      oldValues: (r.old_values ?? null) as Record<string, unknown> | null,
      newValues: (r.new_values ?? null) as Record<string, unknown> | null,
      changedFields: r.changed_fields,
      detail: (r.detail ?? null) as Record<string, unknown> | null,
      requestId: r.request_id,
      ipAddress: r.ip_address,
      origin: r.origin,
    })),
  };
}
