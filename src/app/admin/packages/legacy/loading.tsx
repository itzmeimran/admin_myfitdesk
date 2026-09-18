import { SkeletonPageHeader, SkeletonCards } from "@/components/Skeleton";

export default function LegacyPackagesLoading() {
  return (
    <div className="flex flex-col gap-5">
      <SkeletonPageHeader />
      <div className="skeleton-shimmer h-[38px] w-[220px] border-[1.5px] border-line" />
      <SkeletonCards count={3} />
    </div>
  );
}
