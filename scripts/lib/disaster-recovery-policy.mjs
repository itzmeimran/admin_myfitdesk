const SAFE_BACKUP_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ENVIRONMENTS = new Set(["development", "production"]);
const TYPES = new Set(["hourly", "daily", "monthly", "manual", "pre_restore", "pre_migration"]);

export function assertEnvironment(value) {
  if (!ENVIRONMENTS.has(value)) throw new Error("DR_ENVIRONMENT must be development or production.");
  return value;
}

export function assertBackupType(value) {
  if (!TYPES.has(value)) throw new Error(`Unsupported backup type: ${value}`);
  return value;
}

export function assertBackupId(value) {
  if (!SAFE_BACKUP_ID.test(value ?? "")) throw new Error("Backup/request id must be a UUID.");
  return value;
}

export function scheduledBackupTypes(now) {
  const types = ["hourly"];
  if (now.getUTCHours() === 0) types.push("daily");
  if (now.getUTCHours() === 0 && now.getUTCDate() === 1) types.push("monthly");
  return types;
}

export function backupFilename(environment, type, now) {
  assertEnvironment(environment);
  assertBackupType(type);
  const prefix = environment === "production" ? "prod" : "dev";
  const stamp = now.toISOString().slice(0, 16).replace("T", "-").replace(":", "-");
  if (type === "pre_restore") return `pre-restore-${prefix}-${stamp}.dump`;
  if (type === "pre_migration") return `pre-migration-${prefix}-${stamp}.dump`;
  return `${prefix}-${type.replace("_", "-")}-${stamp}.dump`;
}

export function backupStorageKey(environment, type, now, filename) {
  assertEnvironment(environment);
  assertBackupType(type);
  if (!/^[A-Za-z0-9_.-]+\.dump$/.test(filename)) throw new Error("Unsafe backup filename.");
  const y = String(now.getUTCFullYear());
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  if (type === "hourly") return `${environment}/hourly/${y}/${m}/${d}/${filename}`;
  if (type === "daily") return `${environment}/daily/${filename}`;
  if (type === "monthly") return `${environment}/monthly/${filename}`;
  return `${environment}/${type}/${y}/${m}/${filename}`;
}

export function shouldDeleteForRetention(backup, now) {
  if (backup.protected || backup.status !== "ready") return false;
  const created = new Date(backup.created_at);
  if (Number.isNaN(created.valueOf())) return false;
  const ageMs = now.valueOf() - created.valueOf();
  if (backup.backup_type === "hourly") return ageMs > 48 * 60 * 60 * 1000;
  if (backup.backup_type === "daily") return ageMs > 30 * 24 * 60 * 60 * 1000;
  if (backup.backup_type === "pre_restore" || backup.backup_type === "pre_migration") {
    return ageMs > 30 * 24 * 60 * 60 * 1000;
  }
  if (backup.backup_type === "monthly") {
    const cutoff = new Date(now);
    cutoff.setUTCMonth(cutoff.getUTCMonth() - 12);
    return created < cutoff;
  }
  // Manual backups are intentionally indefinite unless an admin explicitly
  // requests deletion. `protected` adds a second, structural guard.
  return false;
}

export function environmentMatches(backupEnvironment, targetEnvironment) {
  return assertEnvironment(backupEnvironment) === assertEnvironment(targetEnvironment);
}

export function checksumsMatch(expected, actual) {
  return typeof expected === "string" && /^[0-9a-f]{64}$/.test(expected) && expected === actual;
}

export function canRestoreBackup(backup, targetEnvironment) {
  return Boolean(
    backup && environmentMatches(backup.environment, targetEnvironment) &&
    backup.status === "ready" && backup.verification_status === "verified" &&
    typeof backup.storage_key === "string" && backup.storage_key.startsWith(`${targetEnvironment}/`) &&
    /^[0-9a-f]{64}$/.test(backup.checksum_sha256 ?? ""),
  );
}

export function safetyBackupAllowsRestore(result) {
  return Boolean(result?.id && result.status === "ready" && result.verification_status === "verified");
}
