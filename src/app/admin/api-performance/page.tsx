import { createClient } from "@/core/db/server-client";
import { getActiveAdminEnvironment } from "@/core/env/active-environment";
import { getApiAlerts, getApiOverview } from "@/features/api-performance/queries";
import { assessHealth, formatCount, formatMs, formatRate, formatRpm } from "@/features/api-performance/format";
import { RANGES, parseApiParams, type RawSearchParams } from "@/features/api-performance/params";
import { EmptyState } from "@/components/EmptyState";
import { LatencyChart, VolumeChart } from "./charts";
import { AlertsPanel, HealthBanner, Kpi, KpiGroup, MixBar, RouteList, Section } from "./ui";

export default async function ApiPerformanceOverviewPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const sp = await searchParams;
  const { range, env } = parseApiParams(sp, await getActiveAdminEnvironment());
  const supabase = await createClient();
  const [ov, alerts] = await Promise.all([getApiOverview(supabase, { range, env }), getApiAlerts(supabase, env)]);
  const k = ov.kpis;
  const rangeLabel = (RANGES.find((r) => r.value === range)?.label ?? range).toLowerCase();

  return (
    <div className="flex flex-col gap-4">
      {k.total > 0 ? <HealthBanner health={assessHealth(k, ov.thresholds, rangeLabel)} /> : null}

      <Section title="Needs a look" hint="Last 15 minutes. Informational only: nothing here changes data or blocks a request.">
        <AlertsPanel data={alerts} searchParams={sp} />
      </Section>

      {k.total === 0 ? (
        <div className="border-[1.5px] border-ink bg-paper">
          <EmptyState message="No API requests recorded for this window and environment. The collector runs inside the tenant app's route handlers, so this fills as soon as it is deployed and receives traffic." />
        </div>
      ) : (
        <>
          <KpiGroup title="Traffic" question="How much is the platform being used?">
            <Kpi label="Total requests" value={formatCount(k.total)} hint={`Last ${rangeLabel}`} emphasis />
            <Kpi label="Requests / min" value={formatRpm(k.rpm)} hint="Average over the window" />
          </KpiGroup>

          <KpiGroup title="Speed" question="How fast do requests finish?">
            <Kpi label="Typical (P50)" value={formatMs(k.p50_ms)} hint="Half of requests are faster than this" />
            <Kpi label="Slow end (P95)" value={formatMs(k.p95_ms)} hint="19 in 20 are faster · the number to watch" accent={(k.p95_ms ?? 0) >= ov.thresholds.p95_alert_ms} />
            <Kpi label="Worst 1% (P99)" value={k.total >= 100 ? formatMs(k.p99_ms) : "—"} hint={k.total >= 100 ? "Only 1 in 100 is slower" : "Needs 100+ requests to be reliable"} />
            <Kpi label="Average" value={formatMs(k.avg_ms)} hint="Can hide slow requests" />
            <Kpi label="Slowest" value={formatMs(k.max_ms)} hint="Single slowest request" />
            <Kpi label="Slow requests" value={formatCount(k.slow)} hint={`${formatCount(k.very_slow)} over ${formatMs(ov.thresholds.slow_ms)} · slow = ≥ ${formatMs(ov.thresholds.acceptable_ms)}`} accent={k.very_slow > 0} />
          </KpiGroup>

          <KpiGroup title="Reliability" question="How often did a request fail?">
            <Kpi label="Succeeded" value={formatCount(k.successful)} hint="Responses 100–399" />
            <Kpi label="Server errors (5xx)" value={formatCount(k.failed)} hint="Our platform failed. Investigate" accent={k.failed > 0} />
            <Kpi label="Client errors (4xx)" value={formatCount(k.client_errors)} hint="Bad input or signed out. Usually not a fault" />
            <Kpi
              label="Failure rate"
              value={formatRate(k.error_rate_pct)}
              hint={`${formatCount(k.failed)} of ${formatCount(k.total)} requests were 5xx. 4xx not counted`}
              accent={(k.error_rate_pct ?? 0) >= 5}
            />
          </KpiGroup>

          <Section
            title="Response time classification"
            hint={`Fast < ${ov.thresholds.fast_ms} ms · Acceptable < ${ov.thresholds.acceptable_ms} ms · Slow < ${ov.thresholds.slow_ms} ms · Very slow beyond. Averages hide tails: watch P95.`}
          >
            <MixBar mix={ov.mix} total={k.total} />
          </Section>

          <div className="grid gap-4 lg:grid-cols-2">
            <Section title="Request volume" hint="Sudden jumps are drawn in the accent colour.">
              <VolumeChart series={ov.series} stepSeconds={ov.step_seconds} />
            </Section>
            <Section title="Response time trend" hint="Is it getting slower over the window?">
              <LatencyChart series={ov.series} stepSeconds={ov.step_seconds} slowMs={ov.thresholds.slow_ms} />
            </Section>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Section title="Slowest APIs" hint="By P95. Click one for its detail.">
              <RouteList rows={ov.slowest} metric="p95" searchParams={sp} thresholds={ov.thresholds} />
            </Section>
            <Section title="Most requested APIs" hint="A fast API called too often still loads the database.">
              <RouteList rows={ov.most_requested} metric="n" searchParams={sp} thresholds={ov.thresholds} />
            </Section>
          </div>

          <p className="text-[11px] text-mute">
            Percentiles come from latency histograms and are accurate to within a bucket width, not exact per request.
            Windows over 1 hour use hourly rollups (kept 90 days); 15 min and 1 hour use raw requests (kept 7 days).
          </p>
        </>
      )}
    </div>
  );
}
