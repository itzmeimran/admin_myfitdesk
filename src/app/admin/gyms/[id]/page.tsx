import { notFound } from "next/navigation";
import { createClient } from "@/core/db/server-client";
import { getGymOverview } from "@/features/gyms/overview";
import { getGymMemberSummary } from "@/features/gyms/members";
import { getNotes, getOpsSummary, getTimeline } from "@/features/gyms/ops/queries";
import { getGymTrend } from "@/features/gyms/trend";
import { getGymCached } from "./get-gym";
import { OverviewView, type Loaded } from "./overview-view";

/** One block failing must not take the page down: each read resolves to data or an error. */
function settle<T>(promise: Promise<T>, fallback: string): Promise<Loaded<T>> {
  return promise
    .then((data) => ({ data, error: null }))
    .catch((error: unknown) => ({ data: null, error: error instanceof Error ? error.message : fallback }));
}

export default async function GymOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [gym, overview, ops, members, notes, trend, activity] = await Promise.all([
    getGymCached(id),
    settle(getGymOverview(supabase, id), "Overview unavailable"),
    settle(getOpsSummary(supabase, id), "Operational status unavailable"),
    settle(getGymMemberSummary(supabase, id), "Member summary unavailable"),
    settle(getNotes(supabase, id), "Notes unavailable"),
    settle(getGymTrend(supabase, id), "Trend unavailable"),
    settle(getTimeline(supabase, id, {}, 5, 0, { groupByMember: true }), "Activity unavailable"),
  ]);
  if (!gym) notFound();

  return (
    <OverviewView gym={gym} overview={overview} ops={ops} members={members} notes={notes} trend={trend} activity={activity} now={new Date()} />
  );
}
