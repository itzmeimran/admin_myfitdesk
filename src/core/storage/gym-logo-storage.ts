import "server-only";
import { PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import type { SupabaseClient } from "@supabase/supabase-js";
import { r2Env } from "@/core/config/r2";
import { isR2TargetConfigured, r2Client, resolveR2RolloutMode, resolveStorageProvider, type R2Target } from "./r2-client";
import { buildPublicR2Url, validateR2ObjectKey } from "./r2-object-key";

/**
 * Gym-logo storage for the admin app — a gym-logo-only port of FitDeskApp's
 * src/core/storage/gym-logo-storage.ts (+ r2-router.ts + the R2/Supabase
 * providers), collapsed into one module. Same env vars, same deterministic
 * key (`{organizationId}/gym-logo.webp`), same rollout-mode semantics, so a
 * logo uploaded here is served by the tenant app exactly like one uploaded
 * there:
 *
 *  - Supabase Storage ("gym-logos" bucket) when R2 isn't usable/selected.
 *  - "legacy":        write the legacy R2 bucket only; URL = R2_LEGACY_PUBLIC_URL_BASE/key.
 *  - "mirror":        legacy bucket authoritative, public bucket best-effort.
 *  - "prefer-target": as mirror, but the URL is the public CDN once that write landed.
 *  - "target":        public bucket only; URL = R2_PUBLIC_URL_BASE/key.
 *
 * The persisted URL must be durable (it is embedded in emails), so it is
 * always a public URL — never a presigned one.
 */

const SUPABASE_BUCKET = "gym-logos";

export function gymLogoKey(organizationId: string): string {
  return `${organizationId}/gym-logo.webp`;
}

/** Pre-R2 admin uploads used `{orgId}/logo.{ext}` in Supabase Storage; these
 * are cleaned up on replace/remove so an old file can't linger. */
const LEGACY_SUPABASE_KEYS = (organizationId: string) =>
  ["png", "jpg", "webp"].map((e) => `${organizationId}/logo.${e}`);

function isR2ActiveForLogos(): boolean {
  const legacyReady = isR2TargetConfigured("legacy") && Boolean(r2Env.R2_LEGACY_PUBLIC_URL_BASE);
  // In "target" mode the legacy bucket may be retired; the public bucket alone is enough.
  const targetReady =
    resolveR2RolloutMode() === "target" && isR2TargetConfigured("public") && Boolean(r2Env.R2_PUBLIC_URL_BASE);
  return resolveStorageProvider(legacyReady || targetReady) === "r2";
}

async function putR2(target: R2Target, key: string, buffer: Buffer, contentType: string): Promise<void> {
  validateR2ObjectKey(key);
  const { client, bucket } = r2Client(target);
  await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: buffer, ContentType: contentType }));
}

async function deleteR2(target: R2Target, key: string): Promise<void> {
  validateR2ObjectKey(key);
  const { client, bucket } = r2Client(target);
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

function msg(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

export function isGymLogoStorageR2(): boolean {
  return isR2ActiveForLogos();
}

/** `service` is the service-role Supabase client — only used on the Supabase
 * fallback path (a platform admin has no staff_membership for the bucket's own
 * org-scoped RLS policy). Returns the durable public URL to persist. */
export async function uploadGymLogoObject(
  service: SupabaseClient,
  organizationId: string,
  buffer: Buffer,
  contentType: string,
): Promise<{ url: string | null; error: string | null }> {
  const key = gymLogoKey(organizationId);

  if (!isR2ActiveForLogos()) {
    await service.storage.from(SUPABASE_BUCKET).remove(LEGACY_SUPABASE_KEYS(organizationId));
    const { error } = await service.storage.from(SUPABASE_BUCKET).upload(key, buffer, { contentType, upsert: true });
    if (error) return { url: null, error: `Couldn't upload the logo: ${error.message}` };
    return { url: service.storage.from(SUPABASE_BUCKET).getPublicUrl(key).data.publicUrl, error: null };
  }

  const mode = resolveR2RolloutMode();
  try {
    if (mode === "target") {
      await putR2("public", key, buffer, contentType);
      return { url: buildPublicR2Url(key), error: null };
    }

    // "legacy" / "mirror" / "prefer-target": legacy bucket is authoritative.
    const base = r2Env.R2_LEGACY_PUBLIC_URL_BASE;
    if (!base) {
      return {
        url: null,
        error:
          "R2_LEGACY_PUBLIC_URL_BASE isn't set — a gym logo on the legacy R2 bucket needs a durable public URL.",
      };
    }
    await putR2("legacy", key, buffer, contentType);
    const legacyUrl = `${base.replace(/\/+$/, "")}/${key}`;
    if (mode === "legacy") return { url: legacyUrl, error: null };

    // Best-effort mirror to the public bucket; never blocks, always logged.
    let mirrorOk = true;
    try {
      await putR2("public", key, buffer, contentType);
    } catch (err) {
      mirrorOk = false;
      console.error(`gym-logo-storage: mirrored write to the public R2 bucket failed for ${key}: ${msg(err, "")}`);
    }
    return { url: mode === "prefer-target" && mirrorOk ? buildPublicR2Url(key) : legacyUrl, error: null };
  } catch (err) {
    return { url: null, error: msg(err, "Couldn't upload this logo.") };
  }
}

/** Best-effort delete — an orphaned object is a log line, never a user-facing error. */
export async function deleteGymLogoObject(service: SupabaseClient, organizationId: string): Promise<void> {
  const key = gymLogoKey(organizationId);

  if (!isR2ActiveForLogos()) {
    const { error } = await service.storage
      .from(SUPABASE_BUCKET)
      .remove([key, ...LEGACY_SUPABASE_KEYS(organizationId)]);
    if (error) console.error(`gym-logo-storage: couldn't remove ${key}: ${error.message}`);
    return;
  }

  const mode = resolveR2RolloutMode();
  const targets: R2Target[] = mode === "target" ? ["public"] : mode === "legacy" ? ["legacy"] : ["legacy", "public"];
  await Promise.all(
    targets.map(async (t) => {
      try {
        await deleteR2(t, key);
      } catch (err) {
        console.error(`gym-logo-storage: couldn't remove ${key} from ${t}: ${msg(err, "")}`);
      }
    }),
  );
}
