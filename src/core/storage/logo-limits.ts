export const MAX_LOGO_BYTES = 5 * 1024 * 1024;
export const ALLOWED_LOGO_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
export const LOGO_EXTENSIONS = ["png", "jpg", "webp"] as const;

export function logoExtension(contentType: string): (typeof LOGO_EXTENSIONS)[number] {
  return contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
}
