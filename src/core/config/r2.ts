import "server-only";

/**
 * Optional Cloudflare R2 config for gym logos. Same variable names as
 * FitDeskApp's own src/core/config/server.ts, so the same values can be
 * copied straight across (D-B: reuse by copying). Kept out of
 * core/config/server.ts's fail-closed schema on purpose: without R2 keys the
 * app must still boot and logos keep going to Supabase Storage, exactly as
 * FitDeskApp's "auto" provider behaves.
 *
 * IMPORTANT: for a logo to display in the tenant app, this admin app must
 * write to the SAME bucket the tenant app is configured for — so
 * R2_STORAGE_ROLLOUT_MODE / AVATAR_STORAGE_PROVIDER here should match the
 * tenant deployment's values.
 */
export const r2Env = {
  R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID,
  // Legacy bucket (single pre-migration bucket)
  R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
  R2_BUCKET_NAME: process.env.R2_BUCKET_NAME,
  R2_LEGACY_PUBLIC_URL_BASE: process.env.R2_LEGACY_PUBLIC_URL_BASE,
  // New public bucket (gym logos / product images)
  R2_PUBLIC_BUCKET_NAME: process.env.R2_PUBLIC_BUCKET_NAME,
  R2_PUBLIC_ACCESS_KEY_ID: process.env.R2_PUBLIC_ACCESS_KEY_ID,
  R2_PUBLIC_SECRET_ACCESS_KEY: process.env.R2_PUBLIC_SECRET_ACCESS_KEY,
  R2_PUBLIC_URL_BASE: process.env.R2_PUBLIC_URL_BASE,
  AVATAR_STORAGE_PROVIDER: process.env.AVATAR_STORAGE_PROVIDER,
  R2_STORAGE_ROLLOUT_MODE: process.env.R2_STORAGE_ROLLOUT_MODE,
};
