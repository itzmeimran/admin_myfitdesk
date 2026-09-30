"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/core/db/server-client";
import { checkPermission } from "@/core/auth/access";
import type { Permission } from "@/core/auth/permissions";
import { LOCK_CATALOG } from "./types";

/**
 * Privileged Gym Command Center writes. Every one is a thin wrapper over a
 * SECURITY DEFINER RPC that re-checks `app.is_platform_admin()`, requires a
 * reason, and writes admin_audit_log in the same transaction — this file
 * only validates shape and refreshes the gym's pages.
 */
export type OpsResult = { error: string | null; message?: string };

const reason = z.string().trim().min(3, "Enter a reason (at least 3 characters).").max(500, "Keep the reason under 500 characters.");
const orgId = z.string().uuid();
const lockTypes = LOCK_CATALOG.map((l) => l.type) as [string, ...string[]];

/** Role check that runs before any write. The RPCs behind these actions only
 * verify "active platform admin", so the role-based permission is enforced
 * here as well — a Support Admin cannot call these even by hand. */
async function denied(permission: Permission): Promise<OpsResult | null> {
  const result = await checkPermission(permission);
  return result.ok ? null : { error: result.error };
}

function refresh(organizationId: string) {
  revalidatePath(`/admin/gyms/${organizationId}`, "layout");
}

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Check the details and try again.";
}

export async function setOperationLock(input: {
  organizationId: string;
  lockType: string;
  enabled: boolean;
  reason: string;
  expiresAt?: string | null;
}): Promise<OpsResult> {
  const parsed = z
    .object({
      organizationId: orgId,
      lockType: z.enum(lockTypes),
      enabled: z.boolean(),
      reason,
      expiresAt: z.string().datetime({ offset: true }).nullish(),
    })
    .safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const no = await denied("gyms.manage");
  if (no) return no;
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_operation_lock", {
    p_organization_id: parsed.data.organizationId,
    p_lock_type: parsed.data.lockType,
    p_enabled: parsed.data.enabled,
    p_reason: parsed.data.reason,
    p_expires_at: parsed.data.enabled ? (parsed.data.expiresAt ?? undefined) : undefined,
  });
  if (error) return { error: error.message };
  refresh(parsed.data.organizationId);
  return { error: null };
}

export async function setFeatureFlag(input: {
  organizationId: string;
  flagKey: string;
  enabled: boolean;
  reason: string;
}): Promise<OpsResult> {
  const parsed = z
    .object({ organizationId: orgId, flagKey: z.string().min(3).max(60), enabled: z.boolean(), reason })
    .safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const no = await denied("gyms.manage");
  if (no) return no;
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_feature_flag", {
    p_organization_id: parsed.data.organizationId,
    p_flag_key: parsed.data.flagKey,
    p_enabled: parsed.data.enabled,
    p_reason: parsed.data.reason,
  });
  if (error) return { error: error.message };
  refresh(parsed.data.organizationId);
  return { error: null };
}

export async function adjustWhatsAppCredits(input: { organizationId: string; delta: number; reason: string }): Promise<OpsResult> {
  const parsed = z
    .object({
      organizationId: orgId,
      delta: z
        .number()
        .int("Enter a whole number of credits.")
        .refine((n) => n !== 0, "Enter a non-zero amount.")
        .refine((n) => Math.abs(n) <= 10_000_000, "That is more than 10,000,000 credits."),
      reason,
    })
    .safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const no = await denied("whatsapp.manage");
  if (no) return no;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_adjust_whatsapp_credits", {
    p_organization_id: parsed.data.organizationId,
    p_delta: parsed.data.delta,
    p_reason: parsed.data.reason,
  });
  if (error) return { error: error.message };
  refresh(parsed.data.organizationId);
  const after = (data as { balance_after?: number } | null)?.balance_after;
  return {
    error: null,
    message: after === undefined ? "Credits updated." : `Balance is now ${after.toLocaleString("en-IN")} credits.`,
  };
}

