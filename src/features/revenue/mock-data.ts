/**
 * Mock data for Platform revenue — copied verbatim from the design
 * canvas's `revTiles` / `invoices` arrays (design-audit.md's Revenue
 * section, 4 tiles + 6 invoice rows).
 *
 * TODO(real-data): platform_payments is the real table (design-audit.md's
 * Data mapping section) — invoice_number from next_platform_invoice_number,
 * amount_minor, status, period_start/period_end, paid_at. Never the tenant
 * `payments` table (gym → member money, not gym → MyFitDesk money).
 */

export type RevenueTile = {
  label: string;
  value: string;
  hint: string;
  emphasis?: boolean;
  accentValue?: boolean;
};

export const REV_TILES: RevenueTile[] = [
  { label: "Collected in September", value: "₹18,246", hint: "214 succeeded invoices", emphasis: true },
  { label: "Net of refunds", value: "₹17,597", hint: "One Growth refund on cancellation" },
  { label: "Failed", value: "₹1,747", hint: "3 charges · card declined", accentValue: true },
  { label: "Awaiting settlement", value: "₹1,298", hint: "2 orders created, not captured" },
];

/**
 * "Pending" was added for real data (not in the original design canvas):
 * platform_payments can genuinely sit at status `'created'` — checkout
 * started, not yet resolved — which the design's own Succeeded/Failed/
 * Refunded vocabulary has no state for. See src/features/revenue/queries.ts.
 */
export type InvoiceStatus = "Succeeded" | "Failed" | "Refunded" | "Pending";

export type Invoice = {
  no: string;
  gym: string;
  package: string;
  period: string;
  status: InvoiceStatus;
  amount: string;
};

export const INVOICES: Invoice[] = [
  { no: "MFD-2026-00214", gym: "Iron Yard Fitness", package: "Growth monthly", period: "6 Sep – 5 Oct", status: "Succeeded", amount: "₹649" },
  { no: "MFD-2026-00213", gym: "Zenith Fitness Kollam", package: "Starter monthly", period: "4 Sep – 3 Oct", status: "Succeeded", amount: "₹449" },
  { no: "MFD-2026-00212", gym: "Apex Athletic Club", package: "Growth monthly", period: "3 Sep – 2 Oct", status: "Failed", amount: "₹649" },
  { no: "MFD-2026-00211", gym: "Pulse Fitness Studio", package: "Pro yearly", period: "2 Sep 26 – 1 Sep 27", status: "Succeeded", amount: "₹8,490" },
  { no: "MFD-2026-00210", gym: "Momentum Fitness", package: "Growth monthly", period: "1 Sep – 30 Sep", status: "Refunded", amount: "₹649" },
  { no: "MFD-2026-00209", gym: "Core Culture Fitness", package: "Growth yearly", period: "1 Sep 26 – 31 Aug 27", status: "Succeeded", amount: "₹6,490" },
];

export async function getRevenueTiles(): Promise<RevenueTile[]> {
  return REV_TILES;
}

export async function listInvoices(): Promise<Invoice[]> {
  return INVOICES;
}
