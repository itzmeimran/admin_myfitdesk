import test from "node:test";
import assert from "node:assert/strict";
import {
  backupFilename,
  backupStorageKey,
  canRestoreBackup,
  checksumsMatch,
  environmentMatches,
  scheduledBackupTypes,
  shouldDeleteForRetention,
  safetyBackupAllowsRestore,
} from "./lib/disaster-recovery-policy.mjs";

const NOW = new Date("2026-09-27T10:00:00.000Z");

test("scheduled tiers are hourly except midnight/day one promotions", () => {
  assert.deepEqual(scheduledBackupTypes(NOW), ["hourly"]);
  assert.deepEqual(scheduledBackupTypes(new Date("2026-09-27T00:00:00Z")), ["hourly", "daily"]);
  assert.deepEqual(scheduledBackupTypes(new Date("2026-09-01T00:00:00Z")), ["hourly", "daily", "monthly"]);
});

test("keys isolate environments and match the documented structure", () => {
  const name = backupFilename("production", "hourly", NOW);
  assert.equal(name, "prod-hourly-2026-09-27-10-00.dump");
  assert.equal(backupStorageKey("production", "hourly", NOW, name),
    "production/hourly/2026/09/27/prod-hourly-2026-09-27-10-00.dump");
});

test("retention removes expired tiers but never protected or manual backups", () => {
  const base = { status: "ready", protected: false };
  assert.equal(shouldDeleteForRetention({ ...base, backup_type: "hourly", created_at: "2026-09-25T09:59:59Z" }, NOW), true);
  assert.equal(shouldDeleteForRetention({ ...base, backup_type: "daily", created_at: "2026-08-27T09:59:59Z" }, NOW), true);
  assert.equal(shouldDeleteForRetention({ ...base, backup_type: "monthly", created_at: "2025-08-01T00:00:00Z" }, NOW), true);
  assert.equal(shouldDeleteForRetention({ ...base, backup_type: "pre_restore", created_at: "2026-09-01T00:00:00Z" }, NOW), false);
  assert.equal(shouldDeleteForRetention({ ...base, backup_type: "manual", created_at: "2020-01-01T00:00:00Z" }, NOW), false);
  assert.equal(shouldDeleteForRetention({ ...base, protected: true, backup_type: "hourly", created_at: "2020-01-01T00:00:00Z" }, NOW), false);
});

test("a development backup cannot target production", () => {
  assert.equal(environmentMatches("development", "development"), true);
  assert.equal(environmentMatches("development", "production"), false);
});

test("restore requires a ready verified same-environment object", () => {
  const backup = { environment: "development", status: "ready", verification_status: "verified", storage_key: "development/hourly/a.dump", checksum_sha256: "a".repeat(64) };
  assert.equal(canRestoreBackup(backup, "development"), true);
  assert.equal(canRestoreBackup(backup, "production"), false);
  assert.equal(canRestoreBackup({ ...backup, verification_status: "corrupted" }, "development"), false);
});

test("checksum comparison rejects malformed and changed digests", () => {
  assert.equal(checksumsMatch("a".repeat(64), "a".repeat(64)), true);
  assert.equal(checksumsMatch("a".repeat(64), "b".repeat(64)), false);
  assert.equal(checksumsMatch("not-a-checksum", "not-a-checksum"), false);
});

test("failed or incomplete safety backup blocks restore", () => {
  assert.equal(safetyBackupAllowsRestore({ id: "x", status: "ready", verification_status: "verified" }), true);
  assert.equal(safetyBackupAllowsRestore({ id: "x", status: "failed", verification_status: "failed" }), false);
  assert.equal(safetyBackupAllowsRestore(null), false);
});
