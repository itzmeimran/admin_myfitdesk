import { SkeletonTable, SkeletonTiles } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <SkeletonTiles count={6} />
      <SkeletonTable rows={6} cols={6} />
    </div>
  );
}
