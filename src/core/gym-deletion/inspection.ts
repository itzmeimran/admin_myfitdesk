import "server-only";
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminEnvironment } from "@/core/config/environments";
import type { CleanupInspection } from "@/features/gyms/deletion-inspection";
import { deletionStorageConfig } from "./worker";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE = 100;
const MAX_PAGES = 100;
const MAX_ACCOUNTS = 100;

async function inspectFiles(client: SupabaseClient, environment: AdminEnvironment, org: string) {
  const findings: string[] = [];
  let complete = true, total = 0;
  const buckets = await client.storage.listBuckets();
  if (buckets.error) { complete = false; findings.push("Supabase bucket inventory unavailable."); }
  for (const bucket of buckets.data ?? []) {
    let count = 0, pages = 0;
    const folders = [org];
    while (folders.length) {
      const folder = folders.shift()!;
      for (let offset = 0; ; offset += PAGE) {
        if (++pages > MAX_PAGES) { complete = false; findings.push("Supabase scan limit reached; result is partial."); folders.length = 0; break; }
        const result = await client.storage.from(bucket.id).list(folder, { limit: PAGE, offset, sortBy: { column: "name", order: "asc" } });
        if (result.error) { complete = false; findings.push("A Supabase folder could not be inspected."); break; }
        for (const item of result.data ?? []) {
          // Only walk inside this UUID folder; do not read file content.
          if (!item.name || /[\\/]/.test(item.name) || item.name === "." || item.name === "..") { complete = false; continue; }
          if (item.id) count++;
          else folders.push(`${folder}/${item.name}`);
        }
        if ((result.data?.length ?? 0) < PAGE) break;
      }
    }
    total += count;
    findings.push(`Supabase ${bucket.id}: ${count} file(s) found.`);
  }
  try {
    const inventory = deletionStorageConfig(environment);
    if (!inventory.length) findings.push("Verified storage inventory declares no R2 buckets.");
    for (const config of inventory) {
      const s3 = new S3Client({ region: "auto", endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`, credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey }, maxAttempts: 1 });
      let count = 0, continuation: string | undefined;
      try {
        for (let page = 0; ; page++) {
          if (page >= MAX_PAGES) { complete = false; findings.push("R2 scan limit reached; result is partial."); break; }
          const result = await s3.send(new ListObjectsV2Command({ Bucket: config.bucket, Prefix: `${org}/`, MaxKeys: 1000, ContinuationToken: continuation }), { abortSignal: AbortSignal.timeout(15_000) });
          count += result.Contents?.length ?? 0;
          if (!result.IsTruncated) break;
          if (!result.NextContinuationToken || result.NextContinuationToken === continuation) { complete = false; break; }
          continuation = result.NextContinuationToken;
        }
        findings.push(`R2 ${config.bucket}: ${count} file(s) found.`);
      } catch { complete = false; findings.push(`R2 ${config.bucket}: inspection unavailable.`); }
      finally { total += count; s3.destroy(); }
    }
  } catch { complete = false; findings.push("The verified R2 inventory is unavailable. Configure this environment's deletion storage inventory to check all current and retired buckets."); }
  return { status: total ? `${total} file(s) still present${complete ? "" : " (partial scan)"}` : complete ? "No files found in configured storage" : "Storage verification incomplete", detail: `${findings.join(" ")} Checked only the exact gym UUID folder. Backups, CDN caches and external provider history are outside this check.` };
}

async function inspectAccounts(client: SupabaseClient, org: string) {
  const ids = new Set<string>();
  let complete = true;
  // Never infer ownership from a reused gym name, code, email or phone.
  for (let page = 0; ; page++) {
    if (page >= MAX_PAGES) { complete = false; break; }
    const result = await client.from("admin_audit_log")
      .select("old_user:old_values->>user_id,new_user:new_values->>user_id,old_invite_user:old_values->>phone_auth_user_id,new_invite_user:new_values->>phone_auth_user_id")
      .eq("target_organization_id", org).in("entity_type", ["staff_memberships", "staff_invitations"])
      .order("id").range(page * PAGE, (page + 1) * PAGE - 1);
    if (result.error) { complete = false; break; }
    for (const row of result.data ?? []) for (const value of Object.values(row)) {
      if (typeof value !== "string" || !UUID.test(value) || ids.has(value)) continue;
      if (ids.size >= MAX_ACCOUNTS) { complete = false; break; }
      ids.add(value);
    }
    if (!complete) break;
    if ((result.data?.length ?? 0) < PAGE) break;
  }
  if (!ids.size) return { status: "Original account inventory unavailable", detail: "No original login-account IDs could be recovered from retained staff audit events. Account deletion cannot be established from a gym name, code or current owner's contact details. Completed automatic jobs deliberately erase their captured account IDs." };
  let absent = 0, referenced = 0, remaining = 0, unavailable = 0;
  for (const id of ids) {
    const result = await client.auth.admin.getUserById(id);
    if (result.error?.status === 404 || result.error?.code === "user_not_found") { absent++; continue; }
    if (result.error || !result.data.user) { unavailable++; continue; }
    const [staff, admins] = await Promise.all([
      client.from("staff_memberships").select("id", { count: "exact", head: true }).eq("user_id", id),
      client.from("platform_admins").select("user_id", { count: "exact", head: true }).eq("user_id", id),
    ]);
    if (staff.error || admins.error) unavailable++;
    else if ((staff.count ?? 0) + (admins.count ?? 0) > 0) referenced++;
    else remaining++;
  }
  return { status: remaining ? "Existing accounts require review" : unavailable || !complete ? "Account verification incomplete" : "Recovered account IDs checked",
    detail: `${ids.size} historical account ID(s) recovered: ${absent} absent, ${referenced} still referenced by staff memberships or platform access, ${remaining} present without those references, ${unavailable} unavailable. Other surviving references may also require retention. ${complete ? "" : "Audit discovery was incomplete. "}Retained audit events may not contain the full original roster; these counts are not proof that every original account was deleted. No accounts were changed.` };
}

/** Read-only inspection: no purge RPCs, storage removals or auth mutations. */
export async function inspectGymCleanup(client: SupabaseClient, environment: AdminEnvironment, org: string): Promise<CleanupInspection> {
  if (!UUID.test(org)) throw new Error("Invalid gym ID");
  const gym = await client.from("organizations").select("id").eq("id", org).maybeSingle();
  if (gym.error) throw new Error("Gym record could not be verified");
  // Current gym data is not a deletion residual. Avoid scanning its accounts/files.
  if (gym.data) return { checkedAt: new Date().toISOString(), database: { status: "Gym record exists", detail: "This exact gym ID currently exists. Its files and accounts are current data; review the gym before treating them as cleanup residuals." }, files: { status: "Not inspected", detail: "The gym record is present." }, accounts: { status: "Not inspected", detail: "The gym record is present." } };
  const [files, accounts] = await Promise.all([inspectFiles(client, environment, org), inspectAccounts(client, org)]);
  return { checkedAt: new Date().toISOString(), database: { status: "Gym record absent", detail: "The organizations table has no row for this exact gym ID in the selected environment. This live check does not reconstruct historical row counts or independently scan every related table; use the automatic purge receipt as evidence of the full tenant purge." }, files, accounts };
}
