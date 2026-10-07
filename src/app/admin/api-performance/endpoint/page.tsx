import { ButtonLink } from "@/components/ButtonLink";

import { createClient } from "@/core/db/server-client";
import { getActiveAdminEnvironment } from "@/core/env/active-environment";
import { getApiOverview, listRequests } from "@/features/api-performance/queries";
import { formatCount, formatMs, formatRate, formatRpm } from "@/features/api-performance/format";
import { first, parseApiParams, withParams, type RawSearchParams } from "@/features/api-performance/params";
import { BackIcon } from "@/core/ui/icons";
import { EmptyState } from "@/components/EmptyState";
import { LatencyChart, VolumeChart } from "../charts";
import { Kpi, MixBar, Section } from "../ui";
import { RequestsTable } from "../requests-table";

/**
 * One endpoint, one method. Reuses admin_api_overview with a route filter
 * (the same code path as the Overview tab, so the two can never disagree)
 * plus the Request Explorer RPC for the recent slow / failed lists.
 */
export default async function ApiEndpointDetailPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const sp = await searchParams;
  const route = first(sp.route);
  const method = first(sp.method);
  const { range, env } = parseApiParams(sp, await getActiveAdminEnvironment());
  const back = withParams("/admin/api-performance/endpoints", sp, {});

  if (!route || !method) {
    return (
      <div className="border-[1.5px] border-ink bg-paper">
        <EmptyState message="Pick an endpoint from the Endpoints table to see its detail." resetHref={back} resetLabel="Go to endpoints" />
      </div>
    );
  }

  const supabase = await createClient();
  const ov = await getApiOverview(supabase, { range, env, route, method });
  const [slow, failed] = await Promise.all([
    listRequests(supabase, { range, env, route, routeExact: true, method, minMs: ov.thresholds.acceptable_ms, sort: "duration", limit: 10, offset: 0 }),
    listRequests(supabase, { range, env, route, routeExact: true, method, minStatus: 500, limit: 10, offset: 0 }),
  ]);
  const k = ov.kpis;
  const explorer = withParams("/admin/api-performance/requests", sp, { q: route, method });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <ButtonLink variant="text" href={back} className="flex items-center gap-1.5 text-[11.5px] font-bold text-mute hover:text-ink">
          <BackIcon size={13} aria-hidden />
          All endpoints
        </ButtonLink>
        <h2 className="break-all font-mono text-[18px] font-bold">
          <span className="text-mute">{method}</span> {route}
        </h2>
      </div>

      {k.total === 0 ? (
        <div className="border-[1.5px] border-ink bg-paper">
          <EmptyState message="No requests for this endpoint in the selected window." resetHref={back} resetLabel="Back to endpoints" />
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2.5">
            <Kpi label="Total requests" value={formatCount(k.total)} emphasis />
            <Kpi label="Requests / min" value={formatRpm(k.rpm)} />
            <Kpi label="Average" value={formatMs(k.avg_ms)} />
            <Kpi label="P50" value={formatMs(k.p50_ms)} />
            <Kpi label="P95" value={formatMs(k.p95_ms)} accent={(k.p95_ms ?? 0) >= ov.thresholds.p95_alert_ms} />
            <Kpi label="P99" value={k.total >= 100 ? formatMs(k.p99_ms) : "—"} hint={k.total >= 100 ? undefined : "Needs 100+ requests"} />
            <Kpi label="Maximum" value={formatMs(k.max_ms)} />
            <Kpi label="Success rate" value={formatRate(100 - (k.error_rate_pct ?? 0))} hint="Non-5xx" />
            <Kpi label="Error rate" value={formatRate(k.error_rate_pct)} accent={(k.error_rate_pct ?? 0) >= 5} />
          </div>

          <Section title="Response time classification">
            <MixBar mix={ov.mix} total={k.total} />
          </Section>

          <div className="grid gap-4 lg:grid-cols-2">
            <Section title="Response time trend">
              <LatencyChart series={ov.series} stepSeconds={ov.step_seconds} slowMs={ov.thresholds.slow_ms} />
            </Section>
            <Section title="Request volume trend">
              <VolumeChart series={ov.series} stepSeconds={ov.step_seconds} />
            </Section>
          </div>

          <Section title="Recent slow requests" hint={`Slowest requests at or above ${formatMs(ov.thresholds.acceptable_ms)}. Raw requests are kept 7 days.`}>
            {slow.rows.length === 0 ? <p className="text-[12px] text-mute">None in this window.</p> : <RequestsTable rows={slow.rows} thresholds={ov.thresholds} />}
          </Section>
          <Section title="Recent failed requests" hint="Server errors (5xx), newest first.">
            {failed.rows.length === 0 ? <p className="text-[12px] text-mute">None in this window.</p> : <RequestsTable rows={failed.rows} thresholds={ov.thresholds} />}
          </Section>
          <ButtonLink variant="text" href={explorer} className="text-[11.5px] font-bold text-accent hover:underline">
            Open every request for this endpoint in the request explorer →
          </ButtonLink>
        </>
      )}
    </div>
  );
}
