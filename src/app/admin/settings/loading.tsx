import { SkeletonPageHeader, SkeletonBlock, SkeletonTable } from "@/components/Skeleton";

export default function SettingsLoading() {
  return (
    <div className="flex flex-col gap-6">
      <SkeletonPageHeader />
      <div className="flex flex-col gap-3 border-[1.5px] border-line bg-paper p-4">
        <SkeletonBlock className="h-[14px] w-[160px]" />
        <SkeletonBlock className="h-[44px] w-full max-w-[360px]" />
      </div>
      <SkeletonBlock className="h-[64px] w-full" />
      <SkeletonTable rows={4} cols={5} />
    </div>
  );
}
