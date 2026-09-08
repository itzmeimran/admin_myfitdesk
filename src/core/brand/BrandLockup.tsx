/** Copied verbatim from FitDeskApp/src/core/brand/BrandLockup.tsx — same
 * mark, same product, same "Clay & Rust" tokens. */
export function BrandLockup({ className = "" }: { className?: string }) {
  return (
    <div role="img" aria-label="MyFitDesk" className={`flex items-center gap-2.5 ${className}`}>
      <svg viewBox="0 0 100 100" aria-hidden="true" className="h-7 w-7 shrink-0">
        <rect x="6" y="28" width="18" height="44" className="fill-paper" />
        <rect x="76" y="28" width="18" height="44" className="fill-paper" />
        <rect x="24" y="43" width="52" height="14" className="fill-accent" />
      </svg>
      <span aria-hidden="true" className="font-display text-xl tracking-[-0.01em]">
        <span className="text-paper">MYFIT</span>
        <span className="text-accent">DESK</span>
      </span>
    </div>
  );
}
