import Link from "next/link";
import { createClient } from "@/core/db/server-client";
import { isGymFilter, type GymFilter } from "@/features/gyms/mock-data";
import {
  getGymsStatusSummary,
  listGymsPage,
  listAssignablePackages,
  listPackagesForFilter,
} from "@/features/gyms/queries";
import { SearchBox } from "@/components/SearchBox";
import { FilterSelect } from "@/components/FilterSelect";
import { SortLink } from "@/components/SortLink";
import { Pagination, parsePagination } from "@/components/Pagination";
import { EmptyState } from "@/components/EmptyState";
import { pillTone, PILL_CLASS } from "@/core/ui/status-style";
import { GymRowActions } from "./gym-row-actions";
import { ExportGymsButton } from "./export-gyms-button";
import { InviteGymOwnerSheet } from "./InviteGymOwnerSheet";
import {
  ListIcon,
  CalendarCheckIcon,
  TrialsIcon,
  AlertIcon,
  ReadOnlyIcon,
  SuspendIcon,
  type IconType,
} from "@/core/ui/icons";

const ACCENT = "var(--accent)";
const INK = "var(--ink)";
const MUTE = "var(--mute)";

const FILTER_TO_STATE: Record<GymFilter, string | undefined> = {
  All: undefined,
  Active: "active",
  Trialing: "trialing",
  Grace: "grace",
  "Read-only": "read_only",
  Suspended: "suspended",
};

const FILTER_ICON: Record<GymFilter, IconType> = {
  All: ListIcon,
  Active: CalendarCheckIcon,
  Trialing: TrialsIcon,
  Grace: AlertIcon,
  "Read-only": ReadOnlyIcon,
  Suspended: SuspendIcon,
};

const SORT_ALLOWLIST = new Set([
  "name",
  "owner_name",
  "package_name",
  "state",
  "member_count",
  "branch_count",
  "staff_count",
  "current_period_end",
  "lifetime_paid_minor",
  "created_at",
]);

function usageTone(pct: number) {
  return pct >= 90 ? ACCENT : INK;
}
function renewTone(renews: string) {
  return renews.startsWith("Overdue") || renews.startsWith("Trial") ? ACCENT : MUTE;
}

type RawSearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Server Component doing real search + filter + sort + pagination against
 * `admin_gyms_list()`/`admin_gyms_summary()` (supabase/migrations/1006_
 * admin_gym_detail.sql) — the replacement for the old client-side
 * `useMemo` filter over the entire gym table (see git history on this
 * file). Every control (SearchBox, FilterSelect, SortLink, Pagination) is a
 * plain URL navigation, so the whole page's state — search text, filters,
 * sort column/direction, page, page size — lives in the query string and
 * survives a page reload, a shared link, or the browser back button, per
 * the brief's "preserve search/filter/sort state when changing pages".
 */
