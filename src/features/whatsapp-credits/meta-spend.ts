import "server-only";
import { assertPermission } from "@/core/auth/access";
import { managedWhatsAppConfig } from "@/core/config/whatsapp";
import { getActiveAdminEnvironment } from "@/core/env/active-environment";
import { aggregateMetaPricing, spendSelection, type MetaPricingPoint, type MetaSpendReport } from "./meta-spend-logic";

/** WABA-wide pricing analytics includes OTPs and platform inbox sends that
 * aren't in the gym message table. Environment-specific credentials stay on the server. */
export async function getMetaSpending(params: { period?: string; from?: string; to?: string }): Promise<MetaSpendReport> {
  await assertPermission("whatsapp.view");
  const now = new Date();
  let selection = spendSelection(params, now);
  if (selection.error) return { status: "unavailable", selection, error: selection.error };
  const config = managedWhatsAppConfig(await getActiveAdminEnvironment());
  if (!config) return { status: "unavailable", selection, error: "Meta spending is not connected for this environment. Configure its managed WhatsApp account and analytics token." };
  async function graph(fields: string) {
    const url = new URL(`https://graph.facebook.com/${config!.version}/${config!.wabaId}`);
    url.searchParams.set("fields", fields);
    const response = await fetch(url, { headers: { Authorization: `Bearer ${config!.accessToken}` }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error("Meta spending could not be loaded. Check the account token's WhatsApp management and cost access, then refresh.");
    return response.json();
  }
  try {
    const account = await graph("name,currency,creation_time");
    if (typeof account.currency !== "string" || !/^[A-Z]{3}$/.test(account.currency) || !Number.isFinite(account.creation_time)) {
      throw new Error("Meta did not return the account currency and history. No spending total is shown.");
    }
    selection = spendSelection(params, now, account.creation_time);
    const oldest = new Date(now); oldest.setUTCFullYear(oldest.getUTCFullYear() - 1);
    if (Date.parse(selection.from) < oldest.getTime()) {
      throw new Error("Meta's analytics API only retains one year. This period includes older history, so a complete total requires the older Meta billing records. No partial lifetime total is shown.");
    }
    const start = Math.floor(Date.parse(selection.from) / 1000);
    const end = Math.floor(Date.parse(selection.to) / 1000);
    const payload = await graph(`pricing_analytics.start(${start}).end(${end}).granularity(DAILY).metric_types(["COST","VOLUME"]).dimensions(["PRICING_CATEGORY","PRICING_TYPE"])`);
    const blocks = payload.pricing_analytics?.data;
    if (!Array.isArray(blocks) || payload.pricing_analytics?.paging?.next || blocks.some((b: { data_points?: unknown; paging?: { next?: string } }) => !Array.isArray(b.data_points) || b.paging?.next)) {
      throw new Error("Meta did not return complete message cost data. No spending total is shown.");
    }
    const points: MetaPricingPoint[] = blocks.flatMap((b: { data_points: MetaPricingPoint[] }) => b.data_points);
    // Never silently include buckets outside the selected reporting dates.
    if (points.some(p => p.start < start || p.start >= end)) throw new Error("Meta returned costs outside the selected period. No spending total is shown.");
    return { status: "ready", selection, currency: account.currency, accountName: typeof account.name === "string" ? account.name : "Managed WhatsApp account",
      retrievedAt: new Date().toISOString(), totals: aggregateMetaPricing(points) };
  } catch (error) {
    return { status: "unavailable", selection, error: error instanceof Error && !/fetch|network|abort|timeout/i.test(error.message)
      ? error.message : "Meta is temporarily unavailable. Refresh to load its reported message spending." };
  }
}
