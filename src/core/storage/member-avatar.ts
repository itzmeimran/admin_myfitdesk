import "server-only";
import { GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/core/db/database.types";
import { isR2TargetConfigured, r2Client, resolveR2RolloutMode, resolveStorageProvider, type R2Target } from "./r2-client";
import { validateR2ObjectKey } from "./r2-object-key";

/**
 * READ-ONLY resolver for member profile pictures — the display half of
 * FitDeskApp's src/core/storage/avatar-storage.ts, ported by copying (D-B).
 * This app never writes or deletes a member photo.
 *
 * `members.avatar_path` is a bare, provider-independent key
 * (`{organizationId}/members/{memberId}.webp`); a legacy row may instead hold
 * a full http(s) URL, which is returned as-is. A bare key resolves through
 * whichever provider is active (same rule as the tenant app):
 *  - R2 (legacy bucket, private): a short-lived presigned GET URL, minted per
 *    request and never persisted or cached.
 *  - Supabase Storage ("member-avatars"): its public URL.
 *
 * Rollout mode follows the tenant app's own routedRead (R2_STORAGE_ROLLOUT_MODE,
 * which must match the tenant deployment): "legacy"/"mirror" read the legacy
 * bucket; "target" reads only the private bucket (R2_PRIVATE_*); "prefer-target"
 * reads the private bucket when the object exists there, else legacy.
 *
 * Every key is validated and must start with the gym's own organization id,
 * so a bad row can never make this mint a URL for another tenant's object.
 * Any failure yields `null` (initials), never an error in the admin UI.
 */
const SIGNED_URL_TTL_SECONDS = 600;

async function existsInPrivate(key: string): Promise<boolean> {
  const { client, bucket } = r2Client("private");
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (err) {
    const status = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
    const name = (err as { name?: string })?.name;
    if (name === "NotFound" || name === "NoSuchKey" || status === 404) return false;
    throw err;
  }
}

async function resolveOne(
  supabase: SupabaseClient<Database>,
  organizationId: string,
  keyOrUrl: string,
): Promise<string | null> {
  if (/^https?:\/\//i.test(keyOrUrl)) return keyOrUrl;
  validateR2ObjectKey(keyOrUrl);
  if (!keyOrUrl.startsWith(`${organizationId}/members/`)) {
    throw new Error("Avatar key does not belong to this organization.");
  }
  const mode = resolveR2RolloutMode();
  const r2Ready = isR2TargetConfigured("legacy") || (mode === "target" && isR2TargetConfigured("private"));
  if (resolveStorageProvider(r2Ready) === "r2") {
    let target: R2Target = "legacy";
    if (mode === "target") target = "private";
    else if (mode === "prefer-target" && isR2TargetConfigured("private") && (await existsInPrivate(keyOrUrl))) target = "private";
    const { client, bucket } = r2Client(target);
    return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: keyOrUrl }), {
      expiresIn: SIGNED_URL_TTL_SECONDS,
    });
  }
  return supabase.storage.from("member-avatars").getPublicUrl(keyOrUrl).data.publicUrl;
}

/** member id → display URL, for the members that have a resolvable photo.
 * Presigning is local computation (no network call per member). */
export async function resolveMemberAvatarUrls(
  supabase: SupabaseClient<Database>,
  organizationId: string,
  keysByMemberId: Map<string, string>,
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  await Promise.all(
    [...keysByMemberId].map(async ([memberId, key]) => {
      try {
        const url = await resolveOne(supabase, organizationId, key);
        if (url) out[memberId] = url;
      } catch (error) {
        console.error(`member-avatar: couldn't resolve a URL for member ${memberId}`, error);
      }
    }),
  );
  return out;
}
