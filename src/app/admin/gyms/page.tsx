import { ButtonLink } from "@/components/ButtonLink";
import { createClient } from "@/core/db/server-client";
import { isGymListFilter, type GymListFilter } from "@/features/gyms/list-display";
import {
  getGymsStatusSummary,
  listGymsPage,
  listAssignablePackages,
  listPackagesForFilter,
} from "@/features/gyms/queries";
import { getPlatformSettingsOrFallback } from "@/features/settings/platform-settings";
import { SearchBox } from "@/components/SearchBox";
import { FilterSelect } from "@/components/FilterSelect";
import { GymsTable } from "./gyms-table";
import { GymSortControl } from "./gym-sort-control";
import { redirect } from "next/navigation";
import { Pagination, parsePagination } from "@/components/Pagination";
import { NavigationPendingContent } from "@/components/NavigationPendingContent";
import { SkeletonCards, SkeletonTable } from "@/components/Skeleton";
import { ExportGymsButton } from "./export-gyms-button";
import { InviteGymOwnerSheet } from "./InviteGymOwnerSheet";
import {
  ListIcon,
  CalendarCheckIcon,
  TrialsIcon,
  AlertIcon,
  ReadOnlyIcon,
  SuspendIcon,
  DeleteIcon,
  type IconType,
} from "@/core/ui/icons";

const FILTER_TO_STATE: Record<GymListFilter, string | undefined> = {
  All: undefined,
  Active: "active",
  Trialing: "trialing",
  Expired: "expired",
  "Expiring soon": "expiring_soon",
  Cancelled: "cancelled",
  Grace: "grace",
  "Read-only": "read_only",
  Suspended: "suspended",
};

const FILTER_ICON: Record<GymListFilter, IconType> = {
  All: ListIcon,
  Active: CalendarCheckIcon,
  Trialing: TrialsIcon,
  Expired: AlertIcon,
  "Expiring soon": TrialsIcon,
  Cancelled: ReadOnlyIcon,
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
  const filter: GymListFilter = isGymListFilter(filterRaw) ? filterRaw : "All";
  const search = first(sp.q) ?? "";
  const packageId = first(sp.packageId) ?? "";
  const billing = first(sp.billing);
  const billingPeriod = billing === "monthly" || billing === "yearly" ? billing : undefined;
  const minBranchesRaw = first(sp.minBranches);
  const minBranches = minBranchesRaw ? Number.parseInt(minBranchesRaw, 10) : undefined;
  const sortRaw = first(sp.sort) ?? "name";
  const sortCol = SORT_ALLOWLIST.has(sortRaw) ? sortRaw : "name";
  const sortDir: "asc" | "desc" = first(sp.dir) === "desc" ? "desc" : "asc";
  const { page, pageSize, offset } = parsePagination(sp);

  const supabase = await createClient();
  const [summary, { rows, total }, assignablePackages, filterPackages, platformDefaults] = await Promise.all([
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
    getPlatformSettingsOrFallback(supabase),
  ]);

  if (page > Math.max(1, Math.ceil(total / pageSize))) {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(sp)) if (value !== undefined) next.set(key, Array.isArray(value) ? value[0] : value);
    next.set("page", String(Math.max(1, Math.ceil(total / pageSize))));
    redirect(`${pathname}?${next}`);
  }

  const hasFilters = !!search || filter !== "All" || !!packageId || !!billingPeriod || !!minBranches;
  const resetHref = pathname;

  const SUMMARY_CHIPS: { label: string; value: number; filter: GymListFilter }[] = [
    { label: "Total gyms", value: summary.total, filter: "All" },
    { label: "Active", value: summary.active, filter: "Active" },
    { label: "Trial", value: summary.trialing, filter: "Trialing" },
    { label: "Grace", value: summary.grace, filter: "Grace" },
    { label: "Read-only", value: summary.readOnly, filter: "Read-only" },
    { label: "Suspended", value: summary.suspended, filter: "Suspended" },
  ];

  return (
    <div className="flex min-w-0 flex-col gap-4">
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
        <ButtonLink icon={DeleteIcon} href="/admin/gyms/deletions" variant="secondary" size="sm">Gym deletions</ButtonLink>
        <InviteGymOwnerSheet
          packages={assignablePackages}
          defaults={{ trialDays: platformDefaults.trialDays, country: platformDefaults.country }}
        />
      </div>

      {/* Status summary — doubles as the status filter, so there is no
          separate row of KPI tiles duplicating the same six numbers (task
          brief: "keep the summary useful and avoid unnecessary dashboard
          cards"). */}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
        {SUMMARY_CHIPS.map(({ label, value, filter: f }) => {
          const Icon = FILTER_ICON[f];
          const on = filter === f;
          const params = new URLSearchParams();
          for (const [key, value] of Object.entries(sp)) if (value !== undefined && key !== "page" && key !== "filter") params.set(key, Array.isArray(value) ? value[0] : value);
          if (f !== "All") params.set("filter", f);
          const href = `${pathname}?${params}`;
          return (
            <ButtonLink
              key={f}
              href={href}
              aria-current={on ? "true" : undefined}
              selected={on}
              variant="secondary" layout="content" size="custom" className="flex min-h-[44px] flex-1 flex-col gap-0.5 px-3 py-2 text-ink"
              style={{ minWidth: 96 }}
            >
              <span className="flex items-center gap-1.5 text-[9.5px] font-bold normal-case tracking-[0.1em]" style={{ opacity: 0.75 }}>
                <Icon size={11} aria-hidden />
                {label}
              </span>
              <span className="font-display text-[17px] tracking-[-0.02em]">{value.toLocaleString("en-IN")}</span>
            </ButtonLink>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <SearchBox param="q" placeholder="Search gym, owner, email or city" className="basis-full lg:basis-auto" />
        <FilterSelect param="filter" placeholder="All statuses" options={[
          { value: "Active", label: "Active" }, { value: "Trialing", label: "Trial" },
          { value: "Expired", label: "Expired" }, { value: "Expiring soon", label: "Expiring soon" },
          { value: "Grace", label: "Grace" }, { value: "Read-only", label: "Read-only" },
          { value: "Cancelled", label: "Cancelled" }, { value: "Suspended", label: "Suspended" },
        ]} />
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
          <ButtonLink variant="text" href={resetHref} className="text-[11.5px] font-bold text-accent underline underline-offset-2">
            Reset filters
          </ButtonLink>
        ) : null}
      </div>

      <GymSortControl sortCol={sortCol} sortDir={sortDir} />
      <NavigationPendingContent pathname={pathname} fallback={
        <div role="status" className="min-w-0" aria-label="Updating gyms">
          <span className="sr-only">Updating gyms…</span>
          <div className="hidden md:block"><SkeletonTable rows={pageSize > 10 ? 8 : 5} cols={8} /></div>
          <div className="md:hidden"><SkeletonCards count={3} /></div>
        </div>
      }>
        <GymsTable rows={rows} packages={assignablePackages} searchParams={sp} sortCol={sortCol} sortDir={sortDir} hasFilters={hasFilters} />
        <Pagination compact pathname={pathname} searchParams={sp} page={page} pageSize={pageSize} total={total} itemLabel="gyms" />
      </NavigationPendingContent>
    </div>
  );
}
