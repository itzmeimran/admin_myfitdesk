import { SkeletonAdminPage } from "@/components/Skeleton";

/**
 * Root fallback for the whole `/admin/*` tree — covers the very first load
 * of the admin shell (layout.tsx's own auth + chrome-counts fetch) and acts
 * as the last-resort boundary for any nested route that doesn't define its
 * own more specific `loading.tsx`. Every real page under `/admin` has its
 * own tailored loading.tsx below this one, which Next.js prefers when
 * present.
 */
export default function AdminLoading() {
  return <SkeletonAdminPage />;
}
