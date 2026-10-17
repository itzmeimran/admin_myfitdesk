import { SkeletonPageHeader, SkeletonTable, SkeletonCards } from "@/components/Skeleton";

export default function GymsLoading() {
  return (
    <div role="status" aria-label="Loading gyms" className="flex min-w-0 flex-col gap-5 [&>div]:max-w-full">
      <span className="sr-only">Loading gyms…</span>
      <SkeletonPageHeader />
      <div className="flex flex-wrap gap-2.5">
        <div className="skeleton-shimmer h-[38px] w-[220px] border-[1.5px] border-line" />
        <div className="skeleton-shimmer h-[38px] w-[140px] border-[1.5px] border-line" />
        <div className="skeleton-shimmer h-[38px] w-[140px] border-[1.5px] border-line" />
      </div>
      <div className="hidden md:block"><SkeletonTable rows={8} cols={8} /></div>
      <div className="md:hidden"><SkeletonCards count={3} /></div>
    </div>
  );
}
