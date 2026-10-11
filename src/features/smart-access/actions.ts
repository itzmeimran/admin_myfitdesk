"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/core/db/server-client";
import { checkPermission } from "@/core/auth/access";
import type { Permission } from "@/core/auth/permissions";
import { CONFIGURATION_STATUSES, type ConfigurationStatus } from "./config";

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
