import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/core/db/server-client";
import { getGymDetail } from "@/features/gyms/detail";
import { describeLastPayment, describeMembership, getGymMembers, getGymMemberSummary, getMemberActors, getMemberAvatarKeys, humanize } from "@/features/gyms/members";
import { listBranchOptions } from "@/features/gyms/branches";
import { SearchBox } from "@/components/SearchBox";
import { CustomFilterDropdown } from "@/components/CustomFilterDropdown";
import { SortLink } from "@/components/SortLink";
import { Pagination, parsePagination } from "@/components/Pagination";
import { EmptyState } from "@/components/EmptyState";
import { resolveMemberAvatarUrls } from "@/core/storage/member-avatar";
import { ActorLine } from "./actor-line";
import { formatZonedDate, formatZonedTime } from "@/core/dates/format";
import { pillTone, PILL_CLASS } from "@/core/ui/status-style";
import { MemberContact } from "./member-contact";
import { MemberDrawer } from "./member-drawer";
import { MemberSummaryCards } from "./member-summary";
import { NeedsAttention } from "./needs-attention";

const SORT_ALLOWLIST = new Set(["name", "branch_name", "plan_name", "membership_state", "subscription_end_date", "last_payment_at", "joined_on", "created_at"]);

const STATE_LABEL: Record<string, string> = {
  active: "Active",
  expiring_soon: "Expiring soon",
  expired: "Expired",
  upcoming: "Upcoming",
  frozen: "Frozen",
  cancelled: "Cancelled",
  none: "No active plan",
};

