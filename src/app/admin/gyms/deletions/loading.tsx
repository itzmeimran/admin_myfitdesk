import { SkeletonPageHeader } from "@/components/Skeleton";
import { DeletionRecordsSkeleton } from "./skeleton";

export default function GymDeletionsLoading() {
  return <div className="flex min-w-0 flex-col gap-4"><SkeletonPageHeader /><DeletionRecordsSkeleton /></div>;
}
