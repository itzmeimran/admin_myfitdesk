"use client";

import { formatMinor } from "@/core/money/format";
import { formatCalendarDate } from "@/core/dates/format";
import { ColumnBarChart } from "@/components/ColumnBarChart";
import type { MetaSpendReport } from "./meta-spend-logic";
import { rechargeProfit, type RechargeIncomeReport } from "./recharge-income";

export function RechargeProfitView({ income, spending }: { income: RechargeIncomeReport; spending: MetaSpendReport }) {
  const profit = rechargeProfit(income, spending);
  const ready = income.status === "ready" && spending.status === "ready" && profit !== null;
  const range = spending.selection;
  return <section className="flex flex-col gap-3 border-t-2 border-ink pt-5">
    <div>
      <h2 className="font-display text-[18px]">Recharge earnings &amp; profit</h2>
      <p className="mt-1 text-[11.5px] leading-relaxed text-mute">Successful credit recharge payments compared with Meta&apos;s reported message charges. Uses the period selected above.</p>
      <p className="mt-1 text-[11.5px] text-mute">{formatCalendarDate(range.fromDate)} – {formatCalendarDate(range.toDate)} · IST</p>
    </div>
    {!ready ? <p role="status" className="border-[1.5px] border-line bg-paper p-4 text-[12px] leading-relaxed">
      {income.status === "unavailable" ? income.error : "The income and spending reports cannot be compared. Refresh to load matching data."}
    </p> : <>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        {[{ label: "Earned from recharges", amount: income.incomeMinor, detail: `${income.rechargeCount.toLocaleString("en-IN")} successful ${income.rechargeCount === 1 ? "recharge" : "recharges"} · ${income.creditsSold.toLocaleString("en-IN")} credits sold` },
          { label: "Spent on Meta", amount: spending.totals.costMinor, detail: "Reported charges for the same period" },
          { label: "Profit / loss", amount: profit, detail: profit < 0 ? "Loss · spending exceeds recharge income" : profit > 0 ? "Profit · recharge income exceeds spending" : "Break even" }].map((tile, index) =>
          <div key={tile.label} className={`flex min-w-0 flex-col gap-1 border-[1.5px] p-4 ${index === 2 ? "border-ink bg-ink text-paper" : "border-line bg-paper"}`}>
            <span className="text-[10px] font-bold uppercase tracking-[0.1em]">{tile.label}</span>
            <strong className={`break-words font-display text-[26px] ${index === 2 ? "text-hi" : "text-ink"}`}>{formatMinor(tile.amount, income.currency)}</strong>
            <span className="text-[10.5px] leading-relaxed">{tile.detail}</span>
          </div>)}
      </div>
      <div className="flex flex-col gap-4 border-[1.5px] border-line bg-paper p-4">
        <div>
          <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-mute">Earned vs spent</h3>
          <p className="mt-1 text-[11.5px] text-mute2">Totals for the selected period · {income.currency}</p>
        </div>
        <ColumnBarChart label="Recharge earnings versus Meta spending for the selected period" columnMaxWidth={120}
          bars={[{ label: "Earned", amount: income.incomeMinor, color: "var(--hi)" }, { label: "Spent on Meta", amount: spending.totals.costMinor, color: "var(--accent)" }].map(row => ({
            key: row.label, label: row.label, valueLabel: formatMinor(row.amount, income.currency), color: row.color,
            heightPct: row.amount / (Math.max(income.incomeMinor, spending.totals.costMinor) || 1) * 80,
            title: `${row.label}: ${formatMinor(row.amount, income.currency)}`,
          }))} />
      </div>
      <p className="text-[10.5px] leading-relaxed text-mute3">Earnings use the amounts actually paid, not today&apos;s package prices. Free grants and refunded purchases are excluded. Profit/loss is income minus all managed-account Meta message charges, before taxes, payment fees and other costs. Recharges can be collected before their credits are used.</p>
    </>}
  </section>;
}
