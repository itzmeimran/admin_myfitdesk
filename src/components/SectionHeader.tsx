import type { ReactNode } from "react";

/** Small uppercase label, a hairline rule, and an optional right-hand slot —
 * the heading used above each card group on dashboard-style pages. */
export function SectionHeader({ id, children, aside }: { id?: string; children: ReactNode; aside?: ReactNode }) {
  return <div className="flex min-w-0 items-center gap-3">
    <h2 id={id} className="whitespace-nowrap text-[10.5px] font-bold uppercase tracking-[0.16em] text-mute2">{children}</h2>
    <span aria-hidden className="h-px min-w-4 flex-1 bg-line" />
    {aside ? <div className="min-w-0 whitespace-nowrap text-[11.5px] font-medium text-mute">{aside}</div> : null}
  </div>;
}
