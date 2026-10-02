import { IST_TIME_ZONE } from "@/core/dates/ist";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/core/db/server-client";
import { getGymDetail } from "@/features/gyms/detail";
import { getGymWhatsAppHistory } from "@/features/gyms/overview";
import { FilterSelect } from "@/components/FilterSelect";
import { Pagination, parsePagination } from "@/components/Pagination";
import { EmptyState } from "@/components/EmptyState";
import { PILL_CLASS, pillTone } from "@/core/ui/status-style";
import { BackIcon } from "@/core/ui/icons";

type RawSearchParams = Record<string, string | string[] | undefined>;
const STATUS = new Set(["queued", "processing", "sent", "delivered", "read", "failed", "skipped"]);

export default async function GymWhatsAppHistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const rawStatus = Array.isArray(sp.status) ? sp.status[0] : sp.status;
  const status = rawStatus && STATUS.has(rawStatus) ? rawStatus : undefined;
  const { page, pageSize, offset } = parsePagination(sp);
  const pathname = `/admin/gyms/${id}/whatsapp`;
  const supabase = await createClient();
  const [gym, history] = await Promise.all([
    getGymDetail(supabase, id),
    getGymWhatsAppHistory(supabase, id, { status, limit: pageSize, offset }),
  ]);
  if (!gym) notFound();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Link href={`/admin/gyms/${id}`} className="flex items-center gap-1.5 text-[11px] font-bold text-mute hover:text-ink"><BackIcon size={12} aria-hidden />Overview</Link>
          <h2 className="font-display text-[20px] tracking-[-0.02em]">WhatsApp message history</h2>
          <p className="text-[11.5px] text-mute">Outbound delivery history and provider diagnostics. No tokens or credentials are exposed.</p>
        </div>
        <FilterSelect param="status" placeholder="All statuses" options={[{ value: "delivered", label: "Delivered" }, { value: "read", label: "Read" }, { value: "failed", label: "Failed" }, { value: "queued", label: "Queued" }, { value: "processing", label: "Processing" }, { value: "sent", label: "Sent" }, { value: "skipped", label: "Skipped" }]} />
      </div>

      <div className="overflow-x-auto border-[1.5px] border-ink bg-paper">
        <table className="w-full min-w-[920px] border-collapse text-[12px]">
          <thead><tr className="text-left">{["Recipient", "Template", "Category", "Sent", "Status", "Diagnostics"].map((heading) => <th key={heading} scope="col" className="mfd-micro-label border-b border-line px-3 py-2.5">{heading}</th>)}</tr></thead>
          <tbody>
            {history.rows.map((message) => (
              <tr key={message.id} className="mfd-table-row align-top">
                <td className="border-b border-line px-3 py-3 font-bold">{message.recipient}<span className="block font-normal text-mute3">{message.phone}</span></td>
                <td className="border-b border-line px-3 py-3">{message.template}</td>
                <td className="border-b border-line px-3 py-3 capitalize text-mute">{message.category}</td>
                <td className="whitespace-nowrap border-b border-line px-3 py-3 text-mute">{formatDateTime(message.sentAt ?? message.createdAt, IST_TIME_ZONE)}</td>
                <td className="border-b border-line px-3 py-3"><Status status={message.status} /></td>
                <td className="max-w-[300px] border-b border-line px-3 py-3">
                  <details><summary className="cursor-pointer font-bold text-accent">View details</summary><dl className="mt-2 flex flex-col gap-1 text-[10.5px]"><Detail label="Meta ID" value={message.metaMessageId ?? "—"} /><Detail label="Sender" value={senderMode(message.senderMode)} /><Detail label="Error code" value={message.errorCode ?? "—"} /><Detail label="Error" value={message.errorMessage ?? "—"} /><Detail label="Delivered" value={formatDateTime(message.deliveredAt, IST_TIME_ZONE)} /><Detail label="Read" value={formatDateTime(message.readAt, IST_TIME_ZONE)} /><Detail label="Credits" value={message.creditsUsed.toLocaleString("en-IN")} /></dl></details>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {history.rows.length ? <Pagination pathname={pathname} searchParams={sp} page={page} pageSize={pageSize} total={history.total} itemLabel="messages" /> : <EmptyState message={status ? `No ${status} WhatsApp messages were found.` : "No outbound WhatsApp messages have been recorded."} resetHref={status ? pathname : undefined} />}
      </div>
    </div>
  );
}

function Status({ status }: { status: string }) {
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  const tone = status === "failed" ? "Failed" : status === "queued" || status === "processing" ? "Queued" : "Active";
  return <span className={PILL_CLASS} style={pillTone(tone)}>{label}</span>;
}

function Detail({ label, value }: { label: string; value: string }) { return <div className="grid grid-cols-[72px_1fr] gap-2"><dt className="text-mute3">{label}</dt><dd className="break-words text-ink2">{value}</dd></div>; }
function senderMode(mode: string | null) { return mode === "own_waba" ? "Gym's own number" : mode === "managed" ? "MyFitDesk managed" : "Not recorded"; }
function formatDateTime(value: string | null, timezone: string) { if (!value) return "Not recorded"; return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: timezone }).format(new Date(value)); }
