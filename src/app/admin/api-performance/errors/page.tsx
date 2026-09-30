import Link from "next/link";
import { createClient } from "@/core/db/server-client";
import { getActiveAdminEnvironment } from "@/core/env/active-environment";
import { listErrors, listOrgOptions } from "@/features/api-performance/queries";
import { formatCount, formatTime } from "@/features/api-performance/format";
import { first, parseApiParams, uuidOrUndefined, withParams, type RawSearchParams } from "@/features/api-performance/params";
import { SearchBox } from "@/components/SearchBox";
import { FilterSelect } from "@/components/FilterSelect";
import { Pagination, parsePagination } from "@/components/Pagination";
import { EmptyState } from "@/components/EmptyState";
import { MethodTag, StatusPill } from "../ui";

const pathname = "/admin/api-performance/errors";

/**
 * Identical failures grouped (route + method + status + error class), most
 * frequent first. Groups are computed from raw requests, so this view covers
 * the 7-day raw retention even when the selected range is longer.
 */
export default async function ApiErrorsPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const sp = await searchParams;
  const { range, env } = parseApiParams(sp, await getActiveAdminEnvironment());
  const { page, pageSize, offset } = parsePagination(sp);
  const minStatus = first(sp.min) === "500" ? 500 : 400;

  const supabase = await createClient();
  const [{ rows, total }, orgs] = await Promise.all([
    listErrors(supabase, { range, env, org: uuidOrUndefined(first(sp.org)), search: first(sp.q), minStatus, limit: pageSize, offset }),
    listOrgOptions(supabase),
  ]);

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center gap-2.5">
        <SearchBox placeholder="Search endpoint" className="w-full sm:w-[260px]" />
        <FilterSelect
          param="min"
          placeholder="All errors (4xx + 5xx)"
          options={[{ value: "500", label: "Server errors only (5xx)" }]}
        />
        <FilterSelect param="org" placeholder="All organizations" options={orgs} className="max-w-[220px]" />
      </div>

      <div className="overflow-x-auto border-[1.5px] border-ink bg-paper">
        {rows.length === 0 ? (
          <EmptyState message="No errors in this window. 4xx are client errors (bad input, unauthenticated); 5xx are the platform failing." resetHref={withParams(pathname, sp, {})} />
        ) : (
          <table className="w-full min-w-[900px] border-collapse text-[12px]">
            <thead>
              <tr className="text-left">
                {["Endpoint", "Method", "Status", "Error type", "Occurrences", "Last occurrence", "Organization"].map((h) => (
                  <th key={h} scope="col" className="mfd-micro-label border-b border-line px-3 py-2.5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const explorer = withParams("/admin/api-performance/requests", sp, {
                  q: r.route,
                  method: r.method,
                  status: String(r.status),
                  ...(r.organizationId ? { org: r.organizationId } : {}),
                });
                return (
                  <tr key={`${r.method} ${r.route} ${r.status} ${r.errorType}`} className="mfd-table-row align-top">
                    <td className="border-b border-line px-3 py-2.5 font-mono text-[11.5px]">
                      <Link href={explorer} className="font-bold hover:text-accent">{r.route}</Link>
                      {r.sampleMessage ? <span className="mt-0.5 block max-w-[340px] truncate font-sans text-[11px] font-normal text-mute" title={r.sampleMessage}>{r.sampleMessage}</span> : null}
                    </td>
                    <td className="border-b border-line px-3 py-2.5"><MethodTag method={r.method} /></td>
                    <td className="border-b border-line px-3 py-2.5"><StatusPill status={r.status} /></td>
                    <td className="border-b border-line px-3 py-2.5 text-mute">{r.errorType || "—"}</td>
                    <td className="border-b border-line px-3 py-2.5 font-bold tabular-nums">{formatCount(r.occurrences)}</td>
                    <td className="whitespace-nowrap border-b border-line px-3 py-2.5 text-mute">{formatTime(r.lastAt, true)}</td>
                    <td className="border-b border-line px-3 py-2.5">
                      {r.organizationId ? (
                        <Link href={`/admin/gyms/${r.organizationId}`} className="hover:text-accent">{r.organizationName ?? "Gym"}</Link>
                      ) : r.orgCount > 1 ? (
                        <span className="text-mute">{r.orgCount} gyms</span>
                      ) : (
                        <span className="text-mute3">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <Pagination pathname={pathname} searchParams={sp} page={page} pageSize={pageSize} total={total} itemLabel="error groups" />
      </div>
      <p className="text-[11px] text-mute">Click an endpoint to see the affected requests in the Request Explorer. Range: last {range}.</p>
    </div>
  );
}
