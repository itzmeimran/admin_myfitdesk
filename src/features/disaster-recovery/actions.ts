"use server";

import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createClient } from "@/core/db/server-client";
import { getActiveAdminEnvironment } from "@/core/env/active-environment";
import { dispatchRecoveryWorkflow } from "@/core/disaster-recovery/github-dispatch";

export type RecoveryActionResult = { error: string | null; message?: string };

function fullEnvironment(value: "dev" | "prod"): "development" | "production" {
  return value === "prod" ? "production" : "development";
}

async function context() {
  const environment = fullEnvironment(await getActiveAdminEnvironment());
  const requestHeaders = await headers();
  const rawIp = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const ipAddress = rawIp && (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(rawIp) || /^[0-9a-f:]+$/i.test(rawIp)) ? rawIp : null;
  const requestId = requestHeaders.get("x-request-id")?.slice(0, 200) || randomUUID();
  const supabase = (await createClient()) as unknown as SupabaseClient;
  return { environment, ipAddress, requestId, supabase };
}

function refresh() {
  revalidatePath("/admin/system/disaster-recovery");
  revalidatePath("/admin");
}

export async function createManualBackup(): Promise<RecoveryActionResult> {
  const { environment, ipAddress, requestId, supabase } = await context();
  const { data, error } = await supabase.rpc("admin_queue_database_backup", {
    p_environment: environment,
    p_ip_address: ipAddress,
    p_request_id: requestId,
  });
  if (error) return { error: error.message };
  const backupId = String(data);
  const dispatch = await dispatchRecoveryWorkflow("database-backup.yml", {
    environment,
    backup_type: "manual",
    request_id: backupId,
  });
  refresh();
  return dispatch.dispatched
    ? { error: null, message: "Backup queued and worker started." }
    : { error: null, message: `Backup queued. ${dispatch.reason}` };
}

export async function requestRestore(backupId: string, confirmation: string): Promise<RecoveryActionResult> {
  const parsed = z.string().uuid().safeParse(backupId);
  if (!parsed.success) return { error: "Invalid backup id." };
  const { environment, ipAddress, requestId, supabase } = await context();
  const { data, error } = await supabase.rpc("admin_queue_database_restore", {
    p_backup_id: parsed.data,
    p_environment: environment,
    p_confirmation: confirmation,
    p_ip_address: ipAddress,
    p_request_id: requestId,
  });
  if (error) return { error: error.message };
  const restoreId = String(data);
  const dispatch = await dispatchRecoveryWorkflow("database-restore.yml", {
    environment,
    restore_request_id: restoreId,
  });
  refresh();
  return dispatch.dispatched
    ? { error: null, message: "Restore queued. The protected worker has been requested." }
    : { error: null, message: `Restore queued. ${dispatch.reason}` };
}

export async function setBackupProtected(backupId: string, value: boolean): Promise<RecoveryActionResult> {
  const parsed = z.string().uuid().safeParse(backupId);
  if (!parsed.success) return { error: "Invalid backup id." };
  const { supabase } = await context();
  const { error } = await supabase.rpc("admin_set_backup_protected", { p_backup_id: parsed.data, p_protected: value });
  if (error) return { error: error.message };
  refresh();
  return { error: null, message: value ? "Backup protected." : "Backup protection removed." };
}

export async function requestBackupDeletion(backupId: string, confirmation: string): Promise<RecoveryActionResult> {
  const parsed = z.string().uuid().safeParse(backupId);
  if (!parsed.success) return { error: "Invalid backup id." };
  const { supabase } = await context();
  const { error } = await supabase.rpc("admin_request_backup_deletion", {
    p_backup_id: parsed.data,
    p_confirmation: confirmation,
  });
  if (error) return { error: error.message };
  refresh();
  return { error: null, message: "Deletion queued. The worker will remove the private object and close the metadata record." };
}

export async function setMaintenanceMode(enabled: boolean, reason: string, confirmation: string): Promise<RecoveryActionResult> {
  const parsed = z.string().trim().max(500).safeParse(reason);
  if (!parsed.success) return { error: "Maintenance reason is too long." };
  const { environment, supabase } = await context();
  const { error } = await supabase.rpc("admin_set_maintenance_mode", {
    p_environment: environment,
    p_enabled: enabled,
    p_reason: parsed.data,
    p_confirmation: confirmation,
  });
  if (error) return { error: error.message };
  refresh();
  return { error: null, message: enabled ? "Maintenance mode enabled." : "Maintenance mode disabled." };
}

export async function restoreDeletedRecord(entityType: string, entityId: string): Promise<RecoveryActionResult> {
  const type = z.enum(["member", "member_subscription", "inventory_product", "organization", "staff_membership"]).safeParse(entityType);
  const id = z.string().uuid().safeParse(entityId);
  if (!type.success || !id.success) return { error: "Invalid deleted record." };
  const { supabase } = await context();
  const { error } = await supabase.rpc("admin_restore_deleted_record", { p_entity_type: type.data, p_entity_id: id.data });
  if (error) return { error: error.message };
  refresh();
  return { error: null, message: "Record restored." };
}

export async function resolveAlert(alertId: string): Promise<RecoveryActionResult> {
  const parsed = z.string().uuid().safeParse(alertId);
  if (!parsed.success) return { error: "Invalid alert id." };
  const { supabase } = await context();
  const { error } = await supabase.rpc("admin_resolve_system_alert", { p_alert_id: parsed.data });
  if (error) return { error: error.message };
  refresh();
  return { error: null, message: "Alert resolved." };
}
