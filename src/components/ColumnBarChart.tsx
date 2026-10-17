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
export function ColumnBarChart({ bars, label, columnMaxWidth, height = 176, onInspect }: {
  bars: ColumnBar[];
  label: string;
  columnMaxWidth?: number;
  height?: number;
  onInspect?: (key: string) => void;
}) {
  const columnStyle: CSSProperties | undefined = columnMaxWidth ? { maxWidth: columnMaxWidth } : undefined;
  return <div role="group" aria-label={label}>
    <div className="flex items-end justify-center gap-1 border-b-[1.5px] border-ink" style={{ height }}>
      {bars.map(bar => <div key={bar.key} role={onInspect ? "img" : undefined} aria-label={onInspect ? bar.title : undefined} tabIndex={onInspect ? 0 : undefined} onFocus={onInspect ? () => onInspect(bar.key) : undefined} onMouseEnter={onInspect ? () => onInspect(bar.key) : undefined} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5 outline-offset-[-1px] focus-visible:outline focus-visible:outline-accent" style={columnStyle}>
        <span className="text-[10px] font-bold" style={{ color: bar.valueColor ?? "var(--ink)" }}>{bar.valueLabel}</span>
        <span className="block w-full" aria-hidden style={{ height: `${Math.min(100, Math.max(0, bar.heightPct))}%`, background: bar.color }} title={bar.title} />
      </div>)}
    </div>
    <div className="mt-1.5 flex justify-center gap-1">
      {bars.map(bar => <span key={bar.key} className={`min-w-0 flex-1 text-center text-[10px] text-mute2 ${onInspect ? "overflow-visible whitespace-nowrap" : "truncate"}`} style={columnStyle}>{bar.label}</span>)}
    </div>
  </div>;
}
