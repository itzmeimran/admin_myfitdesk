import { createClient } from "@/core/db/server-client";
import { getActiveAdminEnvironment } from "@/core/env/active-environment";
import { getApiOverview, listOrgOptions, listRequests } from "@/features/api-performance/queries";
import { METHODS, first, intOrUndefined, parseApiParams, uuidOrUndefined, withParams, type RawSearchParams } from "@/features/api-performance/params";
import { SearchBox } from "@/components/SearchBox";
import { FilterSelect } from "@/components/FilterSelect";
import { Pagination, parsePagination } from "@/components/Pagination";
import { EmptyState } from "@/components/EmptyState";
import { RequestsTable } from "../requests-table";

const STATUS_OPTIONS = ["200", "201", "204", "301", "302", "400", "401", "403", "404", "409", "429", "500", "502", "503"];
const MIN_MS_OPTIONS = [
  { value: "300", label: "≥ 300 ms" },
  { value: "800", label: "≥ 800 ms (slow)" },
  { value: "2000", label: "≥ 2 s (very slow)" },
  { value: "5000", label: "≥ 5 s" },
];
const pathname = "/admin/api-performance/requests";

/** Individual requests for debugging. Raw requests are kept 7 days, so a
 * 30-day range shows the most recent 7. */
export default async function ApiRequestExplorerPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const sp = await searchParams;
  const { range, env } = parseApiParams(sp, await getActiveAdminEnvironment());
  const { page, pageSize, offset } = parsePagination(sp);
  const method = METHODS.find((m) => m === first(sp.method));

  const supabase = await createClient();
  const [{ rows, total }, orgs, ov] = await Promise.all([
    listRequests(supabase, {
      range,
      env,
      request: first(sp.req),
      route: first(sp.q),
      org: uuidOrUndefined(first(sp.org)),
      status: intOrUndefined(first(sp.status)),
      method,
      minMs: intOrUndefined(first(sp.minMs)),
      sort: first(sp.sort) === "duration" ? "duration" : "time",
      limit: pageSize,
      offset,
    }),
    listOrgOptions(supabase),
    // Only for the configured thresholds (colours); a 15 m window keeps it cheap.
    getApiOverview(supabase, { range: "15m", env }),
  ]);

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center gap-2.5">
        <SearchBox param="req" placeholder="Request ID, e.g. req_8f1c2d3e" className="w-full sm:w-[240px]" />
        <SearchBox param="q" placeholder="Endpoint" className="w-full sm:w-[200px]" />
        <FilterSelect param="method" placeholder="All methods" options={METHODS.map((m) => ({ value: m, label: m }))} />
        <FilterSelect param="status" placeholder="All status codes" options={STATUS_OPTIONS.map((s) => ({ value: s, label: s }))} />
        <FilterSelect param="minMs" placeholder="Any duration" options={MIN_MS_OPTIONS} />
        <FilterSelect param="org" placeholder="All organizations" options={orgs} className="max-w-[220px]" />
        <FilterSelect param="sort" placeholder="Newest first" options={[{ value: "duration", label: "Slowest first" }]} />
      </div>

      <div className="border-[1.5px] border-ink bg-paper">
        {rows.length === 0 ? (
          <EmptyState message="No requests match these filters in this window." resetHref={withParams(pathname, sp, {})} />
        ) : (
          <RequestsTable rows={rows} thresholds={ov.thresholds} />
        )}
        <Pagination pathname={pathname} searchParams={sp} page={page} pageSize={pageSize} total={total} itemLabel="requests" />
      </div>
    </div>
  );
}
