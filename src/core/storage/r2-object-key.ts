import "server-only";
import { r2Env } from "@/core/config/r2";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAFE_KEY_CHARS_RE = /^[A-Za-z0-9/_.-]+$/;

export class InvalidR2ObjectKeyError extends Error {}

/** Ported from FitDeskApp's r2-object-key.ts: rejects URLs, leading slashes,
 * `..`/`.`/empty segments, backslashes, and any key whose first segment isn't
 * a real organization uuid — before it ever reaches an S3 command. */
export function validateR2ObjectKey(key: string): void {
  if (!key || typeof key !== "string") throw new InvalidR2ObjectKeyError("Object key must be a non-empty string.");
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(key) || key.startsWith("//")) {
    throw new InvalidR2ObjectKeyError(`Object key must not be an absolute URL: "${key}"`);
  }
  if (key.startsWith("/")) throw new InvalidR2ObjectKeyError(`Object key must not start with "/": "${key}"`);
  if (key.includes("\\")) throw new InvalidR2ObjectKeyError(`Object key must not contain backslashes: "${key}"`);
  const segments = key.split("/");
  if (segments.some((s) => s === "" || s === "." || s === "..")) {
    throw new InvalidR2ObjectKeyError(`Object key must not contain "..", "." or empty segments: "${key}"`);
  }
  if (!SAFE_KEY_CHARS_RE.test(key)) {
    throw new InvalidR2ObjectKeyError(`Object key contains characters that aren't allowed: "${key}"`);
  }
  if (!UUID_RE.test(segments[0])) {
    throw new InvalidR2ObjectKeyError(`Object key must start with an organization id (uuid): "${key}"`);
  }
}

/** CDN URL for a key in the new public bucket (R2_PUBLIC_URL_BASE). */
export function buildPublicR2Url(key: string): string {
  validateR2ObjectKey(key);
  const base = r2Env.R2_PUBLIC_URL_BASE;
  if (!base) {
    throw new Error("R2_PUBLIC_URL_BASE isn't set — the public R2 bucket needs a durable public URL base.");
  }
  return `${base.replace(/\/+$/, "")}/${key}`;
}
