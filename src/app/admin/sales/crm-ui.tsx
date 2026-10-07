"use client";

import { Button } from "@/components/Button";
import type { SalesUser } from "@/features/sales/model";
import { iconForAction } from '@/core/ui/action-icons';

/** Small presentational pieces shared by every Sales CRM screen. */

export const EYEBROW = "text-[10px] font-bold uppercase tracking-[0.12em] text-mute2";

export function OwnerBadge({ user, size = 24 }: { user: SalesUser; size?: 22 | 24 | 30 }) {
  return (
    <span
      title={user.name}
      aria-label={`Assigned to ${user.name}`}
      style={{ width: size, height: size }}
      className="flex flex-shrink-0 items-center justify-center border-[1.5px] border-ink text-[9.5px] font-bold text-ink"
    >
      {user.initials}
    </span>
  );
}

/** Square status pip + label used for stage chips, demo status etc. */
export function Chip({ children, tone = "outline" }: { children: React.ReactNode; tone?: "outline" | "ink" | "sand" | "mute" | "accent" }) {
  const tones = {
    outline: "border-ink bg-paper text-ink",
    ink: "border-ink bg-ink text-hi",
    sand: "border-line bg-sand text-mute",
    mute: "border-line text-mute",
    accent: "border-accent text-accent",
  };
  return (
    <span className={`border-[1.5px] px-2 py-1 text-[10.5px] font-bold uppercase tracking-[0.1em] ${tones[tone]}`}>{children}</span>
  );
}

/** Joined segmented control (scope switch, demo filter, activity type …). */
export function Segmented<T extends string>({
  value, options, onChange, ariaLabel, size = "md", className = "", wrap = false,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  ariaLabel: string;
  size?: "md" | "lg";
  className?: string;
  /** Separate, wrapping pills (modal fields) instead of one joined bar. */
  wrap?: boolean;
}) {
  const h = size === "lg" ? "min-h-[44px]" : "min-h-[36px]";
  if (wrap) {
    return (
      <div role="radiogroup" aria-label={ariaLabel} className={`flex flex-wrap gap-1.5 ${className}`}>
        {options.map((o) => {
          const on = o.value === value;
          return (
            <Button icon={iconForAction(o.label)} key={o.value} type="button" role="radio" aria-checked={on} variant="secondary" layout="control" size="custom" onClick={() => onChange(o.value)}
              className={`min-h-[42px] border-[1.5px] px-3.5 text-[13px] font-bold ${on ? "border-ink bg-ink text-hi" : "border-line bg-paper text-ink hover:border-ink hover:bg-sand"}`}>
              {o.label}
            </Button>
          );
        })}
      </div>
    );
  }
  return (
    <div role="tablist" aria-label={ariaLabel} className={`grid border-[1.5px] border-ink ${className}`} style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0,1fr))` }}>
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <Button icon={iconForAction(o.label)} key={o.value} type="button" role="tab" aria-selected={on} variant="ghost" layout="control" size="custom" onClick={() => onChange(o.value)}
            className={`${h} whitespace-nowrap px-2 text-[12px] font-bold sm:px-3.5 ${i < options.length - 1 ? "border-r-[1.5px] border-r-ink" : ""} ${on ? "bg-ink text-hi" : "bg-paper text-ink hover:bg-sand"}`}>
            {o.label}
          </Button>
        );
      })}
    </div>
  );
}

/** KPI strip: N tiles sharing one outer border. */
export function TileStrip({ tiles, cols, ink = false }: {
  tiles: { label: string; value: string | number; hint?: string; rust?: boolean }[];
  /** Tailwind grid-cols classes, e.g. "grid-cols-3 md:grid-cols-4". */
  cols: string;
  ink?: boolean;
}) {
  return (
    <section className={`overflow-hidden border-[1.5px] ${ink ? "border-ink" : "border-line"}`}>
      <div className={`-mb-px -mr-px grid ${cols}`}>
        {tiles.map((t) => (
          <div key={t.label} className="flex flex-col gap-1 border-b border-r border-line bg-paper px-3.5 py-2.5">
            <span className="text-[10px] font-bold uppercase leading-tight tracking-[0.12em] text-mute2">{t.label}</span>
            <span className={`font-display ${ink ? "text-[24px]" : "text-[20px]"} leading-none ${t.rust ? "text-accent" : "text-ink"}`}>{t.value}</span>
            {t.hint ? <span className="text-[11.5px] text-mute">{t.hint}</span> : null}
          </div>
        ))}
      </div>
    </section>
  );
}

export function SectionTitle({ children, id }: { children: React.ReactNode; id?: string }) {
  return <h2 id={id} className="text-[11px] font-bold uppercase tracking-[0.13em] text-mute">{children}</h2>;
}
