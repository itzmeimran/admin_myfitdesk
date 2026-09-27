import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/core/db/server-client";
import { getActiveAdminEnvironment } from "@/core/env/active-environment";
import type {
  AlertRow,
  AuditRow,
  BackupRow,
  DeletedRecord,
  DisasterRecoveryData,
  RestoreRow,
} from "./types";

function fullEnvironment(value: "dev" | "prod"): "development" | "production" {
  return value === "prod" ? "production" : "development";
}

export async function getDisasterRecoveryData(): Promise<DisasterRecoveryData> {
  const environment = fullEnvironment(await getActiveAdminEnvironment());
  // database.types.ts is generated from the currently deployed schema. Keep
  // this additive feature buildable before migration 1017 is applied; after
  // deployment the same calls remain fully runtime/RLS checked.
  const supabase = (await createClient()) as unknown as SupabaseClient;
  const [backupsResult, restoresResult, auditsResult, alertsResult, deletedResult, configResult] = await Promise.all([
    supabase.from("database_backups").select("*").eq("environment", environment).order("created_at", { ascending: false }).limit(500),
    supabase.from("database_restore_history").select("*").eq("environment", environment).order("started_at", { ascending: false }).limit(200),
    supabase.from("admin_audit_log").select("id,action,environment,actor_role,entity_type,entity_id,metadata,created_at")
      .in("action", [
        "database.backup_requested", "database.backup_created", "database.backup_deletion_requested",
        "database.backup_deleted", "database.backup_protected", "database.backup_unprotected",
        "database.restore_requested", "database.restore_completed", "database.restore_failed",
        "system.maintenance_enabled", "system.maintenance_disabled", "system.alert_resolved", "record.restored",
      ]).order("created_at", { ascending: false }).limit(300),
    supabase.from("system_alerts").select("*").eq("environment", environment).order("created_at", { ascending: false }).limit(200),
    supabase.rpc("admin_deleted_records"),
    supabase.from("disaster_recovery_config").select("*").eq("environment", environment).maybeSingle(),
  ]);

  const firstError = [backupsResult.error, restoresResult.error, auditsResult.error, alertsResult.error, deletedResult.error]
    .find(Boolean);
  if (firstError) throw new Error(`Failed to load disaster recovery data: ${firstError.message}`);

  const backups = (backupsResult.data ?? []) as BackupRow[];
  const restores = (restoresResult.data ?? []) as RestoreRow[];
  const alerts = (alertsResult.data ?? []) as AlertRow[];
  const ready = backups.filter((backup) => backup.status === "ready");
  const sizes = ready.map((backup) => backup.file_size_bytes ?? 0);
  const totalStorageBytes = sizes.reduce((sum, value) => sum + value, 0);
  const storageByType: Record<string, number> = {};
  for (const backup of ready) storageByType[backup.backup_type] = (storageByType[backup.backup_type] ?? 0) + (backup.file_size_bytes ?? 0);
  const last = ready[0] ?? null;
  const lastAt = last?.completed_at ?? last?.created_at ?? null;
  const lastHourly = ready.find((backup) => backup.backup_type === "hourly" && backup.trigger_type === "scheduled");
  const lastHourlyAt = lastHourly?.completed_at ?? lastHourly?.created_at ?? null;
  const recent = ready.filter((backup) => Date.now() - new Date(backup.created_at).valueOf() <= 7 * 86400000);
  const estimatedThirtyDayBytes = recent.length
    ? Math.round((recent.reduce((sum, backup) => sum + (backup.file_size_bytes ?? 0), 0) / 7) * 30)
    : 0;
  const config = configResult.data as null | {
    database_identifier: string;
    maintenance_mode: boolean;
    maintenance_reason: string | null;
  };

  return {
    environment,
    backups,
    restores,
    audits: (auditsResult.data ?? []) as AuditRow[],
    alerts,
    deletedRecords: (deletedResult.data ?? []) as DeletedRecord[],
    health: {
      configured: Boolean(config),
      databaseIdentifier: config?.database_identifier ?? null,
      maintenanceMode: config?.maintenance_mode ?? false,
      maintenanceReason: config?.maintenance_reason ?? null,
      lastSuccessfulBackup: lastAt,
      nextExpectedBackup: lastHourlyAt ? new Date(new Date(lastHourlyAt).valueOf() + 3600000).toISOString() : null,
      backupFailures: backups.filter((backup) => backup.status === "failed").length,
      oldestRetainedBackup: ready.at(-1)?.created_at ?? null,
      newestBackup: ready[0]?.created_at ?? null,
      totalStorageBytes,
      backupCount: ready.length,
      lastRestore: restores.find((restore) => restore.status === "completed")?.completed_at ?? null,
      openCriticalAlerts: alerts.filter((alert) => alert.severity === "critical" && !alert.resolved_at).length,
      verifiedBackups: ready.filter((backup) => backup.verification_status === "verified").length,
      storageByType,
      estimatedThirtyDayBytes,
    },
  };
}
