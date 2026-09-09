import { isGymFilter } from "@/features/gyms/mock-data";
import { getGymsDirectory, listAssignablePackages } from "@/features/gyms/queries";
import { createClient } from "@/core/db/server-client";
import { GymsView } from "./gyms-view";

/**
 * Server Component reading the real directory (src/features/gyms/queries.ts)
 * via public.admin_gym_directory() — see that RPC's definition in
 * supabase/migrations/1002_admin_read_functions.sql for the platform-plane/
 * tenant-plane access boundary it enforces.
 *
 * `?filter=` arrives from Overview's attention-band / accounts-at-risk
 * links (e.g. "Chase renewals" → /admin/gyms?filter=Grace) — the design's
 * own `a.act` closures set both `screen` and `filter` state together; here
 * that's just two things one link can express (a route plus a query param)
 * instead of one shared component-state object.
 */
export default async function GymsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter } = await searchParams;
  const supabase = await createClient();
  const [{ gyms, summary }, packages] = await Promise.all([
    getGymsDirectory(supabase),
    listAssignablePackages(supabase),
  ]);

  return (
    <GymsView gyms={gyms} packages={packages} summary={summary} initialFilter={isGymFilter(filter) ? filter : "All"} />
  );
}
