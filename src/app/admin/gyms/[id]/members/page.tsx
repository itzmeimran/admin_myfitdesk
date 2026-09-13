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
import { InboxIcon } from "@/core/ui/icons";
import { MemberContact } from "./member-contact";
import { MemberDrawer } from "./member-drawer";

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
 * Members tab — matches the design's "Current roster / Deleted" toggle
 * (`?roster=deleted`). Real server-side search/filter/sort/pagination over
 * `admin_gym_members()` for the current roster, exactly as before; the
 * Deleted roster has no backing read in this schema (`admin_gym_members()`
 * only ever returns live rows, and no admin RPC reads soft-deleted members)
 * so it's an honest empty state, not fabricated rows. Contact details are
 * masked by default with a per-row reveal toggle (member-contact.tsx) —
 * purely a display concern over data already fetched unmasked.
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

  const roster = first(sp.roster) === "deleted" ? "deleted" : "current";
  const search = first(sp.q) ?? "";
  const status = first(sp.status);
  const branchId = first(sp.branchId);
  const expiryState = first(sp.expiry);
  const sortRaw = first(sp.sort) ?? "created_at";
  const sortCol = SORT_ALLOWLIST.has(sortRaw) ? sortRaw : "created_at";
  const sortDir: "asc" | "desc" = first(sp.dir) === "asc" ? "asc" : "desc";
  const { page, pageSize, offset } = parsePagination(sp);

  const supabase = await createClient();
  const [gym, membersResult, branchOptions] = await Promise.all([
    getGymDetail(supabase, id),
    roster === "current"
      ? getGymMembers(supabase, id, { search, status, branchId, expiryState, sortCol, sortDir, limit: pageSize, offset })
      : Promise.resolve({ rows: [], total: 0 }),
    roster === "current" ? listBranchOptions(supabase, id) : Promise.resolve([]),
  ]);
  if (!gym) notFound();
  const { rows, total } = membersResult;

  const hasFilters = !!search || !!status || !!branchId || !!expiryState;
  const rosterParams = (r: "current" | "deleted") => {
    const params = new URLSearchParams();
    if (r === "deleted") params.set("roster", "deleted");
    return `${pathname}${params.toString() ? `?${params}` : ""}`;
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="flex" role="group" aria-label="Roster view">
          <Link
            href={rosterParams("current")}
            aria-pressed={roster === "current"}
            className={`flex min-h-[36px] items-center gap-1.5 border-[1.5px] border-r-0 border-ink px-3 text-[11.5px] font-bold ${
              roster === "current" ? "bg-ink text-hi" : "bg-paper text-mute"
            }`}
          >
            Current roster · {gym.usage.memberCount.toLocaleString("en-IN")}
          </Link>
          <Link
            href={rosterParams("deleted")}
            aria-pressed={roster === "deleted"}
            className={`flex min-h-[36px] items-center gap-1.5 border-[1.5px] border-ink px-3 text-[11.5px] font-bold ${
              roster === "deleted" ? "bg-ink text-hi" : "bg-paper text-mute"
            }`}
          >
            Deleted
          </Link>
        </div>
        <span className="ml-auto flex items-center gap-1.5 text-[11px] text-mute3">
          Platform admin view — read only
        </span>
      </div>

      {roster === "deleted" ? (
        <div className="flex flex-col items-center gap-2 border-[1.5px] border-line bg-paper px-4 py-14 text-center">
          <InboxIcon size={24} className="text-mute3" aria-hidden />
          <p className="max-w-md text-[12.5px] leading-relaxed text-mute">
            Not available yet — this gym&apos;s soft-deleted members (retained per this app&apos;s &ldquo;no hard
            delete&rdquo; schema convention) have no admin read today.{" "}
            <code className="text-[11px]">admin_gym_members()</code>{" "}
            only ever returns live rows.
          </p>
        </div>
      ) : (
        <>
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
                    Member
                  </SortLink>
                  <th scope="col" className="mfd-micro-label border-b border-line px-3 py-2.5">Contact</th>
                  <th scope="col" className="mfd-micro-label border-b border-line px-3 py-2.5">Branch / plan</th>
                  <SortLink pathname={pathname} searchParams={sp} sortKey="status" currentSort={sortCol} currentDir={sortDir}>
                    Status
                  </SortLink>
                  <SortLink pathname={pathname} searchParams={sp} sortKey="subscription_end_date" currentSort={sortCol} currentDir={sortDir}>
                    Membership
                  </SortLink>
                  <SortLink pathname={pathname} searchParams={sp} sortKey="joined_on" currentSort={sortCol} currentDir={sortDir} align="right">
                    Joined
                  </SortLink>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.id} className="mfd-table-row">
                    <td className="max-w-[170px] border-b border-line px-4 py-2.5">
                      <MemberDrawer member={m} trigger={m.name} />
                    </td>
                    <td className="max-w-[210px] border-b border-line px-3 py-2.5 text-mute">
                      <MemberContact phone={m.phone} email={m.email} />
                    </td>
                    <td className="whitespace-nowrap border-b border-line px-3 py-2.5">
                      <span className="block">{m.branchName}</span>
                      <span className="block text-[11px] text-mute3">{m.planName}</span>
                    </td>
                    <td className="whitespace-nowrap border-b border-line px-3 py-2.5 capitalize text-mute">{m.status}</td>
                    <td className="border-b border-line px-3 py-2.5">
                      <span className={PILL_CLASS} style={pillTone(EXPIRY_PILL[m.expiryState])}>
                        {m.expiryLabel}
                      </span>
                    </td>
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
        </>
      )}
    </div>
  );
}
