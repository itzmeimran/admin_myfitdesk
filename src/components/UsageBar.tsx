const ACCENT = "var(--accent)";
const INK = "var(--ink)";

/** Shared usage-vs-cap bar: a number line ("16 / 300") plus a filled track,
 * turning accent-colored at ≥90% of cap — same rule the Gyms list already
 * applied inline (usageTone) before this was extracted so the Gym Detail
 * Overview tab could reuse it exactly rather than re-deriving the rule.
 * Renders nothing misleading for an uncapped resource: no "N / ∞" text, no
 * bar, just the plain count and a "No cap on this plan" caption — the
 * brief is explicit that a meaningless 0/∞ shouldn't be shown as if it were
 * a real ratio. */
export function UsageBar({ label, used, cap }: { label: string; used: number; cap: number | null }) {
  if (cap === null) {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-baseline justify-between text-[12px]">
          <span className="text-mute">{label}</span>
          <span className="font-bold text-ink">{used.toLocaleString("en-IN")}</span>
        </div>
        <span className="text-[10.5px] text-mute3">No cap on this plan</span>
      </div>
    );
  }

  const pct = cap > 0 ? Math.round((used / cap) * 100) : 0;
  const tone = pct >= 90 ? ACCENT : INK;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between text-[12px]">
        <span className="text-mute">{label}</span>
        <span className="font-bold" style={{ color: tone }}>
          {used.toLocaleString("en-IN")} / {cap.toLocaleString("en-IN")}
        </span>
      </div>
      <span className="block h-[7px] w-full bg-sand">
        <span className="block h-[7px]" style={{ width: `${Math.min(pct, 100)}%`, background: tone }} />
      </span>
      <span className="text-[10.5px] text-mute3">{pct}% of plan cap</span>
    </div>
  );
}
