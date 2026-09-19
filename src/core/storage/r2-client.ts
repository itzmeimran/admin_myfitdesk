import "server-only";
import { S3Client } from "@aws-sdk/client-s3";
import { r2Env } from "@/core/config/r2";

/**
 * Ported (gym-logo subset) from FitDeskApp's src/core/storage/r2-client.ts.
 * Admin only ever writes gym logos, so only the "legacy" and "public"
 * targets exist here — the "private" bucket (member avatars, ID cards,
 * receipts) is never touched by this app.
 */
export type R2Target = "legacy" | "public";
export type R2RolloutMode = "legacy" | "mirror" | "prefer-target" | "target";

const ROLLOUT_MODES: readonly R2RolloutMode[] = ["legacy", "mirror", "prefer-target", "target"];

/** A missing/unrecognized value degrades to "legacy", never fails boot. */
export function resolveR2RolloutMode(): R2RolloutMode {
  const v = r2Env.R2_STORAGE_ROLLOUT_MODE?.trim().toLowerCase();
  return v && (ROLLOUT_MODES as readonly string[]).includes(v) ? (v as R2RolloutMode) : "legacy";
}

type R2TargetConfig = { accountId: string; accessKeyId: string; secretAccessKey: string; bucket: string };

function readTargetConfig(target: R2Target): Partial<R2TargetConfig> {
  if (target === "legacy") {
    return {
      accountId: r2Env.R2_ACCOUNT_ID,
      accessKeyId: r2Env.R2_ACCESS_KEY_ID,
      secretAccessKey: r2Env.R2_SECRET_ACCESS_KEY,
      bucket: r2Env.R2_BUCKET_NAME,
    };
  }
  return {
    accountId: r2Env.R2_ACCOUNT_ID,
    accessKeyId: r2Env.R2_PUBLIC_ACCESS_KEY_ID,
    secretAccessKey: r2Env.R2_PUBLIC_SECRET_ACCESS_KEY,
    bucket: r2Env.R2_PUBLIC_BUCKET_NAME,
  };
}

function isComplete(c: Partial<R2TargetConfig>): c is R2TargetConfig {
  return Boolean(c.accountId && c.accessKeyId && c.secretAccessKey && c.bucket);
}

export function isR2TargetConfigured(target: R2Target): boolean {
  return isComplete(readTargetConfig(target));
}

// One cached client per target; never substitute one target's client for another's.
const clientCache = new Map<R2Target, { client: S3Client; accessKeyId: string }>();

export function r2Client(target: R2Target): { client: S3Client; bucket: string } {
  const cfg = readTargetConfig(target);
  if (!isComplete(cfg)) {
    throw new Error(`Cloudflare R2 (${target}) isn't configured for this deployment.`);
  }
  const cached = clientCache.get(target);
  if (cached && cached.accessKeyId === cfg.accessKeyId) {
    return { client: cached.client, bucket: cfg.bucket };
  }
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
    forcePathStyle: true,
  });
  clientCache.set(target, { client, accessKeyId: cfg.accessKeyId });
  return { client, bucket: cfg.bucket };
}

/**
 * Supabase vs. R2, same rule as FitDeskApp's resolveStorageProvider: an
 * explicit AVATAR_STORAGE_PROVIDER wins, otherwise R2 whenever it's usable.
 */
export function resolveStorageProvider(r2Ready: boolean): "r2" | "supabase" {
  const explicit = r2Env.AVATAR_STORAGE_PROVIDER;
  if (explicit === "r2" || explicit === "supabase") return explicit;
  return r2Ready ? "r2" : "supabase";
}
