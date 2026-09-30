import { SkeletonBlock, SkeletonPageHeader } from "@/components/Skeleton";

/** Tab shell skeleton: header, the tab strip, then a card. Shown while any
 * Settings tab (or an environment switch) is loading its data. */
export default function SettingsLoading() {
  return (
    <div className="flex flex-col gap-5">
      <SkeletonPageHeader />
      <div className="flex gap-3 border-b-[1.5px] border-ink pb-2.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-[14px] w-[84px]" />
        ))}
      </div>
      <div className="flex flex-col gap-4 border-[1.5px] border-line bg-paper p-4 md:p-5">
        <SkeletonBlock className="h-[16px] w-[180px]" />
        <SkeletonBlock className="h-[13px] w-full max-w-[420px]" />
        <div className="grid gap-4 md:grid-cols-2">
          <SkeletonBlock className="h-[58px] w-full" />
          <SkeletonBlock className="h-[58px] w-full" />
          <SkeletonBlock className="h-[58px] w-full" />
          <SkeletonBlock className="h-[58px] w-full" />
        </div>
      </div>
    </div>
  );
}
