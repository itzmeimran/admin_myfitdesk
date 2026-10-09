import { SkeletonBlock } from "@/components/Skeleton";

export default function ActivityLoading() {
  return <div role="status" aria-label="Loading activity" className="flex min-w-0 flex-col gap-3">
    <span className="sr-only">Loading activity…</span>
    <SkeletonBlock className="h-10 w-full" />
    <SkeletonBlock className="h-20 w-full" />
    {[0, 1, 2, 3].map(i => <SkeletonBlock key={i} className="h-32 w-full" />)}
  </div>;
}
