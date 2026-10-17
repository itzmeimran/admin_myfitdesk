import { getOverviewData, type OverviewPeriod } from "@/features/overview/queries";
import { createClient } from "@/core/db/server-client";
import { getAdminAccess, hasPermission } from "@/core/auth/access";
import { OverviewView } from "./overview-view";
import { getOverviewMonitoring } from "./_server/overview-monitoring";

export default async function OverviewPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const rawPeriod = Array.isArray(sp.period) ? sp.period[0] : sp.period;
  const period: OverviewPeriod = rawPeriod === "quarter" || rawPeriod === "year" ? rawPeriod : "month";
  const now = new Date();
  const [supabase, access, monitoring] = await Promise.all([createClient(), getAdminAccess(), getOverviewMonitoring(now)]);
  const data = await getOverviewData(supabase, period, monitoring, now);
  return <OverviewView data={data} searchParams={sp} permissions={{ gyms: hasPermission(access, "gyms.view"), revenue: hasPermission(access, "revenue.view"), packages: hasPermission(access, "packages.view") }} />;
}
