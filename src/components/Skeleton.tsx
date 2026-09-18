/**
 * Shared loading-state primitives for every `loading.tsx` under
 * `src/app/admin/**`. Task requirement: navigating between admin tabs/pages
 * (and switching the DEV/PROD environment, which forces every page to
 * re-fetch against the newly-selected project) must never show an empty,
 * stale, or partially-wrong screen while the new data loads — Next.js's
 * `loading.tsx` convention renders these as a Suspense fallback the instant
 * navigation starts, replacing the previous route's content immediately
 * rather than leaving it on screen until the new data arrives.
 *
 * `skeleton-shimmer` (globals.css) was already defined for this purpose but
 * never wired to anything — these are its first real use.
 */

export function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`skeleton-shimmer border-[1.5px] border-line ${className}`} />;
}

/** Matches every admin page's `<h1>` + one-line subtitle header shape. */
export function SkeletonPageHeader({ withSubtitle = true }: { withSubtitle?: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      <SkeletonBlock className="h-[26px] w-[220px]" />
      {withSubtitle ? <SkeletonBlock className="h-[13px] w-[340px]" /> : null}
    </div>
  );
}

/** KPI tile row (Overview's 5 tiles, Revenue's tiles, etc.). */
export function SkeletonTiles({ count = 5 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex flex-col gap-2.5 border-[1.5px] border-line bg-paper p-3.5">
          <SkeletonBlock className="h-[10px] w-16" />
          <SkeletonBlock className="h-[22px] w-20" />
        </div>
      ))}
    </div>
  );
}

/** A bordered table with a header row and N shimmering body rows — the
 * shape every list page (Gyms, Revenue invoices, admin roster, audit log)
 * resolves to. */
export function SkeletonTable({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="overflow-hidden border-[1.5px] border-line">
      <div className="flex gap-4 border-b-[1.5px] border-line bg-sand px-3 py-2.5">
        {Array.from({ length: cols }).map((_, i) => (
          <SkeletonBlock key={i} className="h-[10px] flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4 border-b border-line px-3 py-3 last:border-b-0">
          {Array.from({ length: cols }).map((_, c) => (
            <SkeletonBlock key={c} className="h-[13px] flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

/** A grid of card-shaped placeholders — packages, branches, gym cards. */
export function SkeletonCards({ count = 3 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex flex-col gap-3 border-[1.5px] border-line bg-paper p-4">
          <SkeletonBlock className="h-[14px] w-2/3" />
          <SkeletonBlock className="h-[10px] w-1/2" />
          <SkeletonBlock className="h-[30px] w-full" />
        </div>
      ))}
    </div>
  );
}

/** Generic full-page skeleton: header + tiles + table — the shape most
 * admin pages share. Individual `loading.tsx` files compose the pieces
 * above directly when a page's real shape differs (Settings' form layout,
 * Packages' pricing card). */
export function SkeletonAdminPage({ tiles = 5, tableRows = 6, tableCols = 5 }: {
  tiles?: number;
  tableRows?: number;
  tableCols?: number;
}) {
  return (
    <div className="flex flex-col gap-6">
      <SkeletonPageHeader />
      <SkeletonTiles count={tiles} />
      <SkeletonTable rows={tableRows} cols={tableCols} />
    </div>
  );
}
