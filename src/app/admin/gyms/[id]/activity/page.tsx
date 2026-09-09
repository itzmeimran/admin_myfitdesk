import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/core/db/server-client";
import { getGymDetail } from "@/features/gyms/detail";
import { getGymAuditLog, listAdminOptions, AUDIT_ACTION_LABEL } from "@/features/gyms/audit";
import { SearchBox } from "@/components/SearchBox";
import { FilterSelect } from "@/components/FilterSelect";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { SortLink } from "@/components/SortLink";
import { Pagination, parsePagination } from "@/components/Pagination";
import { EmptyState } from "@/components/EmptyState";

type RawSearchParams = Record<string, string | string[] | undefined>;
function first(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

/**
 * Activity/Audit tab (task brief §9). Real server-side search/filter
 * (action type, actor, date range)/sort (timestamp)/pagination over
 * `admin_gym_audit_log()`. Every row here is a real admin_audit_log write
 * this app already makes elsewhere (subscription changes, suspend/
 * reactivate, profile edits) — this tab surfaces it, it doesn't invent it.
 */
export default async function GymActivityPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const pathname = `/admin/gyms/${id}/activity`;

  const search = first(sp.q) ?? "";
  const action = first(sp.action);
  const actorId = first(sp.actorId);
  const dateFrom = first(sp.from);
  const dateTo = first(sp.to);
  const sortDir: "asc" | "desc" = first(sp.dir) === "asc" ? "asc" : "desc";
  const { page, pageSize, offset } = parsePagination(sp);

  const supabase = await createClient();
  const [gym, { rows, total }, admins] = await Promise.all([
    getGymDetail(supabase, id),
    getGymAuditLog(supabase, id, {
      search,
      action,
      actorId,
      dateFrom: dateFrom ? new Date(dateFrom).toISOString() : undefined,
      dateTo: dateTo ? new Date(`${dateTo}T23:59:59`).toISOString() : undefined,
      sortDir,
      limit: pageSize,
      offset,
    }),
    listAdminOptions(supabase),
  ]);
  if (!gym) notFound();

  const hasFilters = !!search || !!action || !!actorId || !!dateFrom || !!dateTo;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <SearchBox param="q" placeholder="Search action" />
        <FilterSelect
          param="action"
          placeholder="All action types"
          options={Object.entries(AUDIT_ACTION_LABEL).map(([value, label]) => ({ value, label }))}
        />
        <FilterSelect
          param="actorId"
          placeholder="Any admin"
          options={admins.map((a) => ({ value: a.id, label: a.email }))}
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
              <th scope="col" className="mfd-micro-label border-b border-line px-4 py-2.5">Action</th>
              <th scope="col" className="mfd-micro-label border-b border-line px-3 py-2.5">Admin</th>
              <th scope="col" className="mfd-micro-label border-b border-line px-3 py-2.5">Detail</th>
              <SortLink pathname={pathname} searchParams={sp} sortKey="at" currentSort="at" currentDir={sortDir} align="right">
                When
              </SortLink>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="mfd-table-row">
                <td className="whitespace-nowrap border-b border-line px-4 py-2.5 font-bold">{r.actionLabel}</td>
                <td className="whitespace-nowrap border-b border-line px-3 py-2.5 text-mute">{r.adminEmail}</td>
                <td className="max-w-[280px] truncate border-b border-line px-3 py-2.5 font-mono text-[11px] text-mute3">
                  {r.detail ? JSON.stringify(r.detail) : "—"}
                </td>
                <td className="whitespace-nowrap border-b border-line px-4 py-2.5 text-right text-mute">{r.at}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? (
          <EmptyState message="No activity matches your filters." resetHref={hasFilters ? pathname : undefined} />
        ) : (
          <Pagination pathname={pathname} searchParams={sp} page={page} pageSize={pageSize} total={total} itemLabel="events" />
        )}
      </div>
    </div>
  );
}
