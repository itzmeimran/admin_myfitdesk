import type { MetaSpendReport } from "./meta-spend-logic";

export type RechargeIncomeReport =
  | { status: "unavailable"; error: string }
  | { status: "ready"; currency: string; from: string; to: string; incomeMinor: number; rechargeCount: number; creditsSold: number };

/** Only compare complete reports in the same currency and exact time range. */
export function rechargeProfit(income: RechargeIncomeReport, spending: MetaSpendReport): number | null {
  if (income.status !== "ready" || spending.status !== "ready" || income.currency !== spending.currency
    || income.from !== spending.selection.from || income.to !== spending.selection.to) return null;
  return Math.round((income.incomeMinor - spending.totals.costMinor) * 10_000) / 10_000;
}
