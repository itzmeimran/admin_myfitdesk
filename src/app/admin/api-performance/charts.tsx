import { formatBucket, formatCount, formatMs, spikeThreshold } from "@/features/api-performance/format";

type Point = { t: string; n: number; errors: number; avg: number | null; p95: number | null };

/**
 * Pure server-rendered charts (no chart dependency, like the Overview page's
 * own bar chart). Both take the dense `series` from admin_api_overview —
 * empty buckets already present as zeros — so the x-axis is constant.
 */

/** Request volume per bucket. A bucket far above the typical (median) one is
 * drawn in the accent colour and labelled a spike; the errors share of each
 * bucket is stacked in ink so a failing burst reads at a glance. */
export function VolumeChart({ series, stepSeconds }: { series: Point[]; stepSeconds: number }) {
  const max = Math.max(1, ...series.map((p) => p.n));
  const spike = spikeThreshold(series.map((p) => p.n));
  const unit = stepSeconds >= 3600 ? "hour" : "minute";
  return (
    <figure className="flex flex-col gap-2" aria-label={`Requests per ${unit}`}>
      <div className="flex h-[150px] items-end gap-px border-b-[1.5px] border-ink">
        {series.map((p) => {
          const isSpike = spike !== null && p.n >= spike;
          const h = Math.max(p.n > 0 ? 2 : 0, (p.n / max) * 100);
          const errH = p.n > 0 ? (p.errors / p.n) * h : 0;
          return (
            <div
              key={p.t}
              title={`${formatBucket(p.t, stepSeconds)} — ${formatCount(p.n)} requests${p.errors ? `, ${p.errors} failed` : ""}${isSpike ? " · spike" : ""}`}
              className="relative flex min-w-0 flex-1 flex-col justify-end"
              style={{ height: "100%" }}
            >
              <div className={isSpike ? "bg-accent" : "bg-hi"} style={{ height: `${h - errH}%` }} />
              {errH > 0 ? <div className="bg-ink" style={{ height: `${errH}%` }} /> : null}
            </div>
          );
        })}
      </div>
      <AxisLabels series={series} stepSeconds={stepSeconds} />
      <figcaption className="flex flex-wrap gap-x-4 gap-y-1 text-[10.5px] text-mute">
        <Legend swatch="bg-hi" label={`Requests per ${unit}`} />
        <Legend swatch="bg-accent" label="Unusual spike" />
        <Legend swatch="bg-ink" label="Failed (5xx)" />
        <span>Peak {formatCount(max)} / {unit}</span>
      </figcaption>
    </figure>
  );
}

/** Average and P95 response time per bucket, on a shared scale. Gaps (no
 * traffic) break the line rather than drawing a false zero. */
export function LatencyChart({ series, stepSeconds, slowMs }: { series: Point[]; stepSeconds: number; slowMs: number }) {
  const W = 600;
  const H = 150;
  const values = series.flatMap((p) => [p.avg, p.p95]).filter((v): v is number => v !== null);
  const max = Math.max(slowMs, ...values, 1);
  const x = (i: number) => (series.length <= 1 ? W / 2 : (i / (series.length - 1)) * W);
  const y = (v: number) => H - (v / max) * (H - 6) - 3;

  const path = (pick: (p: Point) => number | null) => {
    let d = "";
    let pen = false;
    series.forEach((p, i) => {
      const v = pick(p);
      if (v === null) {
        pen = false;
        return;
      }
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)} `;
      pen = true;
    });
    return d.trim();
  };

  return (
    <figure className="flex flex-col gap-2" aria-label="Average and P95 response time">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-[150px] w-full border-b-[1.5px] border-ink" role="img">
        <line x1="0" x2={W} y1={y(slowMs)} y2={y(slowMs)} stroke="var(--accent)" strokeWidth="1" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
        <path d={path((p) => p.p95)} fill="none" stroke="var(--accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        <path d={path((p) => p.avg)} fill="none" stroke="var(--ink)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
      <AxisLabels series={series} stepSeconds={stepSeconds} />
      <figcaption className="flex flex-wrap gap-x-4 gap-y-1 text-[10.5px] text-mute">
        <Legend swatch="bg-ink" label="Average" />
        <Legend swatch="bg-accent" label="P95" />
        <span>Dashed line = slow threshold ({formatMs(slowMs)}) · Scale up to {formatMs(max)}</span>
      </figcaption>
    </figure>
  );
}

function AxisLabels({ series, stepSeconds }: { series: Point[]; stepSeconds: number }) {
  if (series.length === 0) return null;
  const mid = series[Math.floor(series.length / 2)];
  return (
    <div className="flex justify-between text-[10px] text-mute3">
      <span>{formatBucket(series[0].t, stepSeconds)}</span>
      <span>{formatBucket(mid.t, stepSeconds)}</span>
      <span>{formatBucket(series[series.length - 1].t, stepSeconds)}</span>
    </div>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span aria-hidden="true" className={`h-2 w-2 ${swatch}`} />
      {label}
    </span>
  );
}
