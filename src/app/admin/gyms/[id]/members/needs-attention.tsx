import Link from "next/link";
import type { MemberSummary } from "@/features/gyms/members";
import { AlertIcon } from "@/core/ui/icons";

type AttentionItem = { label: string; href: string };

export function NeedsAttention({ summary, pathname, branchId }: { summary: MemberSummary; pathname: string; branchId?: string }) {
  const href = (state: string) => {
    const params = new URLSearchParams({ state });
    if (branchId) params.set("branchId", branchId);
    return `${pathname}?${params}`;
  };
  const items: AttentionItem[] = [];
  if (summary.failedWhatsAppToday) items.push({ label: `${summary.failedWhatsAppToday} WhatsApp ${summary.failedWhatsAppToday === 1 ? "message" : "messages"} failed today`, href: `${pathname.replace(/\/members$/, "/whatsapp")}?status=failed` });
  if (summary.expiredMemberships) items.push({ label: `${summary.expiredMemberships} ${summary.expiredMemberships === 1 ? "member has" : "members have"} an expired membership`, href: href("expired") });
  if (summary.noActivePlan) items.push({ label: `${summary.noActivePlan} ${summary.noActivePlan === 1 ? "member has" : "members have"} no active plan`, href: href("none") });
  if (summary.invalidPhone) items.push({ label: `${summary.invalidPhone} ${summary.invalidPhone === 1 ? "member has" : "members have"} a missing or invalid phone`, href: href("invalid_phone") });
  if (summary.pendingPaymentCount) items.push({ label: `${summary.pendingPaymentCount} ${summary.pendingPaymentCount === 1 ? "payment is" : "payments are"} pending`, href: href("payment_pending") });
  if (!items.length) return null;

  return (
    <section className="border-[1.5px] border-accent bg-accent/5" aria-labelledby="member-attention-title">
      <div className="flex items-center gap-2 border-b border-accent/30 px-3 py-2">
        <AlertIcon size={15} className="text-accent" aria-hidden />
        <h2 id="member-attention-title" className="text-[10.5px] font-bold uppercase tracking-[0.13em] text-accent">Needs attention</h2>
      </div>
      <div className="flex flex-wrap gap-x-1 gap-y-1 p-2">
        {items.map((item) => (
          <Link key={item.label} href={item.href} className="flex min-h-8 items-center px-2 text-[11.5px] font-bold text-ink underline decoration-accent/40 underline-offset-2 transition-colors hover:bg-accent/10 hover:text-accent">
            {item.label}
          </Link>
        ))}
      </div>
    </section>
  );
}
