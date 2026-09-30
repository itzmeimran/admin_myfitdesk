import Link from "next/link";
import { createClient } from "@/core/db/server-client";
import { getActiveAdminEnvironment } from "@/core/env/active-environment";
import { listEndpoints, listOrgOptions } from "@/features/api-performance/queries";
import { formatCount, formatMs, formatRate } from "@/features/api-performance/format";
import {
  METHODS,
  first,
  intOrUndefined,
  parseApiParams,
  uuidOrUndefined,
  withParams,
  type RawSearchParams,
} from "@/features/api-performance/params";
import { SearchBox } from "@/components/SearchBox";
import { FilterSelect } from "@/components/FilterSelect";
import { SortLink } from "@/components/SortLink";
import { Pagination, parsePagination } from "@/components/Pagination";
import { EmptyState } from "@/components/EmptyState";
import { LatencyPill, MethodTag } from "../ui";

const SORTS = new Set(["requests", "avg", "p50", "p95", "max", "errors", "error_rate", "route"]);
const STATUS_OPTIONS = ["200", "201", "204", "301", "302", "400", "401", "403", "404", "409", "429", "500", "502", "503"];
const pathname = "/admin/api-performance/endpoints";

export default async function ApiEndpointsPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const sp = await searchParams;
  const { range, env } = parseApiParams(sp, await getActiveAdminEnvironment());
  const rawSort = first(sp.sort);
  const sort = rawSort && SORTS.has(rawSort) ? rawSort : "requests";
  const dir: "asc" | "desc" = first(sp.dir) === "asc" ? "asc" : "desc";
  const { page, pageSize, offset } = parsePagination(sp);
  const method = METHODS.find((m) => m === first(sp.method));

  const supabase = await createClient();
  const [{ rows, total }, orgs] = await Promise.all([
    listEndpoints(supabase, {
      range,
      env,
      org: uuidOrUndefined(first(sp.org)),
      method,
      status: intOrUndefined(first(sp.status)),
      search: first(sp.q),
      sort,
      dir,
      limit: pageSize,
      offset,
    }),
    listOrgOptions(supabase),
  ]);

  const th = (key: string, label: string, align: "left" | "right" = "right") => (
    <SortLink pathname={pathname} searchParams={sp} sortKey={key} currentSort={sort} currentDir={dir} align={align}>
      {label}
    </SortLink>
  );

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center gap-2.5">
        <SearchBox placeholder="Search endpoint, e.g. /api/mobile" className="w-full sm:w-[280px]" />
        <FilterSelect param="method" placeholder="All methods" options={METHODS.map((m) => ({ value: m, label: m }))} />
        <FilterSelect param="status" placeholder="All status codes" options={STATUS_OPTIONS.map((s) => ({ value: s, label: s }))} />
        <FilterSelect param="org" placeholder="All organizations" options={orgs} className="max-w-[220px]" />
      </div>

      <div className="overflow-x-auto border-[1.5px] border-ink bg-paper">
        {rows.length === 0 ? (
          <EmptyState message="No endpoints match these filters in this window." resetHref={withParams(pathname, sp, {})} />
        ) : (
          <table className="w-full min-w-[900px] border-collapse text-[12px]">
            <thead>
              <tr className="text-left">
                {th("route", "Endpoint", "left")}
                <th scope="col" className="mfd-micro-label border-b border-line px-3 py-2.5">Method</th>
                {th("requests", "Requests")}
                {th("avg", "Avg")}
                {th("p50", "P50")}
                {th("p95", "P95")}
                {th("max", "Max")}
                {th("errors", "Errors")}
                {th("error_rate", "Error rate")}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.method} ${r.route}`} className="mfd-table-row">
                  <td className="border-b border-line px-3 py-2.5 font-mono text-[11.5px]">
                    <Link
                      href={withParams("/admin/api-performance/endpoint", sp, { route: r.route, method: r.method })}
                      className="font-bold hover:text-accent"
                    >
                      {r.route}
                    </Link>
                  </td>
                  <td className="border-b border-line px-3 py-2.5"><MethodTag method={r.method} /></td>
                  <td className="border-b border-line px-3 py-2.5 text-right tabular-nums">{formatCount(r.n)}</td>
                  <td className="border-b border-line px-3 py-2.5 text-right">{r.avgMs !== null ? <LatencyPill ms={r.avgMs} /> : "—"}</td>
                  <td className="border-b border-line px-3 py-2.5 text-right tabular-nums text-mute">{formatMs(r.p50Ms)}</td>
                  <td className="border-b border-line px-3 py-2.5 text-right">{r.p95Ms !== null ? <LatencyPill ms={r.p95Ms} /> : "—"}</td>
                  <td className="border-b border-line px-3 py-2.5 text-right tabular-nums text-mute">{formatMs(r.maxMs)}</td>
                  <td className={`border-b border-line px-3 py-2.5 text-right tabular-nums ${r.errors > 0 ? "font-bold text-accent" : "text-mute"}`}>{formatCount(r.errors)}</td>
                  <td className={`border-b border-line px-3 py-2.5 text-right tabular-nums ${(r.errorRate ?? 0) >= 5 ? "font-bold text-accent" : "text-mute"}`}>{formatRate(r.errorRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Pagination pathname={pathname} searchParams={sp} page={page} pageSize={pageSize} total={total} itemLabel="endpoints" />
      </div>
      <p className="text-[11px] text-mute">Errors are 5xx responses. With a status-code filter set, the counts are for that status only.</p>
    </div>
  );
}
