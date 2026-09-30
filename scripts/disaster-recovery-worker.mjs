#!/usr/bin/env node
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import {
  assertBackupId,
  assertBackupType,
  assertEnvironment,
  backupFilename,
  backupStorageKey,
  environmentMatches,
  scheduledBackupTypesFor,
  shouldDeleteForRetention,
  shouldSkipScheduledRun,
} from "./lib/disaster-recovery-policy.mjs";

const CONTROL_PLANE_TABLES = [
  "public.disaster_recovery_config",
  "public.database_backups",
  "public.database_restore_history",
  "public.system_alerts",
  "public.system_data_snapshots",
  "public.platform_admins",
  "public.admin_audit_log",
];
const CORE_TABLES = [
  "organizations",
  "gyms",
  "branches",
  "members",
  "member_subscriptions",
  "payments",
  "membership_plans",
  "staff_memberships",
];
const TERMINAL_RESTORE_STATUSES = new Set(["completed", "failed"]);

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const environment = assertEnvironment(required("DR_ENVIRONMENT"));
const databaseIdentifier = required("DATABASE_IDENTIFIER");
const dbUrl = new URL(required("SUPABASE_DB_URL"));
const bucket = required("BACKUP_R2_BUCKET");
const endpoint = process.env.BACKUP_R2_ENDPOINT?.trim() ||
  `https://${required("BACKUP_R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`;
const r2 = new S3Client({
  region: "auto",
  endpoint,
  forcePathStyle: true,
  credentials: {
    accessKeyId: required("BACKUP_R2_ACCESS_KEY_ID"),
    secretAccessKey: required("BACKUP_R2_SECRET_ACCESS_KEY"),
  },
});

const pgEnv = {
  ...process.env,
  PGHOST: dbUrl.hostname,
  PGPORT: dbUrl.port || "5432",
  PGUSER: decodeURIComponent(dbUrl.username),
  PGPASSWORD: decodeURIComponent(dbUrl.password),
  PGDATABASE: dbUrl.pathname.replace(/^\//, "") || "postgres",
  PGSSLMODE: dbUrl.searchParams.get("sslmode") || "require",
};

function sanitized(message) {
  let output = String(message || "Database command failed.");
  for (const secret of [process.env.SUPABASE_DB_URL, pgEnv.PGPASSWORD, process.env.BACKUP_R2_SECRET_ACCESS_KEY]) {
    if (secret) output = output.split(secret).join("[REDACTED]");
  }
  return output.slice(-1800);
}

function run(command, args, { stdin, capture = true } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env: pgEnv, stdio: ["pipe", capture ? "pipe" : "inherit", "pipe"] });
    let stdout = "";
    let stderr = "";
    if (capture) child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve(stdout) : reject(new Error(sanitized(stderr))));
    if (stdin) child.stdin.end(stdin); else child.stdin.end();
  });
}

function b64(value) {
  if (value === null || value === undefined) return "null";
  return `convert_from(decode('${Buffer.from(String(value), "utf8").toString("base64")}', 'base64'), 'utf8')`;
}

async function sql(statement) {
  return (await run("psql", ["--no-psqlrc", "--quiet", "--tuples-only", "--no-align", "--set", "ON_ERROR_STOP=1"], {
    stdin: statement,
  })).trim();
}

async function sqlJson(statement) {
  const result = await sql(`select coalesce(json_agg(q), '[]'::json)::text from (${statement}) q;`);
  return JSON.parse(result || "[]");
}

async function verifyConfiguredEnvironment() {
  const rows = await sqlJson(`select environment, database_identifier from public.disaster_recovery_config where singleton`);
  const config = rows[0];
  if (!config || config.environment !== environment || config.database_identifier !== databaseIdentifier) {
    throw new Error("Environment/database identifier mismatch. Refusing to touch this database.");
  }
}

