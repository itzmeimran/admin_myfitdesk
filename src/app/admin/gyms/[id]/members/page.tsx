import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/core/db/server-client";
import { getGymDetail } from "@/features/gyms/detail";
import { getGymMembers } from "@/features/gyms/members";
import { listBranchOptions } from "@/features/gyms/branches";
import { SearchBox } from "@/components/SearchBox";
import { FilterSelect } from "@/components/FilterSelect";
import { SortLink } from "@/components/SortLink";
import { Pagination, parsePagination } from "@/components/Pagination";
import { EmptyState } from "@/components/EmptyState";
import { pillTone, PILL_CLASS } from "@/core/ui/status-style";

const SORT_ALLOWLIST = new Set(["name", "status", "joined_on", "subscription_end_date", "created_at"]);

const EXPIRY_PILL: Record<string, string> = {
  active: "Active",
  expiring_soon: "Expiring soon",
  expired: "Expired",
  none: "No plan",
};

type RawSearchParams = Record<string, string | string[] | undefined>;
function first(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

/**
 * Members tab (task brief §7). Real server-side search/filter/sort/
 * pagination over `admin_gym_members()` — never the whole member table
 * loaded into the browser, however large the gym.
 */
export default async function GymMembersPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const pathname = `/admin/gyms/${id}/members`;

  const search = first(sp.q) ?? "";
  const status = first(sp.status);
  const branchId = first(sp.branchId);
  const expiryState = first(sp.expiry);
  const sortRaw = first(sp.sort) ?? "created_at";
  const sortCol = SORT_ALLOWLIST.has(sortRaw) ? sortRaw : "created_at";
  const sortDir: "asc" | "desc" = first(sp.dir) === "asc" ? "asc" : "desc";
  const { page, pageSize, offset } = parsePagination(sp);

  const supabase = await createClient();
  const [gym, { rows, total }, branchOptions] = await Promise.all([
    getGymDetail(supabase, id),
    getGymMembers(supabase, id, { search, status, branchId, expiryState, sortCol, sortDir, limit: pageSize, offset }),
    listBranchOptions(supabase, id),
  ]);
  if (!gym) notFound();

  const hasFilters = !!search || !!status || !!branchId || !!expiryState;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <SearchBox param="q" placeholder="Search name, email or phone" />
        <FilterSelect
          param="status"
          placeholder="All statuses"
          options={[
            { value: "active", label: "Active" },
            { value: "inactive", label: "Inactive" },
          ]}
        />
        <FilterSelect
          param="branchId"
          placeholder="All branches"
          options={branchOptions.map((b) => ({ value: b.id, label: b.name }))}
        />
        <FilterSelect
          param="expiry"
          placeholder="Any membership state"
          options={[
            { value: "active", label: "Active" },
            { value: "expiring_soon", label: "Expiring soon" },
            { value: "expired", label: "Expired" },
            { value: "none", label: "No plan" },
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
              <th scope="col" className="mfd-micro-label border-b border-line px-3 py-2.5">Contact</th>
              <th scope="col" className="mfd-micro-label border-b border-line px-3 py-2.5">Branch</th>
              <th scope="col" className="mfd-micro-label border-b border-line px-3 py-2.5">Plan</th>
              <SortLink pathname={pathname} searchParams={sp} sortKey="subscription_end_date" currentSort={sortCol} currentDir={sortDir}>
                Membership
              </SortLink>
              <SortLink pathname={pathname} searchParams={sp} sortKey="status" currentSort={sortCol} currentDir={sortDir}>
                Status
              </SortLink>
              <SortLink pathname={pathname} searchParams={sp} sortKey="joined_on" currentSort={sortCol} currentDir={sortDir} align="right">
                Joined
              </SortLink>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id} className="mfd-table-row">
                <td className="max-w-[160px] truncate border-b border-line px-4 py-2.5 font-bold">{m.name}</td>
                <td className="max-w-[190px] border-b border-line px-3 py-2.5 text-mute">
                  <span className="block truncate">{m.email ?? "—"}</span>
                  <span className="block truncate text-[11px]">{m.phone ?? ""}</span>
                </td>
                <td className="whitespace-nowrap border-b border-line px-3 py-2.5 text-mute">{m.branchName}</td>
                <td className="whitespace-nowrap border-b border-line px-3 py-2.5">{m.planName}</td>
                <td className="border-b border-line px-3 py-2.5">
                  <span className={PILL_CLASS} style={pillTone(EXPIRY_PILL[m.expiryState])}>
                    {m.expiryLabel}
                  </span>
                </td>
                <td className="whitespace-nowrap border-b border-line px-3 py-2.5 capitalize text-mute">{m.status}</td>
                <td className="whitespace-nowrap border-b border-line px-4 py-2.5 text-right text-mute">{m.joinedOn}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? (
          <EmptyState message="No members match your filters." resetHref={hasFilters ? pathname : undefined} />
        ) : (
          <Pagination pathname={pathname} searchParams={sp} page={page} pageSize={pageSize} total={total} itemLabel="members" />
        )}
      </div>
    </div>
  );
}
