import type { CSSProperties } from "react";

export type ColumnBar = {
  key: string;
  label: string;
  valueLabel: string;
  heightPct: number;
  color: string;
  valueColor?: string;
  title: string;
};

/** Shared overview-style columns, with exact values available without hovering. */
export function ColumnBarChart({ bars, label, columnMaxWidth }: {
  bars: ColumnBar[];
  label: string;
  columnMaxWidth?: number;
}) {
  const columnStyle: CSSProperties | undefined = columnMaxWidth ? { maxWidth: columnMaxWidth } : undefined;
  return <div role="group" aria-label={label}>
    <div className="flex h-[176px] items-end justify-center gap-1 border-b-[1.5px] border-ink">
      {bars.map(bar => <div key={bar.key} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5" style={columnStyle}>
        <span className="text-[10px] font-bold" style={{ color: bar.valueColor ?? "var(--ink)" }}>{bar.valueLabel}</span>
        <span className="block w-full" aria-hidden style={{ height: `${Math.min(100, Math.max(0, bar.heightPct))}%`, background: bar.color }} title={bar.title} />
      </div>)}
    </div>
    <div className="mt-1.5 flex justify-center gap-1">
      {bars.map(bar => <span key={bar.key} className="min-w-0 flex-1 truncate text-center text-[10px] text-mute2" style={columnStyle}>{bar.label}</span>)}
    </div>
  </div>;
}
