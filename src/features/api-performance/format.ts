/** Display helpers for the API Performance section. Pure. */

export function formatMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || Number.isNaN(ms)) return "—";
  if (ms >= 10_000) return `${(ms / 1000).toFixed(1)} s`;
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)} s`;
  if (ms >= 100) return `${Math.round(ms)} ms`;
  return `${ms.toFixed(ms < 10 ? 1 : 0)} ms`;
}

export function formatCount(n: number | null | undefined): string {
  return n === null || n === undefined ? "—" : n.toLocaleString("en-IN");
}

export function formatRate(pct: number | null | undefined): string {
  if (pct === null || pct === undefined) return "—";
  return `${pct >= 10 ? pct.toFixed(0) : pct.toFixed(pct >= 1 ? 1 : 2)}%`;
}

export function formatRpm(rpm: number | null | undefined): string {
  if (rpm === null || rpm === undefined) return "—";
  return rpm >= 100 ? Math.round(rpm).toLocaleString("en-IN") : rpm.toFixed(rpm >= 10 ? 1 : 2);
}

/** `req_` + first 12 hex of the request UUID — same form the tenant app
 * returns in `x-request-id` and writes to its logs. */
export function requestLabel(uuid: string): string {
  return `req_${uuid.replace(/-/g, "").slice(0, 12)}`;
}

export type LatencyClass = "fast" | "acceptable" | "slow" | "very_slow";

export type Thresholds = { fast_ms: number; acceptable_ms: number; slow_ms: number; p95_alert_ms: number };
export const DEFAULT_THRESHOLDS: Thresholds = { fast_ms: 300, acceptable_ms: 800, slow_ms: 2000, p95_alert_ms: 1500 };

export function classifyLatency(ms: number, t: Thresholds = DEFAULT_THRESHOLDS): LatencyClass {
  if (ms < t.fast_ms) return "fast";
  if (ms < t.acceptable_ms) return "acceptable";
  if (ms < t.slow_ms) return "slow";
  return "very_slow";
}

export const LATENCY_LABEL: Record<LatencyClass, string> = {
  fast: "Fast",
  acceptable: "Acceptable",
  slow: "Slow",
  very_slow: "Very slow",
};

/** Palette is the app's own (no green): ink = healthy, sand = fine, hi = watch, accent = act. */
export const LATENCY_TONE: Record<LatencyClass, { backgroundColor: string; color: string }> = {
  fast: { backgroundColor: "var(--sand)", color: "var(--ink)" },
  acceptable: { backgroundColor: "var(--line)", color: "var(--ink)" },
  slow: { backgroundColor: "var(--hi)", color: "var(--on-hi)" },
  very_slow: { backgroundColor: "var(--accent)", color: "var(--paper)" },
};

export function statusTone(status: number): { backgroundColor: string; color: string } {
  if (status >= 500) return LATENCY_TONE.very_slow;
  if (status >= 400) return LATENCY_TONE.slow;
  return LATENCY_TONE.fast;
}

export type HealthLevel = "healthy" | "attention" | "unhealthy";
export type Health = { level: HealthLevel; headline: string; summary: string; reasons: string[] };

type HealthInput = {
  total: number;
  failed: number;
  error_rate_pct: number | null;
  p95_ms: number | null;
  very_slow: number;
};

/**
 * One verdict for the whole window, so the page answers "is anything wrong?"
 * before any number is read. Two signals only, both already on screen: how
 * often the platform failed (5xx) and how slow the slowest 1-in-20 requests
 * were (P95) — averages hide both. Thresholds are the admin-configured ones.
 */
export function assessHealth(k: HealthInput, t: Thresholds, rangeLabel: string): Health {
  const rate = k.error_rate_pct ?? 0;
  const p95 = k.p95_ms ?? 0;
  const unhealthyReasons: string[] = [];
  const attentionReasons: string[] = [];

  if (rate >= 5) unhealthyReasons.push(`${formatRate(rate)} of requests failed on our side (${formatCount(k.failed)} of ${formatCount(k.total)})`);
  else if (k.failed > 0 && rate >= 1) attentionReasons.push(`${formatCount(k.failed)} request${k.failed === 1 ? "" : "s"} failed on our side (${formatRate(rate)})`);

  if (p95 >= t.slow_ms) unhealthyReasons.push(`the slowest 1 in 20 requests took ${formatMs(p95)} or more`);
  else if (p95 >= t.p95_alert_ms) attentionReasons.push(`the slowest 1 in 20 requests took ${formatMs(p95)} or more`);

  if (k.very_slow > 0 && p95 < t.p95_alert_ms) attentionReasons.push(`${formatCount(k.very_slow)} request${k.very_slow === 1 ? " was" : "s were"} very slow (over ${formatMs(t.slow_ms)})`);

  if (unhealthyReasons.length > 0) {
    return { level: "unhealthy", headline: "Needs action", summary: `In the last ${rangeLabel}: ${[...unhealthyReasons, ...attentionReasons].join("; ")}.`, reasons: [...unhealthyReasons, ...attentionReasons] };
  }
  if (attentionReasons.length > 0) {
    return { level: "attention", headline: "Worth a look", summary: `In the last ${rangeLabel}: ${attentionReasons.join("; ")}.`, reasons: attentionReasons };
  }
  return {
    level: "healthy",
    headline: "Healthy",
    summary: `${formatCount(k.total)} request${k.total === 1 ? "" : "s"} in the last ${rangeLabel}, none failed on our side, and 19 in 20 finished within ${formatMs(k.p95_ms)}.`,
    reasons: [],
  };
}

/** A bucket is a "spike" when it is well above the typical (median) non-empty
 * bucket. Median, not mean, so one huge bucket cannot hide itself. */
export function spikeThreshold(counts: number[]): number | null {
  const nonEmpty = counts.filter((c) => c > 0).sort((a, b) => a - b);
  if (nonEmpty.length < 4) return null;
  const median = nonEmpty[Math.floor(nonEmpty.length / 2)];
  return Math.max(median * 3, median + 10);
}

/** MyFitDesk operates in India (INR, en-IN everywhere else in the app), and
 * a server render on Vercel would otherwise print UTC. */
export const DISPLAY_TZ = "Asia/Kolkata";

export function formatTime(iso: string, withDate = false): string {
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: DISPLAY_TZ,
    ...(withDate ? { day: "numeric", month: "short" } : {}),
    hour: "2-digit",
    minute: "2-digit",
    second: withDate ? undefined : "2-digit",
    hour12: true,
  });
}

/** Axis label for a chart bucket — time-only for short ranges, date + hour for long ones. */
export function formatBucket(iso: string, stepSeconds: number): string {
  const d = new Date(iso);
  if (stepSeconds >= 3 * 3600) {
    return d.toLocaleString("en-IN", { timeZone: DISPLAY_TZ, day: "numeric", month: "short", hour: "numeric", hour12: true });
  }
  return d.toLocaleTimeString("en-IN", { timeZone: DISPLAY_TZ, hour: "numeric", minute: "2-digit", hour12: true });
}
