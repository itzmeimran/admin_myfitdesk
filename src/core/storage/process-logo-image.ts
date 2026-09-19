import "server-only";
import sharp from "sharp";

/** Ported from FitDeskApp's process-logo-image.ts: validate-by-decoding, so a
 * MIME type alone (which is only what the client claimed) is never trusted,
 * then re-encode to a bounded WebP. `contain` keeps a non-square wordmark
 * intact; WebP preserves the transparent letterbox. */
export const LOGO_MAX_DIMENSION = 512;
const WEBP_QUALITY = 88;

export type ProcessedLogo = { buffer: Buffer; contentType: "image/webp" };

export async function processLogoImage(input: Buffer): Promise<ProcessedLogo> {
  try {
    const data = await sharp(input, { failOn: "error" })
      .rotate()
      .resize(LOGO_MAX_DIMENSION, LOGO_MAX_DIMENSION, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
        withoutEnlargement: true,
      })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();
    return { buffer: data, contentType: "image/webp" };
  } catch {
    throw new Error("That doesn't look like a valid image.");
  }
}
