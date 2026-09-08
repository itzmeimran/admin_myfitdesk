import { ATTENTION, TILES, MIX, RISK, LIMITS, SIGNUPS, HEALTH, trendBars } from "@/features/overview/mock-data";
import { OverviewView } from "./overview-view";

/**
 * Server Component reading the mock-data module — swapping these array
 * imports for real `src/features/overview/queries.ts` reads is the only
 * change this page needs later (see design-audit.md's Data mapping
 * section, condensed again in mock-data.ts's own docblock).
 *
 * The design's loading/empty/error states are gated on a canvas-authoring
 * "data state" toggle (`isLoading`/`isEmpty`/`isError`, scoped to
 * screen === "overview") that exists only to demo those states in the
 * design tool — there's no real async fetch here yet to be loading, empty
 * or erroring, so this always renders the populated view. Per
 * design-audit.md's cross-page notes, wiring real loading/empty/error
 * handling is new work beyond what the design demonstrates, for whenever
 * this page reads from Supabase instead.
 */
export default function OverviewPage() {
  return (
    <OverviewView
      attention={ATTENTION}
      tiles={TILES}
      mix={MIX}
      risk={RISK}
      limits={LIMITS}
      signups={SIGNUPS}
      health={HEALTH}
      trend={trendBars()}
    />
  );
}
