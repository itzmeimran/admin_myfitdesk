import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/core/db/server-client";
import { getGymDetail } from "@/features/gyms/detail";
import { getGymAuditLog, listAdminOptions, AUDIT_ACTION_LABEL } from "@/features/gyms/audit";
import { SearchBox } from "@/components/SearchBox";
import { FilterSelect } from "@/components/FilterSelect";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { Pagination, parsePagination } from "@/components/Pagination";
import { EmptyState } from "@/components/EmptyState";
import { CalendarIcon, InboxIcon } from "@/core/ui/icons";

type RawSearchParams = Record<string, string | string[] | undefined>;
function first(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

/**
 * Activity tab — matches the design's "Admin actions on this gym" / "Gym's
 * own record changes" feed toggle (`?feed=gym`). The admin feed is real
 * (every row is an existing `admin_audit_log` write — subscription
 * changes, suspend/reactivate, profile edits), now rendered as the design's
 * feed cards instead of a table. The gym's own field-level change feed has
 * no admin-readable source: this schema's tenant `audit_log` tables are
 * "owner-read-only, no admin coverage today" (CLAUDE.md's own schema
 * audit), so that tab is an honest empty state, not fabricated diffs.
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

  const feed = first(sp.feed) === "gym" ? "gym" : "admin";
  const search = first(sp.q) ?? "";
  const action = first(sp.action);
  const actorId = first(sp.actorId);
  const dateFrom = first(sp.from);
  const dateTo = first(sp.to);
  const sortDir: "asc" | "desc" = first(sp.dir) === "asc" ? "asc" : "desc";
  const { page, pageSize, offset } = parsePagination(sp);

  const supabase = await createClient();
  const [gym, auditResult, admins] = await Promise.all([
    getGymDetail(supabase, id),
    feed === "admin"
      ? getGymAuditLog(supabase, id, {
          search,
          action,
          actorId,
          dateFrom: dateFrom ? new Date(dateFrom).toISOString() : undefined,
          dateTo: dateTo ? new Date(`${dateTo}T23:59:59`).toISOString() : undefined,
          sortDir,
          limit: pageSize,
          offset,
        })
      : Promise.resolve({ rows: [], total: 0 }),
    feed === "admin" ? listAdminOptions(supabase) : Promise.resolve([]),
  ]);
  if (!gym) notFound();
  const { rows, total } = auditResult;

  const hasFilters = !!search || !!action || !!actorId || !!dateFrom || !!dateTo;
  const feedParams = (f: "admin" | "gym") => {
    const params = new URLSearchParams();
    if (f === "gym") params.set("feed", "gym");
    return `${pathname}${params.toString() ? `?${params}` : ""}`;
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="flex" role="group" aria-label="Activity feed">
          <Link
            href={feedParams("admin")}
            aria-pressed={feed === "admin"}
            className={`flex min-h-[36px] items-center border-[1.5px] border-r-0 border-ink px-3 text-[11.5px] font-bold ${
              feed === "admin" ? "bg-ink text-hi" : "bg-paper text-mute"
            }`}
          >
            Admin actions on this gym
          </Link>
          <Link
            href={feedParams("gym")}
            aria-pressed={feed === "gym"}
            className={`flex min-h-[36px] items-center border-[1.5px] border-ink px-3 text-[11.5px] font-bold ${
              feed === "gym" ? "bg-ink text-hi" : "bg-paper text-mute"
            }`}
          >
            Gym&apos;s own record changes
          </Link>
        </div>
        <span className="ml-auto text-[11.5px] text-mute3">
          {feed === "admin" ? `${total.toLocaleString("en-IN")} actions · newest first` : "Field-level diffs"}
        </span>
      </div>

      {feed === "gym" ? (
        <div className="flex flex-col items-center gap-2 border-[1.5px] border-line bg-paper px-4 py-14 text-center">
          <InboxIcon size={24} className="text-mute3" aria-hidden />
          <p className="max-w-md text-[12.5px] leading-relaxed text-mute">
            Not available yet — this gym&apos;s own record-change history (members, plans, branches) has no admin
            read in this schema. Its tenant-plane audit tables are owner-read-only today.
          </p>
        </div>
      ) : (
        <>
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

          {rows.length === 0 ? (
            <div className="border-[1.5px] border-line bg-paper">
              <EmptyState message="No activity matches your filters." resetHref={hasFilters ? pathname : undefined} />
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {rows.map((r) => (
                <div key={r.id} className="flex flex-wrap items-start gap-3 border-[1.5px] border-line bg-paper p-3.5">
                  <span
                    aria-hidden="true"
                    className="flex h-8 w-8 flex-shrink-0 items-center justify-center border-[1.5px] border-ink text-ink"
                  >
                    <CalendarIcon size={15} aria-hidden />
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-[13px] font-bold">{r.actionLabel}</span>
                    {r.detail ? (
                      <span className="font-mono text-[11px] text-mute3">{JSON.stringify(r.detail)}</span>
                    ) : null}
                    <span className="text-[11.5px] text-mute3">{r.adminEmail}</span>
                  </div>
                  <span className="ml-auto whitespace-nowrap font-mono text-[11px] text-mute">{r.at}</span>
                </div>
              ))}
              <Pagination pathname={pathname} searchParams={sp} page={page} pageSize={pageSize} total={total} itemLabel="events" />
            </div>
          )}
        </>
      )}
    </div>
  );
}
