import { getOverviewData, type OverviewPeriod } from "@/features/overview/queries";
import { createClient } from "@/core/db/server-client";
import { OverviewView } from "./overview-view";

/**
 * Server Component reading src/features/overview/queries.ts — every
 * section is real data now, including the "Billing pipeline" panel
 * (supabase/migrations/1005_admin_billing_pipeline.sql).
 *
 * `?period=` (month/quarter/year, default month) drives which date range
 * admin_overview_stats() runs against — same `?query=` + Server Component
 * re-fetch pattern as Gyms' `?filter=` and Packages' `?new=`, so switching
 * the period toggle is a real navigation/refetch, not just a relabeled
 * button over data that never changed.
 *
 * The design's loading/empty/error states are gated on a canvas-authoring
 * "data state" toggle that exists only to demo those states in the design
 * tool — this page always renders the populated view; wiring real
 * loading/empty/error handling for a Supabase-backed page is separate work.
 */
function isOverviewPeriod(value: string | undefined): value is OverviewPeriod {
  return value === "month" || value === "quarter" || value === "year";
}

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const { period: periodParam } = await searchParams;
  const period: OverviewPeriod = isOverviewPeriod(periodParam) ? periodParam : "month";
  const supabase = await createClient();
  const data = await getOverviewData(supabase, period);

  return (
    <OverviewView
      period={period}
      attention={data.attention}
      tiles={data.tiles}
      mix={data.mix}
      risk={data.risk}
      limits={data.limits}
      signups={data.signups}
      health={data.health}
      trend={data.trend}
      gymsEnrolledCount={data.gymsEnrolledCount}
      headerLine={data.headerLine}
      attentionCaption={data.attentionCaption}
      signupsCaption={data.signupsCaption}
      trendHeaderValue={data.trendHeaderValue}
      trendHeaderHint={data.trendHeaderHint}
    />
  );
}
