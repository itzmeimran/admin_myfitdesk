import { Suspense } from "react";
import { ButtonLink } from "@/components/ButtonLink";
import { parsePagination } from "@/components/Pagination";
import { BackIcon } from "@/core/ui/icons";
import type { DeletionView } from "./_server/queries";
import { DeletionRecords } from "./records";
import { DeletionRecordsSkeleton } from "./skeleton";

export default async function GymDeletionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const requestedView = Array.isArray(sp.view) ? sp.view[0] : sp.view;
  const view: DeletionView = requestedView === "jobs" || requestedView === "deleted" ? requestedView : "pending";
  const { page, pageSize } = parsePagination(sp);
  return <div className="flex flex-col gap-4">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-xl">Gym deletions</h1>
        <p className="mt-1 text-[13px] text-mute">Pending requests, automatic cleanup and earlier database deletions. All dates are IST.</p>
      </div>
      <ButtonLink href="/admin/gyms" icon={BackIcon} variant="secondary">Back to gyms</ButtonLink>
    </div>
    <Suspense key={`${view}:${page}:${pageSize}`} fallback={<DeletionRecordsSkeleton />}>
      <DeletionRecords view={view} searchParams={sp} />
    </Suspense>
  </div>;
}
