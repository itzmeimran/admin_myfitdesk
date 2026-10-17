import { SkeletonBlock } from "@/components/Skeleton";

export function DeletionRecordsSkeleton() {
  return <div role="status" aria-busy="true" aria-label="Loading gym deletion records" className="flex min-w-0 flex-col gap-4">
    <span className="sr-only">Loading gym deletion records…</span>
    <div className="flex flex-wrap gap-2">
      {[0, 1, 2].map(i => <SkeletonBlock key={i} className="h-9 w-44 max-w-full" />)}
    </div>
    <SkeletonBlock className="h-4 w-full" />
    {[0, 1, 2].map(i => <div key={i} className="flex flex-col gap-3 border-[1.5px] border-line bg-paper p-4">
      <SkeletonBlock className="h-5 w-44 max-w-full" />
      <SkeletonBlock className="h-3 w-72 max-w-full" />
      <SkeletonBlock className="h-3 w-full" />
      <div className="grid gap-3 md:grid-cols-3">{[0, 1, 2].map(stage => <SkeletonBlock key={stage} className="h-28 w-full" />)}</div>
    </div>)}
  </div>;
}
