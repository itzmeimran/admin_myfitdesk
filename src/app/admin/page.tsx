import { HEALTH } from "@/features/overview/mock-data";
import { getOverviewData } from "@/features/overview/queries";
import { createClient } from "@/core/db/server-client";
import { OverviewView } from "./overview-view";

/**
 * Server Component reading src/features/overview/queries.ts. HEALTH (the
 * "Billing pipeline" dark panel) is the one section still on mock data —
 * see the TODO(needs-service-role-or-new-rpc) comment at the bottom of
 * queries.ts for why (payment_provider_events has no admin-readable
 * policy by design).
 *
 * The design's loading/empty/error states are gated on a canvas-authoring
 * "data state" toggle that exists only to demo those states in the design
 * tool — this page always renders the populated view; wiring real
 * loading/empty/error handling for a Supabase-backed page is separate work.
 */
export default async function OverviewPage() {
  const supabase = await createClient();
  const data = await getOverviewData(supabase);

  return (
    <OverviewView
      attention={data.attention}
      tiles={data.tiles}
      mix={data.mix}
      risk={data.risk}
      limits={data.limits}
      signups={data.signups}
      health={HEALTH}
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
