import Link from "next/link";
import { createClient } from "@/core/db/server-client";
import { getActiveAdminEnvironment } from "@/core/env/active-environment";
import { listOrgUsage } from "@/features/api-performance/queries";
import { formatCount, formatMs, formatRate } from "@/features/api-performance/format";
import { first, parseApiParams, withParams, type RawSearchParams } from "@/features/api-performance/params";
import { SearchBox } from "@/components/SearchBox";
import { SortLink } from "@/components/SortLink";
import { Pagination, parsePagination } from "@/components/Pagination";
import { EmptyState } from "@/components/EmptyState";
import { LatencyPill } from "../ui";

const SORTS = new Set(["requests", "avg", "p95", "max", "errors", "error_rate", "name"]);
const pathname = "/admin/api-performance/organizations";

export default async function ApiOrganizationsPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const sp = await searchParams;
  const { range, env } = parseApiParams(sp, await getActiveAdminEnvironment());
  const rawSort = first(sp.sort);
  const sort = rawSort && SORTS.has(rawSort) ? rawSort : "requests";
  const dir: "asc" | "desc" = first(sp.dir) === "asc" ? "asc" : "desc";
  const { page, pageSize, offset } = parsePagination(sp);

  const supabase = await createClient();
  const { rows, total } = await listOrgUsage(supabase, { range, env, search: first(sp.q), sort, dir, limit: pageSize, offset });

  const th = (key: string, label: string, align: "left" | "right" = "right") => (
    <SortLink pathname={pathname} searchParams={sp} sortKey={key} currentSort={sort} currentDir={dir} align={align}>
      {label}
    </SortLink>
  );

  return (
    <div className="flex flex-col gap-3.5">
      <SearchBox placeholder="Search gym" className="w-full sm:w-[260px]" />
      <div className="overflow-x-auto border-[1.5px] border-ink bg-paper">
        {rows.length === 0 ? (
          <EmptyState message="No API traffic from any gym in this window." resetHref={withParams(pathname, sp, {})} />
        ) : (
          <table className="w-full min-w-[820px] border-collapse text-[12px]">
            <thead>
              <tr className="text-left">
                {th("name", "Organization", "left")}
                {th("requests", "Requests")}
                {th("avg", "Avg response")}
                {th("p95", "P95")}
                {th("max", "Max")}
                {th("errors", "Errors")}
                {th("error_rate", "Error rate")}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.organizationId ?? "none"} className="mfd-table-row">
                  <td className="border-b border-line px-3 py-2.5">
                    {r.organizationId ? (
                      <Link href={`/admin/gyms/${r.organizationId}`} className="font-bold hover:text-accent">{r.organizationName ?? "Gym"}</Link>
                    ) : (
                      <span className="text-mute" title="Cron jobs, gateway webhooks and other requests with no signed-in gym">Unattributed</span>
                    )}
                  </td>
                  <td className="border-b border-line px-3 py-2.5 text-right tabular-nums">{formatCount(r.n)}</td>
                  <td className="border-b border-line px-3 py-2.5 text-right">{r.avgMs !== null ? <LatencyPill ms={r.avgMs} /> : "—"}</td>
                  <td className="border-b border-line px-3 py-2.5 text-right">{r.p95Ms !== null ? <LatencyPill ms={r.p95Ms} /> : "—"}</td>
                  <td className="border-b border-line px-3 py-2.5 text-right tabular-nums text-mute">{formatMs(r.maxMs)}</td>
                  <td className={`border-b border-line px-3 py-2.5 text-right tabular-nums ${r.errors > 0 ? "font-bold text-accent" : "text-mute"}`}>{formatCount(r.errors)}</td>
                  <td className={`border-b border-line px-3 py-2.5 text-right tabular-nums ${(r.errorRate ?? 0) >= 5 ? "font-bold text-accent" : "text-mute"}`}>{formatRate(r.errorRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Pagination pathname={pathname} searchParams={sp} page={page} pageSize={pageSize} total={total} itemLabel="organizations" />
      </div>
      <p className="text-[11px] text-mute">
        A gym is attributed when the request came from one of its signed-in users, or its own webhook URL. High volume is not a fault by itself: compare against the gym&apos;s size.
      </p>
    </div>
  );
}
