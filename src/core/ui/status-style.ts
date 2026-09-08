/**
 * Status-pill coloring for this app's own status vocabulary — adapted from
 * FitDeskApp/src/core/ui/status-style.ts's `statusPillClass`, but keyed to
 * the admin design's `PILL` map (design-audit.md) instead of the tenant
 * app's member/subscription statuses. That map uses two colors this app's
 * Tailwind theme doesn't have a utility for verbatim (Grace's 10%-alpha
 * accent wash, Read-only/Failed's solid accent fill with paper text), so
 * this returns a style object rather than a class string — every call site
 * applies it as `style={pillTone(status)}` alongside the shared pill
 * layout classes.
 *
 * Every pill always renders its text label alongside the color — color is
 * never the only signal (stated explicitly in the design's accessibility
 * spec section, and this file exists to make that easy to keep true).
 */
export type PillTone = { backgroundColor: string; color: string };

const PILL: Record<string, PillTone> = {
  Active: { backgroundColor: "var(--sand)", color: "var(--ink)" },
  Trialing: { backgroundColor: "var(--hi)", color: "var(--on-hi)" },
  Grace: { backgroundColor: "rgba(191,59,21,0.10)", color: "var(--accent)" },
  "Read-only": { backgroundColor: "var(--accent)", color: "var(--paper)" },
  Cancelled: { backgroundColor: "var(--sand)", color: "var(--mute)" },
  Succeeded: { backgroundColor: "var(--sand)", color: "var(--ink)" },
  Failed: { backgroundColor: "var(--accent)", color: "var(--paper)" },
  Refunded: { backgroundColor: "var(--hi)", color: "var(--on-hi)" },
  // Real-data addition (not in the original design): a platform_payments
  // row genuinely sitting at status 'created' — checkout started, not yet
  // resolved. Reuses Grace's amber/accent-wash tone since both mean "in
  // flight, not resolved yet" — see revenue/mock-data.ts's InvoiceStatus.
  Pending: { backgroundColor: "rgba(191,59,21,0.10)", color: "var(--accent)" },
};

/** Falls back to the neutral "Active" tone for any status string not in the
 * map above, rather than throwing — a display helper should never be the
 * reason a page crashes. */
export function pillTone(status: string): PillTone {
  return PILL[status] ?? PILL.Active;
}

/** Shared layout classes for every status pill in the app — pair with
 * `style={pillTone(status)}` for the color. */
export const PILL_CLASS =
  "inline-flex items-center px-[7px] py-[4px] text-[9.5px] font-bold uppercase tracking-[0.1em]";