async function sha256(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

async function uploadFile(path, storageKey, metadata, size) {
  const params = { Bucket: bucket, Key: storageKey, ContentType: "application/octet-stream", Metadata: metadata };
  if (size < 100 * 1024 * 1024) {
    await r2.send(new PutObjectCommand({ ...params, Body: createReadStream(path) }));
    return;
  }
  const created = await r2.send(new CreateMultipartUploadCommand(params));
  if (!created.UploadId) throw new Error("R2 did not return a multipart upload id.");
  const parts = [];
  try {
    let partNumber = 1;
    for await (const chunk of createReadStream(path, { highWaterMark: 16 * 1024 * 1024 })) {
      const uploaded = await r2.send(new UploadPartCommand({
        Bucket: bucket,
        Key: storageKey,
        UploadId: created.UploadId,
        PartNumber: partNumber,
        Body: chunk,
      }));
      if (!uploaded.ETag) throw new Error(`R2 multipart upload did not return an ETag for part ${partNumber}.`);
      parts.push({ ETag: uploaded.ETag, PartNumber: partNumber });
      partNumber += 1;
    }
    await r2.send(new CompleteMultipartUploadCommand({
      Bucket: bucket,
      Key: storageKey,
      UploadId: created.UploadId,
      MultipartUpload: { Parts: parts },
    }));
  } catch (error) {
    await r2.send(new AbortMultipartUploadCommand({ Bucket: bucket, Key: storageKey, UploadId: created.UploadId })).catch(() => undefined);
    throw error;
  }
}

async function downloadToFile(storageKey, outputPath) {
  if (!storageKey.startsWith(`${environment}/`) || storageKey.includes("..")) {
    throw new Error("Unsafe or cross-environment R2 object key.");
  }
  const response = await r2.send(new GetObjectCommand({ Bucket: bucket, Key: storageKey }));
  if (!response.Body) throw new Error("Backup object has no body.");
  await pipeline(response.Body, createWriteStream(outputPath, { flags: "wx" }));
}

async function setBackupFailure(id, error, alertType = "backup_failure") {
  const message = sanitized(error instanceof Error ? error.message : error);
  await sql(`
    update public.database_backups
    set status = 'failed', verification_status = 'failed', completed_at = now(), error_message = ${b64(message)}
    where id = '${assertBackupId(id)}';
    insert into public.system_alerts (severity, type, environment, message, metadata)
    values ('critical', '${alertType}', '${environment}', ${b64(message)}, jsonb_build_object('backup_id', '${id}'));
  `);
}

async function createMetadata(type, triggerType, requestedId) {
  assertBackupType(type);
  if (requestedId) {
    const id = assertBackupId(requestedId);
    const rows = await sqlJson(`select id, environment, backup_type, status, database_identifier from public.database_backups where id = '${id}'`);
    const row = rows[0];
    if (!row || row.status !== "queued" || !environmentMatches(row.environment, environment) || row.database_identifier !== databaseIdentifier) {
      throw new Error("Queued backup request does not match this database/environment.");
    }
    await sql(`update public.database_backups set status = 'creating', error_message = null where id = '${id}';`);
    return id;
  }
  return sql(`
    insert into public.database_backups (environment, backup_type, database_identifier, trigger_type, status)
    values ('${environment}', '${type}', ${b64(databaseIdentifier)}, '${triggerType}', 'creating') returning id;
  `);
}

async function dumpDatabase(outputPath) {
  const args = [
    "--format=custom",
    "--no-owner",
    "--no-acl",
    "--schema=public",
    "--schema=app",
    "--file", outputPath,
  ];
  for (const table of CONTROL_PLANE_TABLES) args.push(`--exclude-table=${table}`);
  await run("pg_dump", args);
  // pg_restore --list validates that the custom archive directory can be read.
  await run("pg_restore", ["--list", outputPath]);
}

async function uploadBackup({ id, type, triggerType, dumpPath, now, startedAt }) {
  const filename = backupFilename(environment, type, now);
  const storageKey = backupStorageKey(environment, type, now, filename);
  const [checksum, info] = await Promise.all([sha256(dumpPath), stat(dumpPath)]);
  await uploadFile(dumpPath, storageKey, {
      environment,
      "backup-type": type,
      "checksum-sha256": checksum,
      "database-identifier": databaseIdentifier,
  }, info.size);
  const head = await r2.send(new HeadObjectCommand({ Bucket: bucket, Key: storageKey }));
  if (Number(head.ContentLength) !== info.size) throw new Error("R2 object size did not match the local dump.");
  if (head.Metadata?.["checksum-sha256"] !== checksum) throw new Error("R2 checksum metadata did not match the local dump.");
  const duration = Date.now() - startedAt;
  await sql(`
    update public.database_backups set
      storage_key = ${b64(storageKey)}, filename = ${b64(filename)}, file_size_bytes = ${info.size},
      checksum_sha256 = '${checksum}', completed_at = now(), duration_ms = ${duration}, status = 'ready',
      error_message = null, verified_at = now(), verification_status = 'verified',
      metadata = jsonb_build_object('pg_format', 'custom', 'schemas', jsonb_build_array('public', 'app'), 'worker', 'github-actions')
    where id = '${assertBackupId(id)}';
    insert into public.admin_audit_log (action, environment, actor_role, entity_type, entity_id, metadata)
    values ('database.backup_created', '${environment}', 'system', 'database_backup', '${id}',
      jsonb_build_object('type', '${type}', 'trigger_type', '${triggerType}', 'size_bytes', ${info.size}, 'checksum_sha256', '${checksum}'));
  `);
  return id;
}

async function createBackup(type, triggerType, requestedId, sharedDumpPath) {
  const startedAt = Date.now();
  const id = await createMetadata(type, triggerType, requestedId);
  const ownsDump = !sharedDumpPath;
  const workDir = ownsDump ? await mkdtemp(join(tmpdir(), "myfitdesk-backup-")) : null;
  const dumpPath = sharedDumpPath || join(workDir, "database.dump");
  try {
    if (ownsDump) await dumpDatabase(dumpPath);
    return await uploadBackup({ id, type, triggerType, dumpPath, now: new Date(), startedAt });
  } catch (error) {
    await setBackupFailure(id, error);
    throw error;
  } finally {
    if (workDir) await rm(workDir, { recursive: true, force: true });
  }
}

async function createScheduledBackups() {
  const now = new Date();
  const [state] = await sqlJson(`
    select
      max(created_at) filter (where backup_type = 'hourly') as last_hourly_at,
      coalesce(bool_or(backup_type = 'daily' and (created_at at time zone 'UTC')::date = (now() at time zone 'UTC')::date), false) as daily_today,
      coalesce(bool_or(backup_type = 'monthly' and (created_at at time zone 'UTC')::date = (now() at time zone 'UTC')::date), false) as monthly_today
    from public.database_backups
    where environment = '${environment}' and database_identifier = ${b64(databaseIdentifier)}
      and trigger_type = 'scheduled' and status in ('creating', 'ready')
  `);
  const types = scheduledBackupTypesFor(now, { dailyToday: state?.daily_today, monthlyToday: state?.monthly_today });
  if (shouldSkipScheduledRun(types, state?.last_hourly_at, now)) {
    console.log("A scheduled hourly backup already exists within the last 50 minutes; skipping this trigger.");
    return [];
  }
  const workDir = await mkdtemp(join(tmpdir(), "myfitdesk-scheduled-"));
  const dumpPath = join(workDir, "database.dump");
  const ids = [];
  try {
    for (const type of types) {
      const id = await createMetadata(type, "scheduled");
      ids.push({ id, type });
    }
    try {
      await dumpDatabase(dumpPath);
    } catch (error) {
      for (const { id } of ids) await setBackupFailure(id, error);
      throw error;
    }
    const completed = [];
    for (const { id, type } of ids) {
      try {
        completed.push(await uploadBackup({ id, type, triggerType: "scheduled", dumpPath, now: new Date(), startedAt: Date.now() }));
      } catch (error) {
        await setBackupFailure(id, error);
        throw error;
      }
    }
    return completed;
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

async function processQueuedBackups() {
  const queued = await sqlJson(`
    select id from public.database_backups
    where environment = '${environment}' and database_identifier = ${b64(databaseIdentifier)}
      and status = 'queued' and backup_type = 'manual'
    order by created_at asc limit 3
  `);
  for (const row of queued) await createBackup("manual", "manual", row.id);
}

async function runRetention() {
  const rows = await sqlJson(`
    select id, storage_key, backup_type, protected, status, created_at
    from public.database_backups where environment = '${environment}'
      and status in ('ready', 'delete_requested')
  `);
  const now = new Date();
  for (const row of rows) {
    const explicit = row.status === "delete_requested";
    if (!explicit && !shouldDeleteForRetention(row, now)) continue;
    if (row.protected) continue;
    if (row.storage_key) {
      if (!row.storage_key.startsWith(`${environment}/`) || row.storage_key.includes("..")) throw new Error("Unsafe retention key.");
      await r2.send(new DeleteObjectCommand({ Bucket: bucket, Key: row.storage_key }));
    }
    await sql(`
      update public.database_backups set status = 'deleted', deleted_at = now() where id = '${assertBackupId(row.id)}';
      insert into public.admin_audit_log (action, environment, actor_role, entity_type, entity_id, metadata)
      values ('database.backup_deleted', '${environment}', 'system', 'database_backup', '${row.id}', jsonb_build_object('retention', ${explicit ? "false" : "true"}));
    `);
  }
}

async function recordSnapshot() {
  await sql(`select public.record_system_data_snapshot('${environment}', ${b64(databaseIdentifier)});`);
}

async function updateRestore(id, status, extra = "") {
  if (!TERMINAL_RESTORE_STATUSES.has(status) && !["preparing", "backing_up_current", "downloading", "verifying_checksum", "restoring", "verifying", "completing"].includes(status)) {
    throw new Error("Invalid restore status transition.");
  }
  await sql(`update public.database_restore_history set status = '${status}' ${extra} where id = '${assertBackupId(id)}';`);
}

async function restoreDatabase(restoreId) {
  const id = assertBackupId(restoreId);
  const rows = await sqlJson(`
    select r.id, r.status, r.environment, r.backup_id, b.storage_key, b.checksum_sha256,
      b.status as backup_status, b.verification_status, b.database_identifier
    from public.database_restore_history r join public.database_backups b on b.id = r.backup_id
    where r.id = '${id}'
  `);
  const request = rows[0];
  if (!request || request.status !== "queued" || request.environment !== environment ||
      request.database_identifier !== databaseIdentifier || !environmentMatches(request.environment, environment) ||
      !request.storage_key || !request.checksum_sha256 || request.verification_status !== "verified" || request.backup_status !== "restoring") {
    throw new Error("Restore request is not valid for this database/environment.");
  }

  const startedAt = Date.now();
  const workDir = await mkdtemp(join(tmpdir(), "myfitdesk-restore-"));
  let maintenanceEnabled = false;
  try {
    await updateRestore(id, "preparing");
    await updateRestore(id, "backing_up_current");
    // This must complete before maintenance/restore. Any failure aborts here.
    const preRestoreId = await createBackup("pre_restore", "restore_safety");
    await updateRestore(id, "downloading", `, pre_restore_backup_id = '${preRestoreId}'`);

    await sql(`
      update public.disaster_recovery_config set maintenance_mode = true,
        maintenance_reason = 'Database restore in progress', maintenance_enabled_at = now(), updated_at = now()
      where singleton and environment = '${environment}';
      update public.database_restore_history set maintenance_mode_enabled = true where id = '${id}';
    `);
    maintenanceEnabled = true;

    const dumpPath = join(workDir, "restore.dump");
    await downloadToFile(request.storage_key, dumpPath);
    await updateRestore(id, "verifying_checksum");
    const actualChecksum = await sha256(dumpPath);
    if (actualChecksum !== request.checksum_sha256) {
      await sql(`
        update public.database_backups set status = 'corrupted', verification_status = 'corrupted', error_message = 'Checksum mismatch before restore' where id = '${request.backup_id}';
        insert into public.system_alerts (severity, type, environment, message, metadata)
        values ('critical', 'backup_checksum_mismatch', '${environment}', 'Backup checksum mismatch. Restore was blocked.', jsonb_build_object('backup_id', '${request.backup_id}'));
      `);
      throw new Error("Backup checksum mismatch. Restore blocked.");
    }
    await run("pg_restore", ["--list", dumpPath]);
    await updateRestore(id, "restoring", ", checksum_verified = true");
    await run("pg_restore", [
      "--clean", "--if-exists", "--exit-on-error", "--single-transaction",
      "--no-owner", "--no-acl", "--schema=public", "--schema=app", dumpPath,
    ]);

    await updateRestore(id, "verifying");
    const counts = {};
    for (const table of CORE_TABLES) {
      const result = await sql(`select count(*) from public.${table};`);
      counts[table] = Number(result);
    }
    const unvalidatedFks = Number(await sql(`
      select count(*) from pg_constraint c join pg_namespace n on n.oid = c.connamespace
      where c.contype = 'f' and not c.convalidated and n.nspname in ('public', 'app');
    `));
    if (unvalidatedFks > 0) throw new Error(`${unvalidatedFks} foreign-key constraints are not validated.`);
    await updateRestore(id, "completing", `, records_verified = ${b64(JSON.stringify({ counts, unvalidatedForeignKeys: 0 }))}::jsonb`);
    await sql(`
      update public.disaster_recovery_config set maintenance_mode = false, maintenance_reason = null,
        maintenance_enabled_at = null, maintenance_enabled_by = null, updated_at = now()
      where singleton and environment = '${environment}';
      update public.database_backups set status = 'ready' where id = '${request.backup_id}';
      update public.database_restore_history set status = 'completed', completed_at = now(),
        duration_ms = ${Date.now() - startedAt}, maintenance_mode_enabled = false where id = '${id}';
      insert into public.admin_audit_log (action, environment, actor_role, entity_type, entity_id, metadata)
      values ('database.restore_completed', '${environment}', 'system', 'database_restore', '${id}', jsonb_build_object('backup_id', '${request.backup_id}'));
    `);
  } catch (error) {
    const message = sanitized(error instanceof Error ? error.message : error);
    await sql(`
      update public.database_restore_history set status = 'failed', completed_at = now(), duration_ms = ${Date.now() - startedAt},
        error_message = ${b64(message)}, maintenance_mode_enabled = ${maintenanceEnabled ? "true" : "false"} where id = '${id}';
      update public.database_backups set status = case when status = 'corrupted' then status else 'ready' end where id = '${request.backup_id}';
      insert into public.system_alerts (severity, type, environment, message, metadata)
      values ('critical', 'restore_failure', '${environment}', ${b64(message)}, jsonb_build_object('restore_id', '${id}', 'backup_id', '${request.backup_id}'));
      insert into public.admin_audit_log (action, environment, actor_role, entity_type, entity_id, metadata)
      values ('database.restore_failed', '${environment}', 'system', 'database_restore', '${id}', jsonb_build_object('backup_id', '${request.backup_id}', 'maintenance_mode', ${maintenanceEnabled ? "true" : "false"}));
    `);
    throw error;
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

async function main() {
  await verifyConfiguredEnvironment();
  const command = process.argv[2] || "backup";
  if (command === "backup") {
    const requestedId = process.env.BACKUP_REQUEST_ID?.trim();
    const type = process.env.BACKUP_TYPE?.trim() || "scheduled";
    if (requestedId) await createBackup("manual", "manual", requestedId);
    else if (type === "pre_migration") await createBackup("pre_migration", "migration");
    else if (type === "manual") await createBackup("manual", "manual");
    else await createScheduledBackups();
    await processQueuedBackups();
    await runRetention();
    await recordSnapshot();
    return;
  }
  if (command === "restore") {
    await restoreDatabase(required("RESTORE_REQUEST_ID"));
    return;
  }
  if (command === "retention") {
    await runRetention();
    return;
  }
  if (command === "monitor") {
    await recordSnapshot();
    return;
  }
  throw new Error(`Unknown worker command: ${command}`);
}

main().catch((error) => {
  console.error(sanitized(error instanceof Error ? error.message : error));
  process.exitCode = 1;
});
