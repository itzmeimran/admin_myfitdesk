export type BackupStatus = "queued" | "creating" | "ready" | "failed" | "restoring" | "delete_requested" | "deleted" | "corrupted";
export type BackupType = "hourly" | "daily" | "monthly" | "manual" | "pre_restore" | "pre_migration";

export type BackupRow = {
  id: string;
  environment: "development" | "production";
  backup_type: BackupType;
  storage_key: string | null;
  filename: string | null;
  file_size_bytes: number | null;
  checksum_sha256: string | null;
  created_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  status: BackupStatus;
  error_message: string | null;
  trigger_type: string;
  triggered_by: string | null;
  verified_at: string | null;
  verification_status: "pending" | "verified" | "failed" | "corrupted";
  protected: boolean;
};

export type RestoreRow = {
  id: string;
  environment: "development" | "production";
  backup_id: string;
  started_at: string;
  completed_at: string | null;
  status: string;
  requested_by: string;
  pre_restore_backup_id: string | null;
  duration_ms: number | null;
  error_message: string | null;
  records_verified: Record<string, unknown> | null;
  maintenance_mode_enabled: boolean;
  checksum_verified: boolean;
};

export type AuditRow = {
  id: number;
  action: string;
  environment: string | null;
  actor_role: string | null;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export type AlertRow = {
  id: string;
  severity: "info" | "warning" | "critical";
  type: string;
  environment: "development" | "production";
  message: string;
  metadata: Record<string, unknown>;
  created_at: string;
  resolved_at: string | null;
};

export type DeletedRecord = {
  entity_type: string;
  entity_id: string;
  organization_id: string;
  display_name: string;
  deleted_at: string;
  metadata: Record<string, unknown>;
};

/** How the *scheduled hourly* cadence is actually doing, derived from real
 * backup rows (never from what the cron is supposed to do). */
export type ScheduleHealth = {
  status: "on_track" | "delayed" | "overdue" | "none";
  lastScheduledAt: string | null;
  minutesSinceLast: number | null;
  /** Scheduled hourly backups that completed in the last 24 h (24 expected). */
  runsLast24h: number;
  /** Longest stretch with no scheduled backup in the last 24 h, in minutes. */
  longestGapMinutes: number;
};

export type RecoveryHealth = {
  schedule: ScheduleHealth;
  configured: boolean;
  databaseIdentifier: string | null;
  maintenanceMode: boolean;
  maintenanceReason: string | null;
  lastSuccessfulBackup: string | null;
  nextExpectedBackup: string | null;
  backupFailures: number;
  oldestRetainedBackup: string | null;
  newestBackup: string | null;
  totalStorageBytes: number;
  backupCount: number;
  lastRestore: string | null;
  openCriticalAlerts: number;
  verifiedBackups: number;
  storageByType: Record<string, number>;
  estimatedThirtyDayBytes: number;
};

export type DisasterRecoveryData = {
  environment: "development" | "production";
  backups: BackupRow[];
  restores: RestoreRow[];
  audits: AuditRow[];
  alerts: AlertRow[];
  deletedRecords: DeletedRecord[];
  health: RecoveryHealth;
};
