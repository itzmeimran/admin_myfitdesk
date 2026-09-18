import { SkeletonPageHeader, SkeletonTable } from "@/components/Skeleton";

export default function GymsLoading() {
  return (
    <div className="flex flex-col gap-5">
      <SkeletonPageHeader />
      <div className="flex flex-wrap gap-2.5">
        <div className="skeleton-shimmer h-[38px] w-[220px] border-[1.5px] border-line" />
        <div className="skeleton-shimmer h-[38px] w-[140px] border-[1.5px] border-line" />
        <div className="skeleton-shimmer h-[38px] w-[140px] border-[1.5px] border-line" />
      </div>
      <SkeletonTable rows={8} cols={7} />
    </div>
  );
}
