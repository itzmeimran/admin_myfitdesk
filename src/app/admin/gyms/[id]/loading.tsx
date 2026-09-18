import { SkeletonBlock, SkeletonTiles, SkeletonTable } from "@/components/Skeleton";

/**
 * Shared fallback for every Gym Detail tab (Overview/Members/Branches &
 * Team/Subscription & Billing/Activity) — this file sits at the `[id]`
 * segment, one level above the tab subfolders, so Next.js reuses it as the
 * Suspense boundary for `layout.tsx`'s `{children}` slot on every tab
 * switch, not just the first load of a gym's page. One file covers all six
 * tabs rather than duplicating this per tab folder.
 */
export default function GymDetailLoading() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <SkeletonBlock className="h-12 w-12 flex-shrink-0" />
        <div className="flex flex-1 flex-col gap-2">
          <SkeletonBlock className="h-[18px] w-[200px]" />
          <SkeletonBlock className="h-[11px] w-[280px]" />
        </div>
      </div>
      <SkeletonTiles count={4} />
      <SkeletonTable rows={6} cols={5} />
    </div>
  );
}
