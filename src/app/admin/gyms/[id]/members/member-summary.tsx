import { formatMinorWhole } from "@/core/money/format";
import type { MemberSummary } from "@/features/gyms/members";

export function MemberSummaryCards({ summary }: { summary: MemberSummary }) {
  const metrics = [
    ["Total members", summary.totalMembers.toLocaleString("en-IN")],
    ["Active", summary.activeMemberships.toLocaleString("en-IN")],
    ["Expiring soon", summary.expiringSoon.toLocaleString("en-IN")],
    ["Expired", summary.expiredMemberships.toLocaleString("en-IN")],
    ["New this month", summary.newMembersMonth.toLocaleString("en-IN")],
    ["Pending amount", formatMinorWhole(summary.pendingPaymentAmountMinor, summary.currency)],
  ];

  return (
    <section aria-label="Member summary" className="grid grid-cols-2 border-l-[1.5px] border-t-[1.5px] border-line bg-paper sm:grid-cols-3 xl:grid-cols-6">
      {metrics.map(([label, value]) => (
        <div key={label} className="flex min-w-0 flex-col gap-1 border-b-[1.5px] border-r-[1.5px] border-line px-3 py-2.5">
          <span className="mfd-micro-label truncate">{label}</span>
          <strong className="font-display text-[18px] leading-none tracking-[-0.02em] text-ink">{value}</strong>
        </div>
      ))}
    </section>
  );
}
