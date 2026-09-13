import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/core/db/server-client";
import { getGymDetail } from "@/features/gyms/detail";
import { getGymBranches, listBranchOptions } from "@/features/gyms/branches";
import { getGymStaff } from "@/features/gyms/staff";
import { SearchBox } from "@/components/SearchBox";
import { FilterSelect } from "@/components/FilterSelect";
import { SortLink } from "@/components/SortLink";
import { Pagination, parsePagination } from "@/components/Pagination";
import { EmptyState } from "@/components/EmptyState";
import { pillTone, PILL_CLASS } from "@/core/ui/status-style";
import { InboxIcon } from "@/core/ui/icons";
import { BranchRowDetail } from "./branch-row";

const SORT_ALLOWLIST = new Set(["name", "role", "status", "branch_name", "created_at"]);
const ROLE_LABEL: Record<string, string> = { owner: "Owner", staff: "Staff", trainer: "Trainer" };

type RawSearchParams = Record<string, string | string[] | undefined>;
function first(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

/**
 * "Branches & Team" tab — merges the old separate Branches and Staff tabs
 * to match the Claude Design canvas's single "Branches & Team" section:
 * a branch card grid, an Owner card (already on `GymDetail`, no new
 * query), the team roster (still a real search/filter/sort/paginated
 * table — that capability didn't exist in the design's static mock but is
 * worth keeping at real scale), and Pending invitations. Branches render as
 * a plain unpaginated grid (per this schema's own "usually one branch,
 * rarely more than a handful" fact) rather than the Staff table's real
 * pagination.
 *
 * Pending invitations has no backing table in this schema (no
 * `staff_invitations`-style entity anywhere in FitDeskApp's schema per the
 * audit) — shown as an honest empty state rather than fabricated rows,
 * same call this app made for the old Entitlements tab.
 */
export default async function GymTeamPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const pathname = `/admin/gyms/${id}/team`;

  const search = first(sp.q) ?? "";
  const role = first(sp.role);
  const branchId = first(sp.branchId);
  const status = first(sp.status);
  const sortRaw = first(sp.sort) ?? "created_at";
  const sortCol = SORT_ALLOWLIST.has(sortRaw) ? sortRaw : "created_at";
  const sortDir: "asc" | "desc" = first(sp.dir) === "asc" ? "asc" : "desc";
  const { page, pageSize, offset } = parsePagination(sp);

  const supabase = await createClient();
  const [gym, branches, { rows: staff, total }, branchOptions] = await Promise.all([
    getGymDetail(supabase, id),
    getGymBranches(supabase, id, { sortCol: "name", sortDir: "asc", limit: 100 }),
    getGymStaff(supabase, id, { search, role, branchId, status, sortCol, sortDir, limit: pageSize, offset }),
    listBranchOptions(supabase, id),
  ]);
  if (!gym) notFound();

  const hasFilters = !!search || !!role || !!branchId || !!status;
  const ownerInitials =
    gym.owner?.name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") ?? "—";

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <h2 className="mfd-micro-label">Branches</h2>
          <span className="text-[11.5px] text-mute3">
            {branches.rows.filter((b) => b.status === "active").length} active of {branches.rows.length} total
          </span>
        </div>
        {branches.rows.length === 0 ? (
          <EmptyState message="This gym hasn't added any branches yet." />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {branches.rows.map((b) => (
              <div key={b.id} className="flex flex-col gap-2.5 border-[1.5px] border-line bg-paper p-3.5">
                <div className="flex items-center gap-2">
                  <BranchRowDetail branch={b} trigger={<span className="text-[14px] font-bold">{b.name}</span>} />
                  <span
                    className={`ml-auto ${PILL_CLASS}`}
                    style={pillTone(b.status === "active" ? "Active" : "Cancelled")}
                  >
                    {b.status}
                  </span>
                </div>
                <div className="flex gap-4 border-t border-line pt-2.5">
                  <span className="flex flex-col gap-0.5">
                    <span className="font-display text-[18px] tracking-[-0.02em]">{b.memberCount}</span>
                    <span className="text-[10.5px] uppercase tracking-[0.1em] text-mute3">Members</span>
                  </span>
                  <span className="flex flex-col gap-0.5">
                    <span className="font-display text-[18px] tracking-[-0.02em]">{b.staffCount}</span>
                    <span className="text-[10.5px] uppercase tracking-[0.1em] text-mute3">Staff</span>
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-3.5 gap-y-0.5 border-t border-line pt-2.5 text-[11.5px] text-mute">
                  <span>{b.timezone}</span>
                  <span>{b.currency}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-wrap items-center gap-3.5 border-[1.5px] border-ink bg-paper p-4">
        <span
          aria-hidden="true"
          className="flex h-12 w-12 flex-shrink-0 items-center justify-center bg-hi font-display text-[15px] text-on-hi"
        >
          {ownerInitials}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2 className="mfd-micro-label">Owner</h2>
          <span className="font-display text-[18px] tracking-[-0.02em]">{gym.owner?.name ?? "No owner on record"}</span>
        </div>
        {gym.owner ? (
          <div className="flex flex-wrap gap-x-6 gap-y-1.5">
            <Fact label="Email" value={gym.owner.email} />
            <Fact label="Phone" value={gym.owner.phone ?? "—"} mono />
          </div>
        ) : null}
      </section>

      <section className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <h2 className="mfd-micro-label">Team roster</h2>
          <span className="ml-auto text-[11px] text-mute3">{total.toLocaleString("en-IN")} people</span>
        </div>

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
                <SortLink pathname={pathname} searchParams={sp} sortKey="created_at" currentSort={sortCol} currentDir={sortDir} align="right">
                  Joined
                </SortLink>
              </tr>
            </thead>
            <tbody>
              {staff.map((s) => (
                <tr key={s.id} className="mfd-table-row">
                  <td className="max-w-[170px] border-b border-line px-4 py-2.5 font-bold">{s.name}</td>
                  <td className="max-w-[190px] truncate border-b border-line px-3 py-2.5 text-mute">{s.email}</td>
                  <td className="border-b border-line px-3 py-2.5">
                    <span className={PILL_CLASS} style={pillTone(ROLE_LABEL[s.role] ?? s.role)}>
                      {ROLE_LABEL[s.role] ?? s.role}
                    </span>
                  </td>
                  <td className="whitespace-nowrap border-b border-line px-3 py-2.5 text-mute">{s.branchName}</td>
                  <td className="border-b border-line px-3 py-2.5">
                    <span className={PILL_CLASS} style={pillTone(s.status === "Active" ? "Active" : "Pending removal")}>
                      {s.status}
                    </span>
                  </td>
                  <td className="whitespace-nowrap border-b border-line px-4 py-2.5 text-right text-mute">{s.createdAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {staff.length === 0 ? (
            <EmptyState message="No staff match your filters." resetHref={hasFilters ? pathname : undefined} />
          ) : (
            <Pagination pathname={pathname} searchParams={sp} page={page} pageSize={pageSize} total={total} itemLabel="staff" />
          )}
        </div>
      </section>

      <section className="flex flex-col gap-2.5 border-[1.5px] border-line bg-paper p-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <h2 className="mfd-micro-label">Pending invitations</h2>
          <span className="ml-auto text-[11.5px] text-mute3">Issued by the owner · admin cannot invite on a gym&apos;s behalf</span>
        </div>
        <div className="flex flex-col items-center gap-2 border-t border-line py-8 text-center">
          <InboxIcon size={22} className="text-mute3" aria-hidden />
          <p className="max-w-sm text-[12px] leading-relaxed text-mute">
            Not available yet — this schema has no staff-invitation table for admin tooling to read.
          </p>
        </div>
      </section>
    </div>
  );
}

function Fact({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <span className="flex flex-col gap-0.5">
      <span className="text-[10px] font-bold uppercase tracking-[0.11em] text-mute3">{label}</span>
      <span className={`text-[12.5px] ${mono ? "font-mono" : ""}`}>{value}</span>
    </span>
  );
}
