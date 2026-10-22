"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/core/db/server-client";
import { checkPermission } from "@/core/auth/access";
import type { Permission } from "@/core/auth/permissions";
import { listBranchOptions } from "@/features/gyms/branches";
import { CONFIGURATION_STATUSES, type ConfigurationStatus } from "./config";
import { listDeviceHistory } from "./queries";
import { normalizeSerial, serialProblem, type DeviceHistoryRow } from "./devices";

/**
 * Smart Access admin writes. Thin wrappers over the permission-gated,
 * audited RPCs in migration 1032; the database re-checks the permission,
 * the reason, plan entitlement and the approval state on every call.
 */
export type SmartAccessResult = { error: string | null; message?: string };

const reason = z.string().trim().min(3, "Enter a reason (at least 3 characters).").max(500, "Keep the reason under 500 characters.");
const uuid = z.string().uuid();

async function denied(permission: Permission): Promise<SmartAccessResult | null> {
  const result = await checkPermission(permission);
  return result.ok ? null : { error: result.error };
}

function refresh() {
  revalidatePath("/admin/smart-access");
}

export async function reviewSmartAccessRequest(input: {
  requestId: string;
  approve: boolean;
  reason: string;
  adminNotes?: string;
}): Promise<SmartAccessResult> {
  const parsed = z
    .object({ requestId: uuid, approve: z.boolean(), reason, adminNotes: z.string().trim().max(2000).optional() })
    .safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the details." };
  const no = await denied("gyms.manage");
  if (no) return no;
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_review_smart_access_request", {
    p_request_id: parsed.data.requestId,
    p_approve: parsed.data.approve,
    p_reason: parsed.data.reason,
    p_admin_notes: parsed.data.adminNotes || null,
  });
  if (error) return { error: error.message };
  refresh();
  return { error: null, message: parsed.data.approve ? "Request approved." : "Request rejected." };
}

export async function updateBiometricIntegration(input: {
  organizationId: string;
  configurationStatus: ConfigurationStatus;
  enabled: boolean;
  reason: string;
}): Promise<SmartAccessResult> {
  const parsed = z
    .object({ organizationId: uuid, configurationStatus: z.enum(CONFIGURATION_STATUSES), enabled: z.boolean(), reason })
    .safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the details." };
  const no = await denied("gyms.manage");
  if (no) return no;
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_update_biometric_integration", {
    p_organization_id: parsed.data.organizationId,
    p_configuration_status: parsed.data.configurationStatus,
    p_enabled: parsed.data.enabled,
    p_reason: parsed.data.reason,
  });
  if (error) return { error: error.message };
  refresh();
  return { error: null, message: "Integration updated." };
}

/** Returns the plaintext token exactly once; it is never stored or logged. */
export async function issueBiometricIngestToken(input: { organizationId: string; reason: string }): Promise<SmartAccessResult & { token?: string }> {
  const parsed = z.object({ organizationId: uuid, reason }).safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the details." };
  const no = await denied("gyms.manage");
  if (no) return no;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_issue_biometric_ingest_token", {
    p_organization_id: parsed.data.organizationId,
    p_reason: parsed.data.reason,
  });
  if (error) return { error: error.message };
  refresh();
  return { error: null, token: data as string };
}

export async function setPackageSmartAccess(input: { packageId: string; included: boolean; reason: string }): Promise<SmartAccessResult> {
  const parsed = z.object({ packageId: uuid, included: z.boolean(), reason }).safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the details." };
  const no = await denied("packages.manage");
  if (no) return no;
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_package_smart_access", {
    p_package_id: parsed.data.packageId,
    p_included: parsed.data.included,
    p_reason: parsed.data.reason,
  });
  if (error) return { error: error.message };
  refresh();
  return { error: null, message: parsed.data.included ? "Package now includes Smart Access." : "Smart Access removed from package." };
}

export type SyncJobRow = {
  id: string;
  syncType: string;
  status: string;
  total: number;
  succeeded: number;
  failed: number;
  error: string | null;
  createdAt: string;
};

export async function listBiometricSyncJobs(organizationId: string): Promise<{ error: string | null; jobs: SyncJobRow[] }> {
  if (!uuid.safeParse(organizationId).success) return { error: "Unknown gym.", jobs: [] };
  const no = await denied("gyms.view");
  if (no) return { error: no.error, jobs: [] };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_list_biometric_sync_jobs", { p_organization_id: organizationId, p_limit: 20 });
  if (error) return { error: error.message, jobs: [] };
  return {
    error: null,
    jobs: ((data ?? []) as unknown as Record<string, unknown>[]).map((j) => ({
      id: String(j.id),
      syncType: String(j.sync_type),
      status: String(j.status),
      total: Number(j.total_records ?? 0),
      succeeded: Number(j.successful_records ?? 0),
      failed: Number(j.failed_records ?? 0),
      error: typeof j.error_summary === "string" ? j.error_summary : null,
      createdAt: String(j.created_at),
    })),
  };
}

