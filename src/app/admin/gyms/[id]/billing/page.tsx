import { notFound } from "next/navigation";
import { createClient } from "@/core/db/server-client";
import { getGymDetail } from "@/features/gyms/detail";
import { getGymBillingHistory } from "@/features/gyms/billing";
import { listAssignablePackages } from "@/features/gyms/queries";
import { FilterSelect } from "@/components/FilterSelect";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { SortLink } from "@/components/SortLink";
import { Pagination, parsePagination } from "@/components/Pagination";
import { EmptyState } from "@/components/EmptyState";
import { pillTone, PILL_CLASS } from "@/core/ui/status-style";
import { formatMinorWhole } from "@/core/money/format";
import { formatShortDate } from "@/core/dates/format";
import { capitalizeBillingPeriod } from "@/core/text/billing-period";
import { PAYMENT_METHODS } from "@/features/gyms/payment-method";
import { BillingActions } from "./billing-actions";
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
  const method = first(sp.method);
  const dateFrom = first(sp.from);
  const dateTo = first(sp.to);
  const sortRaw = first(sp.sort) ?? "created_at";
  const sortCol = SORT_ALLOWLIST.has(sortRaw) ? sortRaw : "created_at";
  const sortDir: "asc" | "desc" = first(sp.dir) === "asc" ? "asc" : "desc";
  const { page, pageSize, offset } = parsePagination(sp);

  const supabase = await createClient();
  const [gym, { rows, total }, packages] = await Promise.all([
    getGymDetail(supabase, id),
    getGymBillingHistory(supabase, id, {
      status,
      provider,
      method,
      dateFrom: dateFrom ? new Date(dateFrom).toISOString() : undefined,
      dateTo: dateTo ? new Date(`${dateTo}T23:59:59`).toISOString() : undefined,
      sortCol,
      sortDir,
      limit: pageSize,
      offset,
    }),
    listAssignablePackages(supabase),
  ]);
  if (!gym) notFound();

  const hasFilters = !!status || !!provider || !!method || !!dateFrom || !!dateTo;
  const sub = gym.subscription;
  const now = new Date();
  const avgMinor = total > 0 ? Math.round(gym.lifetimePaidMinor / total) : 0;

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-4 border-2 border-ink bg-paper p-4 md:flex-row">
        <div className="flex flex-1 flex-col gap-2.5">
          <h2 className="mfd-micro-label">Current subscription</h2>
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="font-display text-[26px] tracking-[-0.03em]">{sub?.packageName ?? "No package"}</span>
            {sub?.packageCode ? <span className="font-mono text-[11.5px] text-mute3">{sub.packageCode}</span> : null}
            <span className={PILL_CLASS} style={pillTone(gym.status)}>
              {gym.status}
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-display text-[21px] tracking-[-0.025em]">
              {sub?.priceMinor != null ? formatMinorWhole(sub.priceMinor, sub.currency ?? "INR") : "—"}
            </span>
            <span className="text-[12.5px] text-mute">per {capitalizeBillingPeriod(sub?.billingPeriod).toLowerCase()} cycle</span>
          </div>
          <dl className="flex flex-col">
            <Detail k="Billing cycle" v={capitalizeBillingPeriod(sub?.billingPeriod)} />
            <Detail
              k="Current period"
              v={
                sub?.currentPeriodStart && sub?.currentPeriodEnd
                  ? `${formatShortDate(new Date(sub.currentPeriodStart), now)} – ${formatShortDate(new Date(sub.currentPeriodEnd), now)}`
                  : "—"
              }
            />
            <Detail k="Grace days" v={`${sub?.graceDays ?? gym.gracePeriodDays} days after period end`} />
            <Detail k="Auto-renew" v={sub?.autoRenew ? "On" : "Off — renewal is manual"} />
          </dl>
        </div>
        <div className="flex flex-col gap-2 bg-ink p-4 text-paper md:w-[240px] md:flex-shrink-0">
          <span className="text-[10px] font-bold uppercase tracking-[0.13em] text-mute3">Lifetime paid to MyFitDesk</span>
          <span className="font-display text-[32px] tracking-[-0.035em] text-hi">
            {formatMinorWhole(gym.lifetimePaidMinor, gym.defaultCurrency)}
          </span>
          <span className="text-[12px] leading-relaxed text-mute3">
            {total > 0 ? `${total.toLocaleString("en-IN")} invoices on file` : "No invoices yet"}
          </span>
          {total > 0 ? (
            <span className="mt-auto border-t border-ink2 pt-2.5 text-[11.5px] text-mute3">
              Average {formatMinorWhole(avgMinor, gym.defaultCurrency)} / invoice
            </span>
          ) : null}
        </div>
      </section>

      {sub?.pending ? (
        <section className="flex flex-col gap-1.5 border-[1.5px] border-hi bg-hi/12 px-4 py-3.5">
          <span className="text-[10px] font-bold uppercase tracking-[0.13em] text-ink2">Upcoming package</span>
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="font-display text-lg">{sub.pending.packageName ?? "Package"}</span>
            {sub.pending.priceMinor != null ? (
              <span className="text-[13px] font-bold text-ink">
                {formatMinorWhole(sub.pending.priceMinor, sub.pending.currency ?? "INR")} per{" "}
                {capitalizeBillingPeriod(sub.pending.billingPeriod).toLowerCase()} cycle
              </span>
            ) : null}
          </div>
          <p className="text-[12px] text-ink2">
            Starts {formatShortDate(new Date(sub.pending.periodStart), now)}, the day the current package ends —
            today&apos;s access, price and caps are unaffected until then.
          </p>
        </section>
      ) : null}

      <BillingActions gym={gym} packages={packages} />

      <div className="flex flex-wrap items-center gap-2.5">
        <FilterSelect
          param="status"
          placeholder="All statuses"
          options={[
            { value: "succeeded", label: "Succeeded" },
            { value: "created", label: "Pending" },
            { value: "failed", label: "Failed" },
            { value: "refunded", label: "Refunded" },
            { value: "cancelled", label: "Cancelled" },
          ]}
        />
        <FilterSelect
          param="provider"
          placeholder="Any provider"
          options={[
            { value: "razorpay", label: "Razorpay" },
            { value: "manual", label: "Manual" },
          ]}
        />
        <FilterSelect
          param="method"
          placeholder="Any payment method"
          options={PAYMENT_METHODS.map((m) => ({ value: m.value, label: m.label }))}
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
              <th scope="col" className="mfd-micro-label border-b border-line px-3 py-2.5">Method</th>
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
                <td className="whitespace-nowrap border-b border-line px-3 py-2.5 text-mute">{r.method}</td>
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
    <div className="flex items-baseline justify-between gap-3 border-b border-line py-1.5 text-[12.5px]">
      <dt className="text-mute">{k}</dt>
      <dd className="text-right font-bold text-ink">{v}</dd>
    </div>
  );
}
