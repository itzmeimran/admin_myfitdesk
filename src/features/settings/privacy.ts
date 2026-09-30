import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/core/db/database.types";
import { loose } from "@/core/db/loose-client";
import { loaded, loadedFailure, type Loaded } from "./rpc-result";

/**
 * Settings → Data & Privacy. Only retention that is REALLY enforced is
 * editable: API request telemetry is pruned daily by the api-metrics-prune
 * cron using api_monitor_settings, which admin_update_api_retention() changes.
 * The rest of the page states facts about how the platform already behaves.
 */

export type DataPolicy = {
  apiRawRetentionDays: number;
  apiHourlyRetentionDays: number;
  apiSettingsUpdatedAt: string | null;
};

export async function getDataPolicy(supabase: SupabaseClient<Database>): Promise<Loaded<DataPolicy | null>> {
  const { data, error } = await loose(supabase).rpc("admin_get_data_policy");
  if (error) return loadedFailure(error);
  if (!data) return loaded(null);
  const raw = data as Record<string, unknown>;
  return loaded({
    apiRawRetentionDays: Number(raw.api_raw_retention_days),
    apiHourlyRetentionDays: Number(raw.api_hourly_retention_days),
    apiSettingsUpdatedAt: (raw.api_settings_updated_at as string | null) ?? null,
  });
}
