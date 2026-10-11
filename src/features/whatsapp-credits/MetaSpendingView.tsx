"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/Button";
import { DatePicker, type DateRange } from "@/components/DatePicker";
import { PeriodSelector } from "@/components/PeriodSelector";
import { RetryIcon, UsageIcon } from "@/core/ui/icons";
import { istDateKey } from "@/core/dates/ist";
import { formatMinor } from "@/core/money/format";
import { formatCalendarDate, formatZonedDateTime } from "@/core/dates/format";
import type { MetaSpendReport, SpendPeriod } from "./meta-spend-logic";

export function MetaSpendingView({ report }: { report: MetaSpendReport }) {
  const router = useRouter(); const pathname = usePathname(); const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const { selection } = report;
  function navigate(period: SpendPeriod, range?: DateRange) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("period", period); params.delete("page");
    if (period === "custom") { params.set("from", range?.from ?? selection.fromDate); params.set("to", range?.to ?? selection.toDate); }
    else { params.delete("from"); params.delete("to"); }
    startTransition(() => router.push(`${pathname}?${params}`, { scroll: false }));
  }
  return <section className="flex flex-col gap-3 border-t-2 border-ink pt-5" aria-busy={pending}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="font-display text-[18px]">Meta message spending</h2>
        <p className="mt-1 text-[11.5px] leading-relaxed text-mute">Message charges reported directly by Meta for your managed WhatsApp account, including gym sends, OTPs and inbox messages.</p></div>
      <Button icon={RetryIcon} variant="secondary" size="sm" disabled={pending} pending={pending} pendingLabel="Loading…" onClick={() => startTransition(() => router.refresh())}>Refresh</Button>
    </div>
    <div className="flex flex-wrap items-center gap-3">
      <PeriodSelector<SpendPeriod> value={selection.period} disabled={pending} ariaLabel="Meta spending period" onChange={p => navigate(p)}
        options={[{ value: "month", label: "This month" }, { value: "last_month", label: "Last month" }, { value: "custom", label: "Custom period" }, { value: "lifetime", label: "Lifetime" }]} />
      {selection.period === "custom" ? <DatePicker mode="range" rangeValue={{ from: selection.fromDate, to: selection.toDate }}
        onRangeChange={range => navigate("custom", range)} max={istDateKey()}
        ariaLabel="Meta spending date range" disabled={pending} className="w-full sm:w-[260px]" /> : null}
    </div>
    <p className="text-[11.5px] text-mute">{formatCalendarDate(selection.fromDate)} – {formatCalendarDate(selection.toDate)} · IST{selection.period === "month" ? " · Month to date" : ""}</p>
    {report.status === "unavailable" ? <p role="status" className="border-[1.5px] border-line bg-paper p-4 text-[12px] leading-relaxed">{report.error}</p> : <>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        {[{ label: "Meta message charges", value: formatMinor(report.totals.costMinor, report.currency), detail: "Reported by Meta", main: true },
          { label: "Paid messages", value: report.totals.paidMessages.toLocaleString("en-IN"), detail: "Messages with a Meta charge", main: false },
          { label: "Free messages", value: report.totals.freeMessages.toLocaleString("en-IN"), detail: "Reported at zero cost by Meta", main: false }].map(t =>
          <div key={t.label} className={`flex min-w-0 flex-col gap-1 border-[1.5px] p-4 ${t.main ? "border-ink bg-ink text-paper" : "border-line bg-paper"}`}>
            <span className="text-[10px] font-bold uppercase tracking-[0.1em]">{t.label}</span><strong className={`font-display text-[26px] ${t.main ? "text-hi" : "text-ink"}`}>{t.value}</strong><span className="text-[10.5px]">{t.detail}</span>
          </div>)}
      </div>
      <p className="text-[10.5px] text-mute">{report.accountName} · All numbers in this WhatsApp account · Retrieved {formatZonedDateTime(report.retrievedAt, "Asia/Kolkata")}</p>
      <div className="overflow-x-auto border-[1.5px] border-line bg-paper">
        <table className="w-full min-w-[480px] border-collapse text-[12px]"><thead><tr>
          {["Category", "Paid messages", "Free messages", "Meta charges"].map((h, i) => <th key={h} className={`mfd-micro-label border-b border-line px-3 py-2.5 ${i ? "text-right" : "text-left"}`}>{h}</th>)}
        </tr></thead><tbody>{report.totals.categories.map(r => <tr key={r.category} className="mfd-table-row">
          <td className="border-b border-line px-3 py-2.5 capitalize">{r.category.toLowerCase().replaceAll("_", " ")}</td>
          <td className="border-b border-line px-3 py-2.5 text-right">{r.paidMessages.toLocaleString("en-IN")}</td>
          <td className="border-b border-line px-3 py-2.5 text-right">{r.freeMessages.toLocaleString("en-IN")}</td>
          <td className="border-b border-line px-3 py-2.5 text-right font-bold">{formatMinor(r.costMinor, report.currency)}</td>
        </tr>)}</tbody><tfoot><tr><th className="px-3 py-2.5 text-left">Total</th><td className="px-3 py-2.5 text-right">{report.totals.paidMessages.toLocaleString("en-IN")}</td><td className="px-3 py-2.5 text-right">{report.totals.freeMessages.toLocaleString("en-IN")}</td><td className="px-3 py-2.5 text-right font-bold">{formatMinor(report.totals.costMinor, report.currency)}</td></tr></tfoot></table>
      </div>
      <details className="border-[1.5px] border-line bg-paper text-[12px]"><summary className="cursor-pointer px-3 py-3 font-bold"><UsageIcon className="mr-2 inline-block" aria-hidden />Daily spending</summary>
        <table className="w-full border-collapse"><thead><tr><th className="px-3 py-2 text-left">Date (IST)</th><th className="px-3 py-2 text-right">Messages</th><th className="px-3 py-2 text-right">Meta charges</th></tr></thead>
          <tbody>{report.totals.days.map(d => <tr key={d.date}><td className="border-t border-line px-3 py-2">{formatCalendarDate(d.date)}</td><td className="border-t border-line px-3 py-2 text-right">{d.messages.toLocaleString("en-IN")}</td><td className="border-t border-line px-3 py-2 text-right">{formatMinor(d.costMinor, report.currency)}</td></tr>)}</tbody></table>
      </details>
      <p className="text-[10.5px] leading-relaxed text-mute3">Compare with WhatsApp Manager using this account and the same dates. Meta may update recent usage after a delay. These are message charges; invoice taxes, credits and payment transactions are separate.</p>
    </>}
  </section>;
}