export async function retryFailedWhatsApp(input: { organizationId: string; reason: string }): Promise<OpsResult> {
  const parsed = z.object({ organizationId: orgId, reason }).safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const no = await denied("whatsapp.manage");
  if (no) return no;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_retry_failed_whatsapp", {
    p_organization_id: parsed.data.organizationId,
    p_reason: parsed.data.reason,
  });
  if (error) return { error: error.message };
  refresh(parsed.data.organizationId);
  const result = data as { requeued?: number; not_retried?: number } | null;
  const requeued = result?.requeued ?? 0;
  const skipped = result?.not_retried ?? 0;
  return {
    error: null,
    message:
      requeued === 0
        ? "Nothing was safe to retry — no message was re-queued."
        : `${requeued} message${requeued === 1 ? "" : "s"} re-queued${
            skipped ? `; ${skipped} left alone because retrying them is unsafe or would duplicate a delivery` : ""
          }.`,
  };
}

export async function revokeSessions(input: {
  organizationId: string;
  scope: "owner" | "all";
  reason: string;
}): Promise<OpsResult> {
  const parsed = z.object({ organizationId: orgId, scope: z.enum(["owner", "all"]), reason }).safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const no = await denied("gyms.manage");
  if (no) return no;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_revoke_org_sessions", {
    p_organization_id: parsed.data.organizationId,
    p_scope: parsed.data.scope,
    p_reason: parsed.data.reason,
  });
  if (error) return { error: error.message };
  refresh(parsed.data.organizationId);
  const result = data as { users?: number; sessions_ended?: number } | null;
  return { error: null, message: `Signed out ${result?.sessions_ended ?? 0} session(s) across ${result?.users ?? 0} user(s).` };
}

export async function setAlertStatus(input: {
  organizationId: string;
  alertId: string;
  action: "acknowledge" | "resolve";
  note?: string;
}): Promise<OpsResult> {
  const parsed = z
    .object({
      organizationId: orgId,
      alertId: z.string().uuid(),
      action: z.enum(["acknowledge", "resolve"]),
      note: z.string().trim().max(500).optional(),
    })
    .safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const no = await denied("gyms.manage");
  if (no) return no;
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_alert_status", {
    p_alert_id: parsed.data.alertId,
    p_action: parsed.data.action,
    p_note: parsed.data.note || undefined,
  });
  if (error) return { error: error.message };
  refresh(parsed.data.organizationId);
  return { error: null };
}

export async function refreshAlerts(organizationId: string): Promise<OpsResult> {
  if (!orgId.safeParse(organizationId).success) return { error: "Invalid gym." };
  const no = await denied("gyms.manage");
  if (no) return no;
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_refresh_gym_alerts", { p_organization_id: organizationId });
  if (error) return { error: error.message };
  refresh(organizationId);
  return { error: null };
}

export async function updateNote(input: { organizationId: string; noteId: string; content: string }): Promise<OpsResult> {
  const parsed = z
    .object({
      organizationId: orgId,
      noteId: z.string().uuid(),
      content: z.string().trim().min(1, "Write a note first.").max(2000, "Keep the note under 2,000 characters."),
    })
    .safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const no = await denied("gyms.manage");
  if (no) return no;
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_update_gym_note", { p_note_id: parsed.data.noteId, p_content: parsed.data.content });
  if (error) return { error: error.message };
  refresh(parsed.data.organizationId);
  return { error: null };
}

export async function deleteNote(input: { organizationId: string; noteId: string }): Promise<OpsResult> {
  const parsed = z.object({ organizationId: orgId, noteId: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const no = await denied("gyms.manage");
  if (no) return no;
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_delete_gym_note", { p_note_id: parsed.data.noteId });
  if (error) return { error: error.message };
  refresh(parsed.data.organizationId);
  return { error: null };
}
