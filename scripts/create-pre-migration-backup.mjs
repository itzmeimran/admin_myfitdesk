import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

/** Run immediately before a dangerous schema migration. It exits non-zero if
 * a verified pre-migration backup was not created, so deployment scripts can
 * safely stop before executing the migration. */
export function createPreMigrationBackup() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["scripts/disaster-recovery-worker.mjs", "backup"], {
      stdio: "inherit",
      env: { ...process.env, BACKUP_TYPE: "pre_migration", BACKUP_REQUEST_ID: "" },
    });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`Pre-migration backup failed (${code}). Migration must not continue.`)));
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  createPreMigrationBackup().catch((error) => {
    console.error(error instanceof Error ? error.message : "Pre-migration backup failed.");
    process.exitCode = 1;
  });
}
