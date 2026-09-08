/** Money is stored as integer minor units (e.g. paise). These helpers convert
 * to/from the major-unit strings staff actually type and read. INR-only for
 * now — exponent isn't read from a `currencies` table in this trimmed schema.
 *
 * Copied verbatim from FitDeskApp/src/core/money/format.ts. Money stays
 * `bigint`-shaped (minor units) throughout this product's data model even
 * though today's admin screens read from mock arrays of pre-formatted
 * strings — see the design's own "Data mapping" spec section, which is
 * explicit that price is stored as `price_minor`. */

const EXPONENT = 2;

/** Parses a rupee amount typed by a user (e.g. "1,500.50") into minor units.
 * Returns null if the input isn't a valid non-negative amount. */
export function toMinorUnits(raw: string): number | null {
  const cleaned = raw.trim().replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) {
    return null;
  }
  const [whole, fraction = ""] = cleaned.split(".");
  const paddedFraction = fraction.padEnd(EXPONENT, "0");
  const minor = Number(whole) * 10 ** EXPONENT + Number(paddedFraction);
  return Number.isSafeInteger(minor) ? minor : null;
}

export function formatMinor(minor: number | bigint, currency = "INR"): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: EXPONENT,
  }).format(Number(minor) / 10 ** EXPONENT);
}

/** Whole-rupee display, no paise — matches the design's own money strings
 * ("₹649", "₹27,389"), which never show a fractional amount. New addition
 * (not part of the FitDeskApp-verbatim block above): every admin-screen
 * amount in the design is whole rupees, and this product's own pricing
 * (platform_packages.price_minor) is always a round-rupee figure in
 * practice, so this is the display formatter these screens actually need. */
export function formatMinorWhole(minor: number | bigint, currency = "INR"): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(minor) / 10 ** EXPONENT);
}
