import { getOverviewData, type CustomRange, type OverviewPeriod } from "@/features/overview/queries";
import { createClient } from "@/core/db/server-client";
import { getAdminAccess, hasPermission } from "@/core/auth/access";
import { parseIstDay } from "@/core/dates/ist";
import { OverviewView } from "./overview-view";
import { getOverviewMonitoring } from "./_server/overview-monitoring";

const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

export default async function OverviewPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const rawPeriod = first(sp.period);
  // A custom period needs a real, ordered pair of days; anything else (a
  // hand-edited URL) quietly falls back to the current month.
  const from = parseIstDay(first(sp.start)), to = parseIstDay(first(sp.end));
  const custom: CustomRange | null = rawPeriod === "custom" && from && to && from <= to ? { from, to } : null;
  const period: OverviewPeriod = custom ? "custom" : rawPeriod === "quarter" || rawPeriod === "year" ? rawPeriod : "month";
  const now = new Date();
  const [supabase, access, monitoring] = await Promise.all([createClient(), getAdminAccess(), getOverviewMonitoring(now)]);
  const data = await getOverviewData(supabase, period, monitoring, now, custom);
  return <OverviewView data={data} permissions={{ gyms: hasPermission(access, "gyms.view"), revenue: hasPermission(access, "revenue.view"), packages: hasPermission(access, "packages.view") }} />;
}
