import { listGyms, isGymFilter } from "@/features/gyms/mock-data";
import { GymsView } from "./gyms-view";

/**
 * Server Component reading the mock-data module — swapping `listGyms()`
 * for a real `src/features/gyms/queries.ts` read is the only change this
 * page needs later (see design-audit.md's Data mapping section).
 *
 * `?filter=` arrives from Overview's attention-band / accounts-at-risk
 * links (goGyms with a filter, e.g. "Chase renewals" → /admin/gyms?filter=Grace)
 * — the design's own `a.act` closures set both `screen` and `filter` state
 * together; here that's just two things one link can express (a route plus
 * a query param) instead of one shared component-state object.
 */
export default async function GymsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter } = await searchParams;
  const gyms = await listGyms();

  return <GymsView gyms={gyms} initialFilter={isGymFilter(filter) ? filter : "All"} />;
}
