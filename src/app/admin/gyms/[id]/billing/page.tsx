import { notFound } from "next/navigation";
import { createClient } from "@/core/db/server-client";
import { getGymDetail } from "@/features/gyms/detail";
import { getGymBillingHistory } from "@/features/gyms/billing";
import { FilterSelect } from "@/components/FilterSelect";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { SortLink } from "@/components/SortLink";
import { Pagination, parsePagination } from "@/components/Pagination";
import { EmptyState } from "@/components/EmptyState";
import { pillTone, PILL_CLASS } from "@/core/ui/status-style";
import { formatMinorWhole } from "@/core/money/format";
import Link from "next/link";

const SORT_ALLOWLIST = new Set(["created_at", "amount_minor", "status", "paid_at"]);

type RawSearchParams = Record<string, string | string[] | undefined>;
function first(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

/**
 * Subscription & Billing tab (task brief §4). The subscription summary
 * reuses the same fields Overview shows (deliberately — this tab's job is
 * the invoice history; repeating the plan/price/renewal header briefly
 * orients the admin without duplicating Overview's full account section).
 * Billing history itself is a real server-paginated, filterable, sortable
 * table over `admin_gym_billing_history()`.
 */
export default async function GymBillingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const pathname = `/admin/gyms/${id}/billing`;

  const status = first(sp.status);
  const provider = first(sp.provider);
  const dateFrom = first(sp.from);
  const dateTo = first(sp.to);
  const sortRaw = first(sp.sort) ?? "created_at";
  const sortCol = SORT_ALLOWLIST.has(sortRaw) ? sortRaw : "created_at";
  const sortDir: "asc" | "desc" = first(sp.dir) === "asc" ? "asc" : "desc";
  const { page, pageSize, offset } = parsePagination(sp);

  const supabase = await createClient();
  const [gym, { rows, total }] = await Promise.all([
    getGymDetail(supabase, id),
    getGymBillingHistory(supabase, id, {
      status,
      provider,
      dateFrom: dateFrom ? new Date(dateFrom).toISOString() : undefined,
      dateTo: dateTo ? new Date(`${dateTo}T23:59:59`).toISOString() : undefined,
      sortCol,
      sortDir,
      limit: pageSize,
      offset,
    }),
  ]);
  if (!gym) notFound();

  const hasFilters = !!status || !!provider || !!dateFrom || !!dateTo;
  const sub = gym.subscription;

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-wrap gap-x-6 gap-y-2 border-[1.5px] border-line bg-paper p-4 text-[12.5px]">
        <Detail k="Plan" v={sub?.packageName ?? "No package"} />
        <Detail k="Price" v={sub?.priceMinor != null ? formatMinorWhole(sub.priceMinor, sub.currency ?? "INR") : "—"} />
        <Detail k="Billing cycle" v={sub?.billingPeriod === "yearly" ? "Yearly" : sub?.billingPeriod === "monthly" ? "Monthly" : "—"} />
        <Detail k="Status" v={gym.status} />
        <Detail k="Auto-renew" v={sub?.autoRenew ? "On" : "Off"} />
      </section>

      <div className="flex flex-wrap items-center gap-2.5">
        <FilterSelect
          param="status"
          placeholder="All statuses"
          options={[
            { value: "succeeded", label: "Succeeded" },
            { value: "created", label: "Pending" },
            { value: "failed", label: "Failed" },
            { value: "refunded", label: "Refunded" },
          ]}
        />
        <FilterSelect
          param="provider"
          placeholder="Any provider"
          options={[{ value: "razorpay", label: "Razorpay" }]}
        />
        <DateRangeFilter />
        {hasFilters ? (
          <Link href={pathname} className="text-[11.5px] font-bold text-accent underline underline-offset-2">
            Reset filters
          </Link>
        ) : null}
      </div>

      <div className="overflow-x-auto border-[1.5px] border-ink bg-paper">
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr className="text-left">
              <th scope="col" className="mfd-micro-label border-b border-line px-4 py-2.5">Invoice</th>
              <th scope="col" className="mfd-micro-label border-b border-line px-3 py-2.5">Period</th>
              <th scope="col" className="mfd-micro-label border-b border-line px-3 py-2.5">Package</th>
              <SortLink pathname={pathname} searchParams={sp} sortKey="status" currentSort={sortCol} currentDir={sortDir}>
                Status
              </SortLink>
              <th scope="col" className="mfd-micro-label border-b border-line px-3 py-2.5">Provider</th>
              <SortLink pathname={pathname} searchParams={sp} sortKey="paid_at" currentSort={sortCol} currentDir={sortDir} align="right">
                Paid
              </SortLink>
              <SortLink pathname={pathname} searchParams={sp} sortKey="amount_minor" currentSort={sortCol} currentDir={sortDir} align="right">
                Amount
              </SortLink>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="mfd-table-row">
                <td className="whitespace-nowrap border-b border-line px-4 py-2.5 font-mono text-[11.5px]">{r.invoiceNumber}</td>
                <td className="whitespace-nowrap border-b border-line px-3 py-2.5 text-mute">{r.period}</td>
                <td className="whitespace-nowrap border-b border-line px-3 py-2.5">{r.packageName}</td>
                <td className="border-b border-line px-3 py-2.5">
                  <span className={PILL_CLASS} style={pillTone(r.status)}>
                    {r.status}
                  </span>
                </td>
                <td className="whitespace-nowrap border-b border-line px-3 py-2.5 capitalize text-mute">{r.provider}</td>
                <td className="whitespace-nowrap border-b border-line px-3 py-2.5 text-right text-mute">{r.paidAt ?? "—"}</td>
                <td className="whitespace-nowrap border-b border-line px-4 py-2.5 text-right font-bold">{r.amount}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? (
          <EmptyState message="No invoices match your filters." resetHref={hasFilters ? pathname : undefined} />
        ) : (
          <Pagination pathname={pathname} searchParams={sp} page={page} pageSize={pageSize} total={total} itemLabel="invoices" />
        )}
      </div>
    </div>
  );
}

function Detail({ k, v }: { k: string; v: string }) {
  return (
    <span className="flex flex-col gap-0.5">
      <span className="mfd-micro-label">{k}</span>
      <span className="font-bold text-ink">{v}</span>
    </span>
  );
}