// ── Devices (migrations 1034 and 1035) ──

const label = z.string().trim().max(80, "Keep the name under 80 characters.").optional();

/** Branch choices for one gym, for the add / edit device forms. */
export async function listGymBranchChoices(organizationId: string): Promise<{ error: string | null; branches: { id: string; name: string }[] }> {
  if (!uuid.safeParse(organizationId).success) return { error: "Unknown gym.", branches: [] };
  const no = await denied("gyms.view");
  if (no) return { error: no.error, branches: [] };
  try {
    const supabase = await createClient();
    return { error: null, branches: await listBranchOptions(supabase, organizationId) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Couldn't load the branches.", branches: [] };
  }
}

/** Links a serial to a gym and branch. The gym must already have an approved Smart Access request. */
export async function linkBiometricDevice(input: {
  serial: string;
  organizationId: string;
  branchId: string;
  label?: string;
  reason: string;
}): Promise<SmartAccessResult> {
  const problem = serialProblem(input.serial);
  if (problem) return { error: problem };
  const parsed = z.object({ organizationId: uuid, branchId: uuid, label, reason }).safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the details." };
  const no = await denied("gyms.manage");
  if (no) return no;
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_link_biometric_device", {
    p_serial: normalizeSerial(input.serial),
    p_organization_id: parsed.data.organizationId,
    p_branch_id: parsed.data.branchId,
    p_label: parsed.data.label || null,
    p_reason: parsed.data.reason,
  });
  if (error) return { error: error.message };
  refresh();
  return { error: null, message: "Device linked." };
}

/** Rename, move to another branch of the same gym, or disable / enable. Only what is passed changes. */
export async function updateBiometricDevice(input: {
  deviceId: string;
  label?: string | null;
  branchId?: string | null;
  status?: "active" | "disabled" | null;
  reason: string;
}): Promise<SmartAccessResult> {
  const parsed = z
    .object({
      deviceId: uuid,
      label: z.string().trim().max(80, "Keep the name under 80 characters.").nullish(),
      branchId: uuid.nullish(),
      status: z.enum(["active", "disabled"]).nullish(),
      reason,
    })
    .safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the details." };
  const no = await denied("gyms.manage");
  if (no) return no;
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_update_biometric_device", {
    p_device_id: parsed.data.deviceId,
    p_label: parsed.data.label ?? null,
    p_branch_id: parsed.data.branchId ?? null,
    p_status: parsed.data.status ?? null,
    p_reason: parsed.data.reason,
  });
  if (error) return { error: error.message };
  refresh();
  return { error: null, message: "Device updated." };
}

/** Changes a device's serial (a typo, or a replacement unit). The reason is required and kept in the device's history. */
export async function changeBiometricDeviceSerial(input: { deviceId: string; newSerial: string; reason: string }): Promise<SmartAccessResult> {
  const problem = serialProblem(input.newSerial);
  if (problem) return { error: problem };
  const parsed = z.object({ deviceId: uuid, reason }).safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the details." };
  const no = await denied("gyms.manage");
  if (no) return no;
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_change_biometric_device_serial", {
    p_device_id: parsed.data.deviceId,
    p_new_serial: normalizeSerial(input.newSerial),
    p_reason: parsed.data.reason,
  });
  if (error) return { error: error.message };
  refresh();
  return { error: null, message: "Serial changed." };
}

/** Removes the link. The serial becomes unknown again; the history and every stored punch are kept. */
export async function unlinkBiometricDevice(input: { deviceId: string; reason: string }): Promise<SmartAccessResult> {
  const parsed = z.object({ deviceId: uuid, reason }).safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the details." };
  const no = await denied("gyms.manage");
  if (no) return no;
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_unlink_biometric_device", {
    p_device_id: parsed.data.deviceId,
    p_reason: parsed.data.reason,
  });
  if (error) return { error: error.message };
  refresh();
  return { error: null, message: "Device unlinked." };
}

/** A gym's device history (or one device's), with branch names resolved for the screen. */
export async function loadBiometricDeviceHistory(
  organizationId: string,
  deviceId: string | null,
): Promise<{ error: string | null; rows: DeviceHistoryRow[]; branchNames: Record<string, string> }> {
  if (!uuid.safeParse(organizationId).success || (deviceId !== null && !uuid.safeParse(deviceId).success)) {
    return { error: "Unknown device.", rows: [], branchNames: {} };
  }
  const no = await denied("gyms.view");
  if (no) return { error: no.error, rows: [], branchNames: {} };
  const supabase = await createClient();
  const [history, branches] = await Promise.all([
    listDeviceHistory(supabase, organizationId, deviceId),
    listGymBranchChoices(organizationId),
  ]);
  return {
    error: history.error,
    rows: history.rows,
    branchNames: Object.fromEntries(branches.branches.map((b) => [b.id, b.name])),
  };
}
