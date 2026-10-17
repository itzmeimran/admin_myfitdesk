import "server-only";
import { getAdminAccess, hasPermission } from "@/core/auth/access";
import { createServiceClient } from "@/core/db/service-client";
import { loose } from "@/core/db/loose-client";
import { DAY_MS } from "@/core/dates/ist";
import type { WebhookTelemetry } from "@/features/overview/model";

/** The existing billing RPC only counts OK/signature-failed events. A zero
 * from it cannot establish zero total events (processing failures are omitted).
 * Only privileged, server-side HEAD counts are returned, never webhook bodies. */
export async function getOverviewMonitoring(now = new Date()): Promise<WebhookTelemetry | null> {
  const access = await getAdminAccess();
  if (!hasPermission(access, "revenue.view")) return null;
  try {
    const db = loose(await createServiceClient());
    const since = new Date(+now - DAY_MS).toISOString();
    const query = () => db.from("payment_provider_events").select("id", { count: "exact", head: true }).gte("received_at", since).lte("received_at", now.toISOString());
    const [total, signatureFailures, processingFailures] = await Promise.all([query(), query().eq("signature_verified", false), query().not("processing_error", "is", null)]);
    if (total.error || signatureFailures.error || processingFailures.error || total.count === null || signatureFailures.count === null || processingFailures.count === null) return null;
    return { total: total.count, signatureFailures: signatureFailures.count, processingFailures: processingFailures.count };
  } catch { return null; }
}
