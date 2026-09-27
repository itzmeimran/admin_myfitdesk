import { SkeletonAdminPage } from "@/components/Skeleton";

export default function DisasterRecoveryLoading() {
  return <SkeletonAdminPage tiles={4} tableRows={7} tableCols={6} />;
}
