import { getRevenueTiles, listInvoices } from "@/features/revenue/mock-data";
import { pillTone, PILL_CLASS } from "@/core/ui/status-style";
import { ExportIcon } from "@/core/ui/icons";
import { ICON_SIZE } from "@/core/ui/icon-size";

/**
 * Entirely a Server Component — no interactive state on this page beyond
 * one disabled button, so unlike Gyms/Packages there's no client wrapper.
 * Swapping getRevenueTiles()/listInvoices() for real
 * src/features/revenue/queries.ts reads is the only change this page
 * needs later (see design-audit.md's Data mapping section).
 */
export default async function RevenuePage() {
  const [tiles, invoices] = await Promise.all([getRevenueTiles(), listInvoices()]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto flex min-w-0 flex-col gap-1">
          <h1 className="font-display text-[24px] tracking-[-0.02em] md:text-[26px]">Platform revenue</h1>
          <p className="text-[12.5px] text-mute">Money gyms paid MyFitDesk · September 2026 · MFD invoice series</p>
        </div>
        <button
          type="button"
          disabled
          title="Not implemented yet"
          className="flex min-h-[36px] items-center gap-2 border-[1.5px] border-line bg-paper px-3 text-[11.5px] font-bold uppercase tracking-[0.09em] text-ink disabled:cursor-not-allowed disabled:opacity-60"
        >
          <ExportIcon size={ICON_SIZE.button} aria-hidden />
          Download CSV
        </button>
      </div>

      <div className="flex flex-wrap gap-2.5">
        {tiles.map((t) => (
          <div
            key={t.label}
            className={`mfd-kpi-tile flex min-h-[104px] flex-col gap-1.5 border-[1.5px] p-3.5 ${
              t.emphasis ? "border-ink bg-ink" : "border-line bg-paper"
            }`}
          >
            <span className={`text-[10.5px] font-bold uppercase tracking-[0.12em] ${t.emphasis ? "text-hi" : "text-mute"}`}>
              {t.label}
            </span>
            <span
              className={`font-display text-[28px] tracking-[-0.02em] ${
                t.emphasis ? "text-paper" : t.accentValue ? "text-accent" : "text-ink"
              }`}
            >
              {t.value}
            </span>
            <span className={`text-[11.5px] ${t.emphasis ? "text-mute3" : "text-mute"}`}>{t.hint}</span>
          </div>
        ))}
      </div>

      <div className="border-l-2 border-accent bg-sand px-4 py-3 text-[12.5px] leading-relaxed text-mute">
        <span className="font-bold text-ink">Platform income only. </span>
        These are MyFitDesk&apos;s own charges to gym owners through MyFitDesk&apos;s Razorpay account.
        A gym&apos;s takings from its members live in its own tenant reports and never appear here.
      </div>

      <div className="border-[1.5px] border-ink bg-paper">
        <div className="flex items-baseline gap-2.5 border-b-[1.5px] border-ink px-4 py-3">
          <h2 className="font-display text-[16px] tracking-[-0.015em]">Invoices</h2>
          <span className="text-[11.5px] text-mute">Latest 6 of 214 this month</span>
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full border-collapse text-[12.5px]">
            <thead>
              <tr className="text-left">
                {["Invoice", "Gym", "Package", "Period", "Status", "Amount"].map((h, i) => (
                  <th
                    key={h}
                    scope="col"
                    className={`mfd-micro-label border-b border-line px-4 py-2.5 ${i === 5 ? "text-right" : ""}`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.no} className="mfd-table-row">
                  <td className="whitespace-nowrap border-b border-line px-4 py-2.5 font-mono text-[11.5px]">{inv.no}</td>
                  <td className="max-w-[220px] truncate border-b border-line px-3 py-2.5 font-bold">{inv.gym}</td>
                  <td className="whitespace-nowrap border-b border-line px-3 py-2.5">{inv.package}</td>
                  <td className="whitespace-nowrap border-b border-line px-3 py-2.5 text-mute">{inv.period}</td>
                  <td className="border-b border-line px-3 py-2.5">
                    <span className={PILL_CLASS} style={pillTone(inv.status)}>
                      {inv.status}
                    </span>
                  </td>
                  <td className="whitespace-nowrap border-b border-line px-4 py-2.5 text-right font-bold">{inv.amount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col md:hidden">
          {invoices.map((inv) => (
            <div key={inv.no} className="flex flex-col gap-2 border-b border-line px-3.5 py-3 last:border-b-0">
              <div className="flex items-start justify-between gap-2">
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-[13.5px] font-bold">{inv.gym}</span>
                  <span className="font-mono text-[10.5px] text-mute2">{inv.no}</span>
                </span>
                <span className={`${PILL_CLASS} flex-shrink-0`} style={pillTone(inv.status)}>
                  {inv.status}
                </span>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[12px] text-mute">
                  {inv.package} · {inv.period}
                </span>
                <span className="text-[15px] font-bold">{inv.amount}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
