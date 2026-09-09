import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/core/db/server-client";
import { getGymDetail } from "@/features/gyms/detail";
import { getGymBranches } from "@/features/gyms/branches";
import { SearchBox } from "@/components/SearchBox";
import { FilterSelect } from "@/components/FilterSelect";
import { SortLink } from "@/components/SortLink";
import { Pagination, parsePagination } from "@/components/Pagination";
import { EmptyState } from "@/components/EmptyState";
import { BranchRowDetail } from "./branch-row";

const SORT_ALLOWLIST = new Set(["name", "status", "member_count", "staff_count", "created_at"]);

type RawSearchParams = Record<string, string | string[] | undefined>;
function first(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

/** Branches tab (task brief §5) — real server-side search/filter/sort/
 * pagination over `admin_gym_branches()`. */
export default async function GymBranchesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const pathname = `/admin/gyms/${id}/branches`;

  const search = first(sp.q) ?? "";
  const status = first(sp.status);
  const sortRaw = first(sp.sort) ?? "created_at";
  const sortCol = SORT_ALLOWLIST.has(sortRaw) ? sortRaw : "created_at";
  const sortDir: "asc" | "desc" = first(sp.dir) === "asc" ? "asc" : "desc";
  const { page, pageSize, offset } = parsePagination(sp);

  const supabase = await createClient();
  const [gym, { rows, total }] = await Promise.all([
    getGymDetail(supabase, id),
    getGymBranches(supabase, id, { search, status, sortCol, sortDir, limit: pageSize, offset }),
  ]);
  if (!gym) notFound();

  const hasFilters = !!search || !!status;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <SearchBox param="q" placeholder="Search branch name" />
        <FilterSelect
          param="status"
          placeholder="All statuses"
          options={[
            { value: "active", label: "Active" },
            { value: "archived", label: "Archived" },
          ]}
        />
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
              <SortLink pathname={pathname} searchParams={sp} sortKey="name" currentSort={sortCol} currentDir={sortDir}>
                Branch
              </SortLink>
              <SortLink pathname={pathname} searchParams={sp} sortKey="status" currentSort={sortCol} currentDir={sortDir}>
                Status
              </SortLink>
              <SortLink pathname={pathname} searchParams={sp} sortKey="member_count" currentSort={sortCol} currentDir={sortDir} align="right">
                Members
              </SortLink>
              <SortLink pathname={pathname} searchParams={sp} sortKey="staff_count" currentSort={sortCol} currentDir={sortDir} align="right">
                Staff
              </SortLink>
              <SortLink pathname={pathname} searchParams={sp} sortKey="created_at" currentSort={sortCol} currentDir={sortDir} align="right">
                Created
              </SortLink>
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.id} className="mfd-table-row">
                <td className="max-w-[220px] border-b border-line px-4 py-2.5">
                  <BranchRowDetail branch={b} trigger={b.name} />
                </td>
                <td className="whitespace-nowrap border-b border-line px-3 py-2.5 capitalize text-mute">{b.status}</td>
                <td className="whitespace-nowrap border-b border-line px-3 py-2.5 text-right font-bold">{b.memberCount}</td>
                <td className="whitespace-nowrap border-b border-line px-3 py-2.5 text-right font-bold">{b.staffCount}</td>
                <td className="whitespace-nowrap border-b border-line px-4 py-2.5 text-right text-mute">{b.createdAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? (
          <EmptyState message="No branches match your filters." resetHref={hasFilters ? pathname : undefined} />
        ) : (
          <Pagination pathname={pathname} searchParams={sp} page={page} pageSize={pageSize} total={total} itemLabel="branches" />
        )}
      </div>
    </div>
  );
}
