"use client";

import { useRef, useState } from "react";
import { formatBucket, formatCount, formatMs, formatTime, spikeThreshold } from "@/features/api-performance/format";

type Point = { t: string; n: number; errors: number; avg: number | null; p95: number | null };

/**
 * Dependency-free charts (like the Overview page's own bar chart), made
 * interactive: hover, press-and-drag on touch, or Left/Right/Home/End on the
 * focused chart moves a crosshair and fills a readout above the plot. The
 * readout is inline (not a floating tooltip) so it can never be clipped or
 * hidden under a finger on a phone. Both take the dense `series` from
 * admin_api_overview — empty buckets already present as zeros — so the x-axis
 * is constant.
 */

/** Shared "which bucket is the pointer/keyboard on" state. */
function useScrub(count: number) {
  const [index, setIndex] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const fromClientX = (clientX: number) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || count === 0) return null;
    const ratio = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
    return Math.min(count - 1, Math.floor(ratio * count));
  };

  const handlers = {
    onPointerMove: (e: React.PointerEvent) => setIndex(fromClientX(e.clientX)),
    onPointerDown: (e: React.PointerEvent) => setIndex(fromClientX(e.clientX)),
    onPointerLeave: (e: React.PointerEvent) => {
      // A finger lifting also "leaves"; keep the touched point readable.
      if (e.pointerType === "mouse") setIndex(null);
    },
    onBlur: () => setIndex(null),
    onKeyDown: (e: React.KeyboardEvent) => {
      const last = count - 1;
      if (last < 0) return;
      const move = (next: number) => {
        e.preventDefault();
        setIndex(Math.min(last, Math.max(0, next)));
      };
      if (e.key === "ArrowRight") move((index ?? -1) + 1);
      else if (e.key === "ArrowLeft") move((index ?? last + 1) - 1);
      else if (e.key === "Home") move(0);
      else if (e.key === "End") move(last);
      else if (e.key === "Escape") setIndex(null);
    },
  };
  return { index, ref, handlers };
}

const HINT = "Hover, tap or use ← → to inspect a point";

function Readout({ time, children }: { time?: string; children?: React.ReactNode }) {
  return (
    <div className="flex min-h-[34px] flex-wrap items-baseline gap-x-3 gap-y-0.5 border-[1.5px] border-line bg-sand/50 px-2.5 py-1.5 text-[11.5px]" aria-live="polite">
      {time ? (
        <>
          <strong className="text-ink">{time}</strong>
          {children}
        </>
      ) : (
        <span className="text-mute">{HINT}</span>
      )}
    </div>
  );
}

/** Request volume per bucket. A bucket far above the typical (median) one is
 * drawn in the accent colour and labelled a spike; the errors share of each
 * bucket is stacked in ink so a failing burst reads at a glance. */
export function VolumeChart({ series, stepSeconds }: { series: Point[]; stepSeconds: number }) {
  const max = Math.max(1, ...series.map((p) => p.n));
  const spike = spikeThreshold(series.map((p) => p.n));
  const unit = stepSeconds >= 3600 ? "hour" : "minute";
  const { index, ref, handlers } = useScrub(series.length);
  const active = index !== null ? series[index] : null;
  const activeSpike = active !== null && spike !== null && active.n >= spike;

  return (
    <figure className="flex flex-col gap-2" aria-label={`Requests per ${unit}`}>
      <Readout time={active ? formatTime(active.t, true) : undefined}>
        {active ? (
          <>
            <span className="text-mute">
              <strong className="text-ink tabular-nums">{formatCount(active.n)}</strong> request{active.n === 1 ? "" : "s"}
            </span>
            <span className={active.errors > 0 ? "font-bold text-accent" : "text-mute"}>
              {active.errors > 0 ? `${formatCount(active.errors)} failed (5xx)` : "none failed"}
            </span>
            {activeSpike ? <span className="font-bold text-accent">unusual spike</span> : null}
          </>
        ) : null}
      </Readout>
      <div
        ref={ref}
        tabIndex={0}
        role="group"
        aria-label={`Requests per ${unit}. Use the arrow keys to inspect each ${unit}.`}
        {...handlers}
        className="flex h-[150px] cursor-crosshair items-end gap-px border-b-[1.5px] border-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        style={{ touchAction: "pan-y" }}
      >
        {series.map((p, i) => {
          const isSpike = spike !== null && p.n >= spike;
          const h = Math.max(p.n > 0 ? 2 : 0, (p.n / max) * 100);
          const errH = p.n > 0 ? (p.errors / p.n) * h : 0;
          const dimmed = index !== null && index !== i;
          return (
            <div
              key={p.t}
              className={`relative flex h-full min-w-0 flex-1 flex-col justify-end transition-opacity ${dimmed ? "opacity-40" : ""} ${index === i ? "bg-sand" : ""}`}
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
  const { index, ref, handlers } = useScrub(series.length);
  const active = index !== null ? series[index] : null;

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

  // The SVG is stretched (preserveAspectRatio none), so the crosshair and
  // markers are HTML overlays positioned in percent — circles inside it
  // would be squashed into ellipses.
  const pct = (v: number) => `${(y(v) / H) * 100}%`;
  const left = index !== null ? `${(x(index) / W) * 100}%` : "0";

  return (
    <figure className="flex flex-col gap-2" aria-label="Average and P95 response time">
      <Readout time={active ? formatTime(active.t, true) : undefined}>
        {active ? (
          active.n === 0 ? (
            <span className="text-mute">no requests</span>
          ) : (
            <>
              <span className="text-mute">
                Average <strong className="text-ink tabular-nums">{formatMs(active.avg)}</strong>
              </span>
              <span className="text-mute">
                P95 <strong className="tabular-nums text-accent">{formatMs(active.p95)}</strong>
              </span>
              <span className="text-mute">{formatCount(active.n)} requests</span>
            </>
          )
        ) : null}
      </Readout>
      <div
        ref={ref}
        tabIndex={0}
        role="group"
        aria-label="Response time trend. Use the arrow keys to inspect each point."
        {...handlers}
        className="relative h-[150px] cursor-crosshair border-b-[1.5px] border-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        style={{ touchAction: "pan-y" }}
      >
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-full w-full" role="img" aria-hidden="true">
          <line x1="0" x2={W} y1={y(slowMs)} y2={y(slowMs)} stroke="var(--accent)" strokeWidth="1" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
          <path d={path((p) => p.p95)} fill="none" stroke="var(--accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          <path d={path((p) => p.avg)} fill="none" stroke="var(--ink)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        </svg>
        {active ? (
          <div className="pointer-events-none absolute inset-y-0" style={{ left }}>
            <div className="absolute inset-y-0 w-px -translate-x-1/2 bg-ink/40" />
            {active.p95 !== null ? (
              <span className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-paper bg-accent" style={{ top: pct(active.p95) }} />
            ) : null}
            {active.avg !== null ? (
              <span className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-paper bg-ink" style={{ top: pct(active.avg) }} />
            ) : null}
          </div>
        ) : null}
      </div>
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
