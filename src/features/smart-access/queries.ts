import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/core/db/database.types";
import type { BiometricDeviceRow, DeviceHistoryRow, DeviceStatus, UnclaimedDeviceRow } from "./devices";

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

/** Every linked device, gym by gym (migration 1034). */
export async function listBiometricDevices(
  supabase: SupabaseClient<Database>,
): Promise<{ rows: BiometricDeviceRow[]; error: string | null }> {
  const { data, error } = await supabase.rpc("admin_list_biometric_devices", { p_organization_id: null });
  if (error) return { rows: [], error: error.message };
  return {
    error: null,
    rows: ((data ?? []) as unknown as Row[]).map((r) => ({
      id: String(r.id),
      serial: String(r.serial),
      organizationId: String(r.organization_id),
      gymName: s(r.gym_name) ?? "Unnamed gym",
      branchId: String(r.branch_id),
      branchName: s(r.branch_name) ?? "Branch",
      label: s(r.label),
      firmware: s(r.firmware),
      status: (r.status === "disabled" ? "disabled" : "active") as DeviceStatus,
      firstSeenAt: s(r.first_seen_at),
      lastSeenAt: s(r.last_seen_at),
      coveredUntil: s(r.covered_until),
      integrationStatus: s(r.integration_status),
      integrationEnabled: r.integration_enabled === true,
    })),
  };
}

/** Serials that called the receiver but belong to no gym yet (migration 1034). */
export async function listUnclaimedDevices(
  supabase: SupabaseClient<Database>,
): Promise<{ rows: UnclaimedDeviceRow[]; error: string | null }> {
  const { data, error } = await supabase.rpc("admin_list_unclaimed_biometric_devices");
  if (error) return { rows: [], error: error.message };
  return {
    error: null,
    rows: ((data ?? []) as unknown as Row[]).map((r) => ({
      serial: String(r.serial),
      firmware: s(r.firmware),
      firstSeenAt: String(r.first_seen_at),
      lastSeenAt: String(r.last_seen_at),
    })),
  };
}

/** A gym's device history, newest first; one device's when `deviceId` is given (migration 1035). */
export async function listDeviceHistory(
  supabase: SupabaseClient<Database>,
  organizationId: string,
  deviceId: string | null,
): Promise<{ rows: DeviceHistoryRow[]; error: string | null }> {
  const { data, error } = await supabase.rpc("admin_list_biometric_device_history", {
    p_organization_id: organizationId,
    p_device_id: deviceId,
    p_limit: 200,
  });
  if (error) return { rows: [], error: error.message };
  return {
    error: null,
    rows: ((data ?? []) as unknown as Row[]).map((r) => ({
      id: String(r.id),
      deviceId: String(r.device_id),
      serial: String(r.serial),
      event: String(r.event) as DeviceHistoryRow["event"],
      details: r.details && typeof r.details === "object" ? (r.details as Record<string, unknown>) : {},
      reason: String(r.reason ?? ""),
      actorEmail: s(r.actor_email),
      at: String(r.at),
    })),
  };
}
