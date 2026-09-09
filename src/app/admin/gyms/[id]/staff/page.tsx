import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/core/db/server-client";
import { getGymDetail } from "@/features/gyms/detail";
import { getGymStaff } from "@/features/gyms/staff";
import { listBranchOptions } from "@/features/gyms/branches";
import { SearchBox } from "@/components/SearchBox";
import { FilterSelect } from "@/components/FilterSelect";
import { SortLink } from "@/components/SortLink";
import { Pagination, parsePagination } from "@/components/Pagination";
import { EmptyState } from "@/components/EmptyState";
import { pillTone, PILL_CLASS } from "@/core/ui/status-style";

const SORT_ALLOWLIST = new Set(["name", "role", "status", "branch_name", "created_at"]);
const ROLE_LABEL: Record<string, string> = { owner: "Owner", staff: "Staff", trainer: "Trainer" };

type RawSearchParams = Record<string, string | string[] | undefined>;
function first(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

/**
 * Users & Staff tab (task brief §6). Real server-side search/filter/sort/
 * pagination over `admin_gym_staff()`. "Last login" is deliberately absent
 * from the columns — this schema has no login-tracking column anywhere, so
 * showing one here would mean fabricating it; "Created" (when the account
 * was provisioned) is the one lifecycle date this data actually has.
 */
export default async function GymStaffPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const pathname = `/admin/gyms/${id}/staff`;

  const search = first(sp.q) ?? "";
  const role = first(sp.role);
  const branchId = first(sp.branchId);
  const status = first(sp.status);
  const sortRaw = first(sp.sort) ?? "created_at";
  const sortCol = SORT_ALLOWLIST.has(sortRaw) ? sortRaw : "created_at";
  const sortDir: "asc" | "desc" = first(sp.dir) === "asc" ? "asc" : "desc";
  const { page, pageSize, offset } = parsePagination(sp);

  const supabase = await createClient();
  const [gym, { rows, total }, branchOptions] = await Promise.all([
    getGymDetail(supabase, id),
    getGymStaff(supabase, id, { search, role, branchId, status, sortCol, sortDir, limit: pageSize, offset }),
    listBranchOptions(supabase, id),
  ]);
  if (!gym) notFound();

  const hasFilters = !!search || !!role || !!branchId || !!status;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <SearchBox param="q" placeholder="Search name or email" />
        <FilterSelect
          param="role"
          placeholder="All roles"
          options={[
            { value: "owner", label: "Owner" },
            { value: "staff", label: "Staff" },
            { value: "trainer", label: "Trainer" },
          ]}
        />
        <FilterSelect
          param="branchId"
          placeholder="All branches"
          options={branchOptions.map((b) => ({ value: b.id, label: b.name }))}
        />
        <FilterSelect
          param="status"
          placeholder="All statuses"
          options={[
            { value: "active", label: "Active" },
            { value: "pending_removal", label: "Pending removal" },
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
                Name
              </SortLink>
              <th scope="col" className="mfd-micro-label border-b border-line px-3 py-2.5">Email</th>
              <SortLink pathname={pathname} searchParams={sp} sortKey="role" currentSort={sortCol} currentDir={sortDir}>
                Role
              </SortLink>
              <SortLink pathname={pathname} searchParams={sp} sortKey="branch_name" currentSort={sortCol} currentDir={sortDir}>
                Branch
              </SortLink>
              <SortLink pathname={pathname} searchParams={sp} sortKey="status" currentSort={sortCol} currentDir={sortDir}>
                Status
              </SortLink>
              <th scope="col" className="mfd-micro-label border-b border-line px-3 py-2.5 text-right">Last login</th>
              <SortLink pathname={pathname} searchParams={sp} sortKey="created_at" currentSort={sortCol} currentDir={sortDir} align="right">
                Created
              </SortLink>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id} className="mfd-table-row">
                <td className="max-w-[170px] border-b border-line px-4 py-2.5 font-bold">{s.name}</td>
                <td className="max-w-[190px] truncate border-b border-line px-3 py-2.5 text-mute">{s.email}</td>
                <td className="whitespace-nowrap border-b border-line px-3 py-2.5">{ROLE_LABEL[s.role] ?? s.role}</td>
                <td className="whitespace-nowrap border-b border-line px-3 py-2.5 text-mute">{s.branchName}</td>
                <td className="border-b border-line px-3 py-2.5">
                  <span className={PILL_CLASS} style={pillTone(s.status === "Active" ? "Active" : "Pending removal")}>
                    {s.status}
                  </span>
                </td>
                <td className="whitespace-nowrap border-b border-line px-3 py-2.5 text-right text-mute3">Not tracked</td>
                <td className="whitespace-nowrap border-b border-line px-4 py-2.5 text-right text-mute">{s.createdAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? (
          <EmptyState message="No staff match your filters." resetHref={hasFilters ? pathname : undefined} />
        ) : (
          <Pagination pathname={pathname} searchParams={sp} page={page} pageSize={pageSize} total={total} itemLabel="staff" />
        )}
      </div>
    </div>
  );
}
