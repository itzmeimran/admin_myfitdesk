import { SkeletonAdminPage } from "@/components/Skeleton";

export default function RevenueLoading() {
  return <SkeletonAdminPage tiles={4} tableRows={8} tableCols={6} />;
}
