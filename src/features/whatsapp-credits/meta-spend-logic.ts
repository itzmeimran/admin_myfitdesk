import { DAY_MS, istDateKey } from "@/core/dates/ist";

export type SpendPeriod = "month" | "last_month" | "custom" | "lifetime";
export type SpendSelection = { period: SpendPeriod; fromDate: string; toDate: string; from: string; to: string; error: string | null };
export type MetaPricingPoint = { start: number; end: number; pricing_category: string; pricing_type: string; volume: number; cost: number };
export type SpendCategory = { category: string; messages: number; paidMessages: number; freeMessages: number; costMinor: number };
export type SpendTotals = { costMinor: number; messages: number; paidMessages: number; freeMessages: number; categories: SpendCategory[]; days: { date: string; costMinor: number; messages: number }[] };
export type MetaSpendReport = { selection: SpendSelection } & (
  | { status: "unavailable"; error: string }
  | { status: "ready"; currency: string; accountName: string; retrievedAt: string; totals: SpendTotals }
);

function validDate(value: string | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value);
}

export function spendSelection(params: { period?: string; from?: string; to?: string }, now = new Date(), createdAt?: number): SpendSelection {
  const today = istDateKey(now);
  const month = `${today.slice(0, 7)}-01`;
  const period: SpendPeriod = params.period === "month" || params.period === "last_month" || params.period === "lifetime" || params.period === "custom"
    ? params.period : params.from || params.to ? "custom" : "month";
  let fromDate = month;
  let toDate = today;
  let error: string | null = null;
  if (period === "last_month") {
    toDate = istDateKey(new Date(Date.parse(`${month}T00:00:00+05:30`) - DAY_MS));
    fromDate = `${toDate.slice(0, 7)}-01`;
  } else if (period === "custom") {
    if (!validDate(params.from) || !validDate(params.to)) error = "Choose a valid start and end date for the custom period.";
    else { fromDate = params.from; toDate = params.to; }
  } else if (period === "lifetime" && createdAt !== undefined) {
    fromDate = istDateKey(new Date(createdAt * 1000));
  }
  if (toDate < fromDate || fromDate > today || toDate > today) error = "Choose a reporting period ending on or before today, with the start before the end.";
  return { period, fromDate, toDate, from: new Date(`${fromDate}T00:00:00+05:30`).toISOString(),
    to: toDate === today ? now.toISOString() : new Date(Date.parse(`${toDate}T00:00:00+05:30`) + DAY_MS).toISOString(), error };
}

/** Sum Meta's returned costs, never local message counts or configured rates.
 * Keep six decimal places until presentation, rather than rounding each message/day. */
export function aggregateMetaPricing(points: MetaPricingPoint[]): SpendTotals {
  const categories = new Map<string, { messages: number; paidMessages: number; freeMessages: number; costUnits: number }>();
  const days = new Map<string, { messages: number; costUnits: number }>();
  for (const p of points) {
    if (!Number.isFinite(p.start) || !Number.isFinite(p.end) || p.end <= p.start || typeof p.pricing_category !== "string" || typeof p.pricing_type !== "string"
      || !Number.isInteger(p.volume) || p.volume < 0 || typeof p.cost !== "number" || !Number.isFinite(p.cost) || p.cost < 0) {
      throw new Error("Meta did not return complete message cost data. No spending total is shown.");
    }
    const row = categories.get(p.pricing_category) ?? { messages: 0, paidMessages: 0, freeMessages: 0, costUnits: 0 };
    const free = p.pricing_type.startsWith("FREE_") || p.cost === 0;
    row.messages += p.volume;
    row.freeMessages += free ? p.volume : 0;
    row.paidMessages += free ? 0 : p.volume;
    row.costUnits += Math.round(p.cost * 1_000_000);
    categories.set(p.pricing_category, row);
    const date = istDateKey(new Date(p.start * 1000));
    const day = days.get(date) ?? { messages: 0, costUnits: 0 };
    day.messages += p.volume; day.costUnits += Math.round(p.cost * 1_000_000); days.set(date, day);
  }
  const rows = [...categories].sort(([a], [b]) => a.localeCompare(b)).map(([category, row]) => ({ category,
    messages: row.messages, paidMessages: row.paidMessages, freeMessages: row.freeMessages, costMinor: row.costUnits / 10_000 }));
  return { costMinor: [...categories.values()].reduce((n, r) => n + r.costUnits, 0) / 10_000, messages: rows.reduce((n, r) => n + r.messages, 0),
    paidMessages: rows.reduce((n, r) => n + r.paidMessages, 0), freeMessages: rows.reduce((n, r) => n + r.freeMessages, 0), categories: rows,
    days: [...days].sort(([a], [b]) => b.localeCompare(a)).map(([date, r]) => ({ date, messages: r.messages, costMinor: r.costUnits / 10_000 })) };
}