type RawSearchParams = Record<string, string | string[] | undefined>;
function first(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }

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
  const memberStatus = first(sp.status);
  const branchId = first(sp.branchId);
  const state = first(sp.state) ?? first(sp.expiry);
  const sortRaw = first(sp.sort) ?? "created_at";
  const sortCol = SORT_ALLOWLIST.has(sortRaw) ? sortRaw : "created_at";
  const sortDir: "asc" | "desc" = first(sp.dir) === "asc" ? "asc" : "desc";
  const { page, pageSize, offset } = parsePagination(sp);

  const supabase = await createClient();
  const [gym, branchOptions, summaryResult, membersResult] = await Promise.all([
    getGymDetail(supabase, id),
    listBranchOptions(supabase, id),
    getGymMemberSummary(supabase, id, branchId).then((data) => ({ data, failed: false })).catch(() => ({ data: null, failed: true })),
    getGymMembers(supabase, id, { search, memberStatus, branchId, state, deleted: roster === "deleted", sortCol, sortDir, limit: pageSize, offset })
      .then((data) => ({ data, failed: false }))
      .catch(() => ({ data: { rows: [], total: 0 }, failed: true })),
  ]);
  if (!gym) notFound();

  const summary = summaryResult.data;
  const { rows, total } = membersResult.data;
  // One RPC + local presigning for the whole page — never a request per member.
  const rowIds = rows.map((row) => row.id);
  const [avatarKeys, memberActors] = await Promise.all([getMemberAvatarKeys(supabase, id, rowIds), getMemberActors(supabase, id, rowIds)]);
  const avatarUrls = await resolveMemberAvatarUrls(supabase, id, avatarKeys);
  const timezone = summary?.timezone ?? gym.defaultTimezone;
  const hasFilters = Boolean(search || memberStatus || branchId || state);
  const clearHref = roster === "deleted" ? `${pathname}?roster=deleted` : pathname;
  const rosterHref = (nextRoster: "current" | "deleted") => nextRoster === "deleted" ? `${pathname}?roster=deleted` : pathname;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="flex" role="group" aria-label="Roster view">
          <Link href={rosterHref("current")} aria-pressed={roster === "current"} className={`flex min-h-[36px] items-center gap-1.5 border-[1.5px] border-r-0 border-ink px-3 text-[11.5px] font-bold ${roster === "current" ? "bg-ink text-hi" : "bg-paper text-mute hover:bg-sand"}`}>
            Current roster · {(summary?.totalMembers ?? gym.usage.memberCount).toLocaleString("en-IN")}
          </Link>
          <Link href={rosterHref("deleted")} aria-pressed={roster === "deleted"} className={`flex min-h-[36px] items-center gap-1.5 border-[1.5px] border-ink px-3 text-[11.5px] font-bold ${roster === "deleted" ? "bg-ink text-hi" : "bg-paper text-mute hover:bg-sand"}`}>
            Deleted · {(summary?.deletedMembers ?? 0).toLocaleString("en-IN")}
          </Link>
        </div>
        <span className="ml-auto border border-accent/40 bg-accent/5 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-accent">
          Platform admin view — read only
        </span>
      </div>

      {roster === "current" && summary ? <MemberSummaryCards summary={summary} /> : null}
      {roster === "current" && summary ? <NeedsAttention summary={summary} pathname={pathname} branchId={branchId} /> : null}
      {summaryResult.failed ? <InlineFailure message="Member summary is temporarily unavailable." retryHref={clearHref} /> : null}

      <div className="flex flex-wrap items-center gap-2.5">
        <SearchBox param="q" placeholder="Search name, email or phone" />
        <CustomFilterDropdown
          param="status"
          placeholder="All member statuses"
          options={[
            { value: "active", label: "Active member" },
            { value: "inactive", label: "Inactive member" },
            { value: "left", label: "Left" },
          ]}
        />
        <CustomFilterDropdown param="branchId" placeholder="All branches" options={branchOptions.map((branch) => ({ value: branch.id, label: branch.name }))} />
        <CustomFilterDropdown
          param="state"
          placeholder="Any membership state"
          options={[
            { value: "active", label: "Active" },
            { value: "expiring_soon", label: "Expiring soon" },
            { value: "expired", label: "Expired" },
            { value: "upcoming", label: "Upcoming" },
            { value: "frozen", label: "Frozen" },
            { value: "cancelled", label: "Cancelled" },
            { value: "none", label: "No active plan" },
            { value: "payment_pending", label: "Payment pending" },
            { value: "invalid_phone", label: "Missing / invalid phone" },
          ]}
        />
        {hasFilters ? <Link href={clearHref} className="text-[11.5px] font-bold text-accent underline underline-offset-2">Reset filters</Link> : null}
      </div>

      <div className="overflow-x-auto border-[1.5px] border-ink bg-paper">
        {membersResult.failed ? (
          <InlineFailure message="Unable to load members. No backend details were exposed." retryHref={clearHref} />
        ) : (
          <>
            <table className="w-full min-w-[1180px] border-collapse text-[12px]">
              <thead>
                <tr className="text-left">
                  <SortLink pathname={pathname} searchParams={sp} sortKey="name" currentSort={sortCol} currentDir={sortDir}>Member</SortLink>
                  <th scope="col" className="mfd-micro-label border-b border-line px-3 py-2.5">Contact</th>
                  <SortLink pathname={pathname} searchParams={sp} sortKey="branch_name" currentSort={sortCol} currentDir={sortDir}>Branch</SortLink>
                  <SortLink pathname={pathname} searchParams={sp} sortKey="plan_name" currentSort={sortCol} currentDir={sortDir}>Plan</SortLink>
                  <SortLink pathname={pathname} searchParams={sp} sortKey="subscription_end_date" currentSort={sortCol} currentDir={sortDir}>Membership</SortLink>
                  <SortLink pathname={pathname} searchParams={sp} sortKey="last_payment_at" currentSort={sortCol} currentDir={sortDir}>Last payment</SortLink>
                  <th scope="col" className="mfd-micro-label border-b border-line px-3 py-2.5">Added by</th>
                  <SortLink pathname={pathname} searchParams={sp} sortKey="created_at" currentSort={sortCol} currentDir={sortDir} align="right">Joined</SortLink>
                </tr>
              </thead>
              <tbody>
                {rows.map((member) => {
                  const paymentLines = describeLastPayment(member, timezone);
                  const actors = memberActors.get(member.id);
                  return (
                    <tr key={member.id} className="mfd-table-row align-top">
                      <td className="max-w-[175px] border-b border-line px-4 py-2.5">
                        <MemberDrawer organizationId={id} member={member} trigger={member.name} avatarUrl={avatarUrls[member.id]} />
                        <span className="mt-0.5 block text-[10.5px] capitalize text-mute3">{member.deletedAt ? "Deleted" : member.memberStatus}</span>
                      </td>
                      <td className="max-w-[220px] border-b border-line px-3 py-2.5 text-mute"><MemberContact phone={member.phone} email={member.email} /></td>
                      <td className="max-w-[150px] border-b border-line px-3 py-2.5"><span className="block truncate" title={member.branchName}>{member.branchName}</span></td>
                      <td className="max-w-[150px] border-b border-line px-3 py-2.5"><span className="block truncate" title={member.planName ?? "No plan"}>{member.planName ?? "No plan"}</span></td>
                      <td className="border-b border-line px-3 py-2.5"><span className={PILL_CLASS} style={pillTone(STATE_LABEL[member.membershipState] ?? humanize(member.membershipState))}>{describeMembership(member)}</span></td>
                      <td className="border-b border-line px-3 py-2.5"><span className="block font-bold text-ink">{paymentLines[0]}</span>{paymentLines[1] ? <span className="block whitespace-nowrap text-[10.5px] text-mute3">{paymentLines[1]}</span> : null}{member.lastPayment ? <ActorLine prefix="Recorded by" actor={actors?.lastPaymentRecordedBy} none={actors ? "Online / system" : "Recorder not available"} className="mt-0.5" /> : null}{member.paymentPending ? <span className="mt-0.5 block text-[10px] font-bold uppercase tracking-[0.06em] text-accent">Payment pending</span> : null}</td>
                      <td className="max-w-[170px] border-b border-line px-3 py-2.5"><ActorLine actor={actors?.addedBy} none={actors ? "Not recorded" : "Not available"} large /></td>
                      <td className="whitespace-nowrap border-b border-line px-4 py-2.5 text-right"><span className="block text-ink">{formatZonedDate(member.createdAt, timezone, false)}</span><span className="block text-[10.5px] text-mute3">{formatZonedTime(member.createdAt, timezone)}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {rows.length === 0 ? (
              <EmptyState message={roster === "deleted" ? "No deleted members match your filters." : hasFilters ? "No members match your filters." : "No members have been added to this gym yet."} resetHref={hasFilters ? clearHref : undefined} />
            ) : <Pagination pathname={pathname} searchParams={sp} page={page} pageSize={pageSize} total={total} itemLabel="members" />}
          </>
        )}
      </div>
    </div>
  );
}

function InlineFailure({ message, retryHref }: { message: string; retryHref: string }) {
  return <div className="flex flex-wrap items-center justify-between gap-2 border-[1.5px] border-accent bg-accent/5 px-3 py-2.5 text-[11.5px]"><span className="text-mute">{message}</span><Link href={retryHref} className="font-bold text-accent underline underline-offset-2">Retry</Link></div>;
}