export default async function GymsPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const sp = await searchParams;
  const pathname = "/admin/gyms";

  const filterRaw = first(sp.filter);
  const filter: GymFilter = isGymFilter(filterRaw) ? filterRaw : "All";
  const search = first(sp.q) ?? "";
  const packageId = first(sp.packageId) ?? "";
  const billing = first(sp.billing);
  const billingPeriod = billing === "monthly" || billing === "yearly" ? billing : undefined;
  const minBranchesRaw = first(sp.minBranches);
  const minBranches = minBranchesRaw ? Number.parseInt(minBranchesRaw, 10) : undefined;
  const sortRaw = first(sp.sort) ?? "created_at";
  const sortCol = SORT_ALLOWLIST.has(sortRaw) ? sortRaw : "created_at";
  const sortDir: "asc" | "desc" = first(sp.dir) === "asc" ? "asc" : "desc";
  const { page, pageSize, offset } = parsePagination(sp);

  const supabase = await createClient();
  const [summary, { rows, total }, assignablePackages, filterPackages] = await Promise.all([
    getGymsStatusSummary(supabase),
    listGymsPage(supabase, {
      search,
      status: FILTER_TO_STATE[filter],
      packageId: packageId || undefined,
      billingPeriod,
      minBranches: minBranches && minBranches > 0 ? minBranches : undefined,
      sortCol,
      sortDir,
      limit: pageSize,
      offset,
    }),
    listAssignablePackages(supabase),
    listPackagesForFilter(supabase),
  ]);

  const hasFilters = !!search || filter !== "All" || !!packageId || !!billingPeriod || !!minBranches;
  const resetHref = pathname;

  const SUMMARY_CHIPS: { label: string; value: number; filter: GymFilter }[] = [
    { label: "Total gyms", value: summary.total, filter: "All" },
    { label: "Active", value: summary.active, filter: "Active" },
    { label: "Trialing", value: summary.trialing, filter: "Trialing" },
    { label: "Grace", value: summary.grace, filter: "Grace" },
    { label: "Read-only", value: summary.readOnly, filter: "Read-only" },
    { label: "Suspended", value: summary.suspended, filter: "Suspended" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto flex min-w-0 flex-col gap-1">
          <h1 className="font-display text-[24px] tracking-[-0.02em] md:text-[26px]">Gyms</h1>
          <p className="text-[12.5px] text-mute">
            {summary.total.toLocaleString("en-IN")} enrolled · {summary.totalBranches.toLocaleString("en-IN")} branches
            · {summary.totalMembers.toLocaleString("en-IN")} members across the platform
          </p>
        </div>
        <ExportGymsButton
          params={{
            search,
            status: FILTER_TO_STATE[filter],
            packageId: packageId || undefined,
            billingPeriod,
            minBranches: minBranches && minBranches > 0 ? minBranches : undefined,
            sortCol,
            sortDir,
          }}
        />
        <InviteGymOwnerSheet packages={assignablePackages} />
      </div>

      {/* Status summary — doubles as the status filter, so there is no
          separate row of KPI tiles duplicating the same six numbers (task
          brief: "keep the summary useful and avoid unnecessary dashboard
          cards"). */}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
        {SUMMARY_CHIPS.map(({ label, value, filter: f }) => {
          const Icon = FILTER_ICON[f];
          const on = filter === f;
          const href = f === "All" ? pathname : `${pathname}?filter=${encodeURIComponent(f)}`;
          return (
            <Link
              key={f}
              href={href}
              aria-pressed={on}
              className={`flex min-h-[52px] flex-1 flex-col gap-0.5 border-[1.5px] px-3 py-2 ${
                on ? "border-ink bg-ink text-hi" : "border-line bg-paper text-ink"
              }`}
              style={{ minWidth: 108 }}
            >
              <span className="flex items-center gap-1.5 text-[9.5px] font-bold uppercase tracking-[0.1em]" style={{ opacity: 0.75 }}>
                <Icon size={11} aria-hidden />
                {label}
              </span>
              <span className="font-display text-[19px] tracking-[-0.02em]">{value.toLocaleString("en-IN")}</span>
            </Link>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <SearchBox param="q" placeholder="Search gym, owner, email or city" />
        <FilterSelect
          param="packageId"
          placeholder="All plans"
          options={filterPackages.map((p) => ({ value: p.id, label: p.label }))}
        />
        <FilterSelect
          param="billing"
          placeholder="Any billing cycle"
          options={[
            { value: "monthly", label: "Monthly" },
            { value: "yearly", label: "Yearly" },
          ]}
        />
        <FilterSelect
          param="minBranches"
          placeholder="Any branch count"
          options={[
            { value: "2", label: "2+ branches" },
            { value: "3", label: "3+ branches" },
            { value: "5", label: "5+ branches" },
          ]}
        />
        {hasFilters ? (
          <Link href={resetHref} className="text-[11.5px] font-bold text-accent underline underline-offset-2">
            Reset filters
          </Link>
        ) : null}
      </div>

      {/* Desktop table */}
      <div className="hidden overflow-x-auto border-[1.5px] border-ink bg-paper md:block">
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr className="text-left">
              <SortLink pathname={pathname} searchParams={sp} sortKey="name" currentSort={sortCol} currentDir={sortDir}>
                Gym
              </SortLink>
              <SortLink pathname={pathname} searchParams={sp} sortKey="owner_name" currentSort={sortCol} currentDir={sortDir}>
                Owner
              </SortLink>
              <SortLink pathname={pathname} searchParams={sp} sortKey="package_name" currentSort={sortCol} currentDir={sortDir}>
                Package
              </SortLink>
              <SortLink pathname={pathname} searchParams={sp} sortKey="state" currentSort={sortCol} currentDir={sortDir}>
                Status
              </SortLink>
              <SortLink pathname={pathname} searchParams={sp} sortKey="member_count" currentSort={sortCol} currentDir={sortDir} align="right">
                Member usage
              </SortLink>
              <SortLink pathname={pathname} searchParams={sp} sortKey="branch_count" currentSort={sortCol} currentDir={sortDir} align="right">
                Branches
              </SortLink>
              <SortLink pathname={pathname} searchParams={sp} sortKey="staff_count" currentSort={sortCol} currentDir={sortDir} align="right">
                Staff
              </SortLink>
              <SortLink pathname={pathname} searchParams={sp} sortKey="current_period_end" currentSort={sortCol} currentDir={sortDir} align="right">
                Renews
              </SortLink>
              <SortLink pathname={pathname} searchParams={sp} sortKey="lifetime_paid_minor" currentSort={sortCol} currentDir={sortDir} align="right">
                Paid to date
              </SortLink>
              <SortLink pathname={pathname} searchParams={sp} sortKey="created_at" currentSort={sortCol} currentDir={sortDir} align="right">
                Created
              </SortLink>
              <th scope="col" className="mfd-micro-label border-b border-line px-3 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {rows.map((g) => (
              <tr key={g.organizationId} className="mfd-table-row">
                <td className="max-w-[190px] border-b border-line px-4 py-2.5">
                  <Link href={`/admin/gyms/${g.organizationId}`} className="block truncate font-bold hover:underline">
                    {g.name}
                  </Link>
                  <span className="block truncate text-[11px] text-mute2">{g.city}</span>
                </td>
                <td className="max-w-[170px] border-b border-line px-3 py-2.5">
                  <span className="block truncate font-bold">{g.ownerName}</span>
                  <span className="block truncate text-[11px] text-mute2">{g.ownerEmail}</span>
                </td>
                <td className="whitespace-nowrap border-b border-line px-3 py-2.5">
                  <span className="block font-bold">{g.packageName}</span>
                  <span className="block text-[11px] text-mute2">{g.period}</span>
                </td>
                <td className="border-b border-line px-3 py-2.5">
                  <span className={PILL_CLASS} style={pillTone(g.status)}>
                    {g.status}
                  </span>
                </td>
                <td className="border-b border-line px-3 py-2.5" style={{ minWidth: 130 }}>
                  <span className="block text-[11.5px] font-bold" style={{ color: usageTone(g.pct) }}>
                    {g.members} / {g.cap}
                  </span>
                  <span className="mt-1 block h-[6px] w-full bg-sand">
                    <span
                      className="block h-[6px]"
                      style={{ width: `${Math.min(g.pct, 100)}%`, background: usageTone(g.pct) }}
                    />
                  </span>
                </td>
                <td className="whitespace-nowrap border-b border-line px-3 py-2.5 text-right">{g.branches}</td>
                <td className="whitespace-nowrap border-b border-line px-3 py-2.5 text-right">{g.staff}</td>
                <td className="whitespace-nowrap border-b border-line px-3 py-2.5 text-right" style={{ color: renewTone(g.renews) }}>
                  {g.renews}
                </td>
                <td className="whitespace-nowrap border-b border-line px-4 py-2.5 text-right font-bold">{g.ltv}</td>
                <td className="whitespace-nowrap border-b border-line px-3 py-2.5 text-right text-mute">
                  {new Date(g.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" })}
                </td>
                <td className="whitespace-nowrap border-b border-line px-3 py-2.5 text-right">
                  <GymRowActions gym={g} packages={assignablePackages} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? (
          <EmptyState message="No gyms match your filters." resetHref={hasFilters ? resetHref : undefined} />
        ) : (
          <Pagination pathname={pathname} searchParams={sp} page={page} pageSize={pageSize} total={total} itemLabel="gyms" />
        )}
      </div>

      {/* Mobile / tablet card list */}
      <div className="flex flex-col gap-2.5 md:hidden">
        {rows.length === 0 ? (
          <EmptyState message="No gyms match your filters." resetHref={hasFilters ? resetHref : undefined} />
        ) : (
          rows.map((g) => (
            <div key={g.organizationId} className="flex flex-col gap-2 border-[1.5px] border-line bg-paper p-3.5">
              <div className="flex items-start gap-2.5">
                <div className="min-w-0 flex-1">
                  <Link href={`/admin/gyms/${g.organizationId}`} className="block truncate text-[13.5px] font-bold hover:underline">
                    {g.name}
                  </Link>
                  <span className="block truncate text-[11.5px] text-mute2">
                    {g.ownerName} · {g.city}
                  </span>
                </div>
                <span className={`${PILL_CLASS} flex-shrink-0`} style={pillTone(g.status)}>
                  {g.status}
                </span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="text-[12px] font-bold" style={{ color: usageTone(g.pct) }}>
                  {g.members} / {g.cap} · {g.pct}%
                </span>
                <span className="h-[8px] flex-1 bg-sand">
                  <span className="block h-[8px]" style={{ width: `${Math.min(g.pct, 100)}%`, background: usageTone(g.pct) }} />
                </span>
              </div>
              <p className="text-[11.5px] leading-relaxed text-mute">
                {g.packageName} · {g.period}
                <br />
                {g.branches} branches · {g.staff} staff
                <br />
                <span style={{ color: renewTone(g.renews) }}>Renews {g.renews}</span> · Paid {g.ltv}
              </p>
              <GymRowActions gym={g} packages={assignablePackages} />
            </div>
          ))
        )}
        {rows.length > 0 ? (
          <Pagination pathname={pathname} searchParams={sp} page={page} pageSize={pageSize} total={total} itemLabel="gyms" />
        ) : null}
      </div>
    </div>
  );
}
