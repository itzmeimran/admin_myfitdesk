import "server-only";
import { randomUUID } from "node:crypto";
import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminEnvironment } from "@/core/config/environments";

type BucketConfig = { accountId: string; bucket: string; accessKeyId: string; secretAccessKey: string };
type Job = { id: string; organization_id: string; user_ids: string[] };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function assertGymObjectKey(organizationId: string, key: string) {
  if (!UUID.test(organizationId) || !key.startsWith(`${organizationId}/`) || key.includes("\\") || key.split("/").some(part => part === ".." || part === "." || part === "")) {
    throw new Error("Storage object is outside the gym folder");
  }
}

/** Explicit, environment-specific inventory includes retired/mirrored R2
 * buckets. Never substitute current rollout config or the backup bucket. */
export function deletionStorageConfig(environment: AdminEnvironment): BucketConfig[] {
  const suffix = environment.toUpperCase();
  if (process.env[`GYM_DELETION_STORAGE_CONFIRMED_${suffix}`] !== "true") throw new Error("Deletion storage inventory has not been verified");
  const raw = process.env[`GYM_DELETION_R2_BUCKETS_${suffix}`];
  if (!raw) throw new Error("Missing deletion storage inventory (use [] for Supabase-only storage)");
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error("Invalid deletion storage inventory");
  for (const entry of parsed) {
    if (!entry || typeof entry !== "object" || ["accountId", "bucket", "accessKeyId", "secretAccessKey"].some(k => typeof entry[k] !== "string" || !entry[k].trim()) || !/^[a-f0-9]{32}$/i.test(entry.accountId)) throw new Error("Incomplete deletion bucket configuration");
  }
  return parsed as BucketConfig[];
}

async function rpc<T>(client: SupabaseClient, name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await client.rpc(name, args);
  if (error) throw new Error(`Deletion step ${name} failed`); // no payloads/secrets in logs
  return data as T;
}

async function purgeSupabaseFolder(client: SupabaseClient, bucket: string, org: string, folder = org) {
  // Always page from offset 0 after removal; offsets would skip shifted files.
  while (true) {
    const { data, error } = await client.storage.from(bucket).list(folder, { limit: 100, offset: 0 });
    if (error) throw new Error("Supabase file listing failed");
    if (!data?.length) return;
    const files: string[] = [];
    for (const item of data) {
      const key = `${folder}/${item.name}`;
      assertGymObjectKey(org, key);
      if (item.id) files.push(key);
      else await purgeSupabaseFolder(client, bucket, org, key);
    }
    if (files.length) {
      const result = await client.storage.from(bucket).remove(files);
      if (result.error) throw new Error("Supabase file deletion failed");
    } else {
      // Virtual folder entries disappear after children are removed.
      const verify = await client.storage.from(bucket).list(folder, { limit: 100, offset: 0 });
      if (verify.error || verify.data?.length) throw new Error("Supabase folder cleanup is incomplete");
      return;
    }
  }
}

async function purgeR2Folder(config: BucketConfig, org: string) {
  const client = new S3Client({ region: "auto", endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`, credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey } });
  const prefix = `${org}/`;
  // Restart listing after each delete; safe across pagination and retries.
  while (true) {
    const page = await client.send(new ListObjectsV2Command({ Bucket: config.bucket, Prefix: prefix, MaxKeys: 1000 }));
    const keys = (page.Contents ?? []).map(object => object.Key).filter((key): key is string => Boolean(key));
    if (!keys.length) return;
    keys.forEach(key => assertGymObjectKey(org, key));
    const result = await client.send(new DeleteObjectsCommand({ Bucket: config.bucket, Delete: { Objects: keys.map(Key => ({ Key })), Quiet: true } }));
    if (result.Errors?.length) throw new Error("R2 file deletion failed");
  }
}

export async function runGymDeletionWorker(client: SupabaseClient, environment: AdminEnvironment, verifyR2Scope?: (organizationId: string, inventory: BucketConfig[]) => Promise<void>) {
  const inventory = deletionStorageConfig(environment);
  const token = randomUUID();
  const job = await rpc<Job | null>(client, "claim_gym_deletion", { p_token: token });
  if (!job) return { processed: 0, failed: 0 };
  if (!UUID.test(job.organization_id)) throw new Error("Invalid gym deletion scope");
  const args = { p_id: job.id, p_token: token };
  try {
    if (inventory.length) {
      if (!verifyR2Scope) throw new Error("Cross-environment storage verification is required");
      await verifyR2Scope(job.organization_id, inventory);
    }
    await rpc(client, "check_gym_deletion_storage", args);
    // Commit the FK-checked database purge first. Storage/auth are idempotent
    // and retried until confirmed; completion is never reported prematurely.
    await rpc(client, "purge_gym_database", args);
    const { data: buckets, error } = await client.storage.listBuckets();
    if (error) throw new Error("Supabase bucket inventory failed");
    for (const bucket of buckets ?? []) await purgeSupabaseFolder(client, bucket.id, job.organization_id);
    for (const bucket of inventory) await purgeR2Folder(bucket, job.organization_id);
    for (const user of job.user_ids) {
      if (!UUID.test(user)) throw new Error("Invalid login account ID");
      const safe = await rpc<boolean>(client, "gym_deletion_auth_candidate", { ...args, p_user: user });
      if (!safe) continue; // identity is still referenced outside this gym
      const result = await client.auth.admin.deleteUser(user);
      if (result.error && result.error.status !== 404) throw new Error("Login account cleanup failed");
    }
    await rpc(client, "finish_gym_deletion", args);
    return { processed: 1, failed: 0 };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gym cleanup failed";
    await rpc(client, "finish_gym_deletion", { ...args, p_error: message });
    return { processed: 0, failed: 1 };
  }
}
