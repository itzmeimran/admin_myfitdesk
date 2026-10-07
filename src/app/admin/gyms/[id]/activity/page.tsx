import { ButtonLink } from "@/components/ButtonLink";
import { PeriodSelector } from "@/components/PeriodSelector";
import { IST_TIME_ZONE } from "@/core/dates/ist";
import { notFound } from "next/navigation";

import { createClient } from "@/core/db/server-client";
import { getGymDetail } from "@/features/gyms/detail";
import { getTimeline } from "@/features/gyms/ops/queries";
import { CATEGORY_LABEL } from "@/features/gyms/ops/timeline-format";
import { zonedDayRange, zonedToday } from "@/core/dates/zoned-range";
import { SearchBox } from "@/components/SearchBox";
import { FilterSelect } from "@/components/FilterSelect";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { Pagination, parsePagination } from "@/components/Pagination";
import { EmptyState } from "@/components/EmptyState";
import { SectionError } from "../ops-ui";
import { ExportActivityButton, TimelineFeed } from "./timeline-feed";

type RawSearchParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const CATEGORY_ORDER = ["members", "payments", "memberships", "subscription", "whatsapp", "billing", "jobs", "webhooks", "security", "admin", "system", "gym", "expenses", "inventory", "leads", "other"];
const ACTORS = [
  { value: "platform_admin", label: "Platform admin" },
  { value: "owner", label: "Gym owner" },
  { value: "staff", label: "Staff" },
  { value: "trainer", label: "Trainer" },
  { value: "system", label: "System" },
];
const STATUSES = [
  { value: "success", label: "Success" },
  { value: "warning", label: "Warning" },
  { value: "failed", label: "Failed" },
];

/**
 * Activity tab — one operational timeline for this gym: platform-admin
 * actions, the gym's own changes (owner / staff / trainer), payments,
 * WhatsApp and webhook failures, failed jobs and raised alerts. Filtering,
 * sorting and pagination all happen in the database (25 per page); the newest
 * event is first unless the admin flips it.
 */
export default async function GymActivityPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const pathname = `/admin/gyms/${id}/activity`;

  const search = first(sp.q) ?? "";
  const category = first(sp.category);
  const actorType = first(sp.actor);
  const status = first(sp.status);
  const dateFrom = first(sp.from);
  const dateTo = first(sp.to);
  const sortDir: "asc" | "desc" = first(sp.dir) === "asc" ? "asc" : "desc";
  const { page, pageSize, offset } = parsePagination(sp);

  const supabase = await createClient();
  const gym = await getGymDetail(supabase, id);
  if (!gym) notFound();
  const tz = IST_TIME_ZONE;

  const timeline = await getTimeline(
    supabase,
    id,
    {
      search,
      category,
      actorType,
      status,
      from: dateFrom ? zonedDayRange(dateFrom, tz)?.start : undefined,
      to: dateTo ? zonedDayRange(dateTo, tz)?.end : undefined,
      sortDir,
    },
    pageSize,
    offset,
  )
    .then((data) => ({ data, error: null as string | null }))
    .catch((error: unknown) => ({ data: null, error: error instanceof Error ? error.message : "Unexpected error." }));

  const hasFilters = !!search || !!category || !!actorType || !!status || !!dateFrom || !!dateTo;

  const presetHref = (days: number) => {
    const p = new URLSearchParams();
    for (const [key, raw] of Object.entries(sp)) {
      const value = first(raw);
      if (value && key !== "page") p.set(key, value);
    }
    p.set("from", zonedToday(tz, -days));
    p.set("to", zonedToday(tz));
    return `${pathname}?${p.toString()}`;
  };
  const preset = {
    today: dateFrom === zonedToday(tz) && dateTo === zonedToday(tz),
    week: dateFrom === zonedToday(tz, -6) && dateTo === zonedToday(tz),
    month: dateFrom === zonedToday(tz, -29) && dateTo === zonedToday(tz),
  };

  const sortHref = (() => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) {
      const value = first(v);
      if (value && k !== "dir" && k !== "page") p.set(k, value);
    }
    if (sortDir === "desc") p.set("dir", "asc");
    return `${pathname}${p.toString() ? `?${p}` : ""}`;
  })();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <PeriodSelector value={preset.today ? "today" : preset.week ? "week" : preset.month ? "month" : ""} ariaLabel="Date presets"
          options={[{value:"today",label:"Today",href:presetHref(0)},{value:"week",label:"Last 7 days",href:presetHref(6)},{value:"month",label:"Last 30 days",href:presetHref(29)}]} />
        <DateRangeFilter />
        <span className="ml-auto flex items-center gap-3 text-[11.5px] text-mute3">
          {timeline.data ? `${timeline.data.total.toLocaleString("en-IN")} events` : null}
          <ButtonLink href={sortHref} variant="text" size="custom" className="underline underline-offset-2">
            {sortDir === "desc" ? "Newest first" : "Oldest first"}
          </ButtonLink>
          <ExportActivityButton
            organizationId={id}
            filters={{ search, category, actorType, status, from: dateFrom, to: dateTo, sortDir }}
          />
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <SearchBox param="q" placeholder="Search action, person or member" />
        <FilterSelect
          param="category"
          placeholder="All categories"
          options={CATEGORY_ORDER.map((value) => ({ value, label: CATEGORY_LABEL[value] ?? value }))}
        />
        <FilterSelect param="actor" placeholder="Any actor" options={ACTORS} />
        <FilterSelect param="status" placeholder="Any status" options={STATUSES} />
        {hasFilters ? (
          <ButtonLink href={pathname} variant="text" size="custom" className="underline underline-offset-2">
            Reset filters
          </ButtonLink>
        ) : null}
      </div>

      {timeline.error || !timeline.data ? (
        <SectionError title="Activity" message={timeline.error ?? "Unavailable."} />
      ) : timeline.data.rows.length === 0 ? (
        <div className="border-[1.5px] border-line bg-paper">
          <EmptyState
            message={
              hasFilters
                ? "No activity matches your filters."
                : "Nothing has been recorded for this gym yet. Actions by the owner, staff, trainers and platform admins appear here as they happen."
            }
            resetHref={hasFilters ? pathname : undefined}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <TimelineFeed events={timeline.data.rows} organizationId={id} timeZone={tz} />
          <Pagination pathname={pathname} searchParams={sp} page={page} pageSize={pageSize} total={timeline.data.total} itemLabel="events" />
        </div>
      )}
    </div>
  );
}
