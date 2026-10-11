import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/core/db/database.types";

/**
 * Smart Access (eSSL biometric) review data. Every read goes through a
 * permission-gated SECURITY DEFINER RPC (migration 1032), never a direct
 * table select, so a gym user's token can't reach any of it.
 */

export type SmartAccessRequestStatus = "pending" | "approved" | "rejected" | "cancelled";

export type SmartAccessRequestRow = {
  id: string;
  organizationId: string;
  gymName: string;
  status: SmartAccessRequestStatus;
  ownerNote: string | null;
  requestedAt: string;
  requestedByEmail: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
  adminNotes: string | null;
  entitled: boolean;
  packageName: string | null;
  integrationStatus: string | null;
  integrationEnabled: boolean | null;
  hasIngestToken: boolean;
  lastEventReceivedAt: string | null;
  lastSuccessfulSyncAt: string | null;
  lastSyncError: string | null;
};

export type SmartAccessPackageRow = {
  id: string;
  code: string;
  name: string;
  billingPeriod: string;
  status: string;
  includesSmartAccess: boolean;
  gymCount: number;
};

type Row = Record<string, unknown>;
const s = (v: unknown) => (typeof v === "string" ? v : null);

export async function listSmartAccessRequests(
  supabase: SupabaseClient<Database>,
  status: SmartAccessRequestStatus | null,
): Promise<{ rows: SmartAccessRequestRow[]; error: string | null }> {
  const { data, error } = await supabase.rpc("admin_list_smart_access_requests", { p_status: status });
  if (error) return { rows: [], error: error.message };
  return {
    error: null,
    rows: ((data ?? []) as unknown as Row[]).map((r) => ({
      id: String(r.id),
      organizationId: String(r.organization_id),
      gymName: s(r.gym_name) ?? "Unnamed gym",
      status: (s(r.status) ?? "pending") as SmartAccessRequestStatus,
      ownerNote: s(r.owner_note),
      requestedAt: String(r.requested_at),
      requestedByEmail: s(r.requested_by_email),
      reviewedAt: s(r.reviewed_at),
      rejectionReason: s(r.rejection_reason),
      adminNotes: s(r.admin_notes),
      entitled: r.entitled === true,
      packageName: s(r.package_name),
      integrationStatus: s(r.integration_status),
      integrationEnabled: typeof r.integration_enabled === "boolean" ? r.integration_enabled : null,
      hasIngestToken: r.has_ingest_token === true,
      lastEventReceivedAt: s(r.last_event_received_at),
      lastSuccessfulSyncAt: s(r.last_successful_sync_at),
      lastSyncError: s(r.last_sync_error),
    })),
  };
}

export async function listSmartAccessPackages(
  supabase: SupabaseClient<Database>,
): Promise<{ rows: SmartAccessPackageRow[]; error: string | null }> {
  const { data, error } = await supabase.rpc("admin_list_smart_access_packages");
  if (error) return { rows: [], error: error.message };
  return {
    error: null,
    rows: ((data ?? []) as unknown as Row[]).map((r) => ({
      id: String(r.id),
      code: s(r.code) ?? "",
      name: s(r.name) ?? "",
      billingPeriod: s(r.billing_period) ?? "",
      status: s(r.status) ?? "active",
      includesSmartAccess: r.includes_smart_access === true,
      gymCount: Number(r.gym_count ?? 0),
    })),
  };
}
