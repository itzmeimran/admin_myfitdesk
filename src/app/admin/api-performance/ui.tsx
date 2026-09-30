import Link from "next/link";
import { PILL_CLASS } from "@/core/ui/status-style";
import {
  LATENCY_LABEL,
  LATENCY_TONE,
  classifyLatency,
  formatCount,
  formatMs,
  statusTone,
  type Thresholds,
} from "@/features/api-performance/format";
import type { ApiAlerts } from "@/features/api-performance/queries";
import { withParams, type RawSearchParams } from "@/features/api-performance/params";

export function Kpi({
  label,
  value,
  hint,
  emphasis,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  emphasis?: boolean;
  accent?: boolean;
}) {
  return (
    <div className={`mfd-kpi-tile flex min-h-[92px] min-w-[150px] flex-1 flex-col gap-1.5 border-[1.5px] p-3.5 ${emphasis ? "border-ink bg-ink" : "border-line bg-paper"}`}>
      <span className={`text-[10.5px] font-bold uppercase tracking-[0.12em] ${emphasis ? "text-hi" : "text-mute"}`}>{label}</span>
      <span className={`font-display text-[24px] tracking-[-0.02em] ${emphasis ? "text-paper" : accent ? "text-accent" : "text-ink"}`}>{value}</span>
      {hint ? <span className={`text-[11px] ${emphasis ? "text-mute3" : "text-mute"}`}>{hint}</span> : null}
    </div>
  );
}

export function LatencyPill({ ms, thresholds }: { ms: number; thresholds?: Thresholds }) {
  const cls = classifyLatency(ms, thresholds);
  return (
    <span className={PILL_CLASS} style={LATENCY_TONE[cls]} title={LATENCY_LABEL[cls]}>
      {formatMs(ms)}
    </span>
  );
}

export function StatusPill({ status }: { status: number }) {
  return (
    <span className={PILL_CLASS} style={statusTone(status)}>
      {status}
    </span>
  );
}

export function MethodTag({ method }: { method: string }) {
  return <span className="font-mono text-[10.5px] font-bold text-mute">{method}</span>;
}

export function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5 border-[1.5px] border-ink bg-paper p-4">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.13em]">{title}</h2>
        {hint ? <p className="text-[11.5px] text-mute">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

const SEVERITY_TONE = {
  critical: { backgroundColor: "var(--accent)", color: "var(--paper)" },
  warning: { backgroundColor: "var(--hi)", color: "var(--on-hi)" },
  info: { backgroundColor: "var(--sand)", color: "var(--ink)" },
} as const;

const ALERT_LABEL: Record<string, string> = {
  high_p95: "High P95",
  very_slow: "Very slow requests",
  error_rate: "Error rate up",
  repeated_5xx: "Repeated 5xx",
  unusual_traffic: "Unusual traffic",
};

/** Informational only — nothing here acts on production. */
export function AlertsPanel({ data, searchParams }: { data: ApiAlerts; searchParams: RawSearchParams }) {
  if (data.alerts.length === 0 && data.duplicates.length === 0) {
    return (
      <p className="text-[12px] text-mute">
        Nothing unusual in the last 15 minutes: no slow P95, error spike, traffic surge or duplicate burst.
      </p>
    );
  }
  return (
    <ul className="flex flex-col divide-y divide-line border-[1.5px] border-line">
      {data.alerts.map((a, i) => (
        <li key={`${a.type}-${a.route}-${a.method}-${i}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5">
          <span className={PILL_CLASS} style={SEVERITY_TONE[a.severity]}>
            {ALERT_LABEL[a.type] ?? a.type}
          </span>
          <Link
            href={withParams("/admin/api-performance/endpoint", searchParams, { route: a.route, method: a.method })}
            className="font-mono text-[11.5px] font-bold hover:text-accent"
          >
            {a.method} {a.route}
          </Link>
          <span className="text-[11.5px] text-mute">{a.message}</span>
        </li>
      ))}
      {data.duplicates.map((d, i) => (
        <li key={`dup-${d.route}-${i}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5">
          <span className={PILL_CLASS} style={SEVERITY_TONE.info}>
            Duplicate burst
          </span>
          <Link
            href={withParams("/admin/api-performance/endpoint", searchParams, { route: d.route, method: d.method })}
            className="font-mono text-[11.5px] font-bold hover:text-accent"
          >
            {d.method} {d.route}
          </Link>
          <span className="text-[11.5px] text-mute">
            {formatCount(d.count)} identical requests within {d.window_seconds}s
            {d.organization_name ? ` from ${d.organization_name}` : ""}. Repeats are not always bugs; worth a look.
          </span>
        </li>
      ))}
    </ul>
  );
}

export function RouteList({
  rows,
  metric,
  searchParams,
  thresholds,
}: {
  rows: { route: string; method: string; n: number; p95: number | null }[];
  metric: "p95" | "n";
  searchParams: RawSearchParams;
  thresholds: Thresholds;
}) {
  if (rows.length === 0) return <p className="text-[12px] text-mute">No requests in this window.</p>;
  return (
    <ol className="flex flex-col divide-y divide-line">
      {rows.map((r) => (
        <li key={`${r.method} ${r.route}`} className="flex items-center justify-between gap-3 py-2">
          <Link
            href={withParams("/admin/api-performance/endpoint", searchParams, { route: r.route, method: r.method })}
            className="min-w-0 truncate font-mono text-[11.5px] hover:text-accent"
          >
            <span className="font-bold text-mute">{r.method}</span> {r.route}
          </Link>
          {metric === "p95" && r.p95 !== null ? (
            <span className="flex flex-shrink-0 items-center gap-2 text-[11px] text-mute">
              P95 <LatencyPill ms={r.p95} thresholds={thresholds} />
            </span>
          ) : (
            <span className="flex-shrink-0 text-[12px] font-bold tabular-nums">{formatCount(r.n)} requests</span>
          )}
        </li>
      ))}
    </ol>
  );
}

/** Stacked bar of the four latency classes. */
export function MixBar({ mix, total }: { mix: { fast: number; acceptable: number; slow: number; very_slow: number }; total: number }) {
  if (total === 0) return null;
  const parts = (["fast", "acceptable", "slow", "very_slow"] as const).map((k) => ({ k, n: mix[k] }));
  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-3 w-full overflow-hidden border-[1.5px] border-ink" role="img" aria-label="Response time classification">
        {parts.map(({ k, n }) => (n > 0 ? <div key={k} style={{ width: `${(n / total) * 100}%`, ...LATENCY_TONE[k] }} title={`${LATENCY_LABEL[k]}: ${formatCount(n)}`} /> : null))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-mute">
        {parts.map(({ k, n }) => (
          <span key={k} className="flex items-center gap-1.5">
            <span aria-hidden="true" className="h-2 w-2 border border-ink" style={{ backgroundColor: LATENCY_TONE[k].backgroundColor }} />
            {LATENCY_LABEL[k]} <strong className="text-ink">{formatCount(n)}</strong>
          </span>
        ))}
      </div>
    </div>
  );
}
