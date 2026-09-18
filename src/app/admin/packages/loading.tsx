import { SkeletonPageHeader, SkeletonBlock } from "@/components/Skeleton";

export default function PackageLoading() {
  return (
    <div className="flex flex-col gap-5">
      <SkeletonPageHeader />
      <div className="skeleton-shimmer h-[64px] w-full border-[1.5px] border-line" />
      <div className="flex flex-col gap-3 border-[1.5px] border-line bg-paper p-4">
        <SkeletonBlock className="h-[16px] w-[160px]" />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <SkeletonBlock className="h-[70px] w-full" />
          <SkeletonBlock className="h-[70px] w-full" />
          <SkeletonBlock className="h-[70px] w-full" />
        </div>
        <SkeletonBlock className="h-[100px] w-full" />
      </div>
    </div>
  );
}
