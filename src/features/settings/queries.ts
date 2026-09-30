import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/core/db/database.types";

/**
 * The global Legacy/Dynamic switch (supabase/migrations/1008_plans_schema_
 * and_rpcs.sql's platform_billing_settings singleton) — which catalogue
 * FitDeskApp's buyers currently see. Defaults to "legacy" on a database that
 * predates 1006, matching the RPC's own default. It is changed from the banner
 * on /admin/packages; Settings → System only displays it.
 *
 * (The admin roster that used to live here moved to ./admins.ts when Settings
 * became a full area.)
 */
export async function getBillingModel(supabase: SupabaseClient<Database>): Promise<"legacy" | "dynamic"> {
  const { data, error } = await supabase
    .from("platform_billing_settings")
    .select("billing_model")
    .eq("id", true)
    .maybeSingle();
  if (error) throw new Error(`Failed to load billing settings: ${error.message}`);

  return data?.billing_model === "dynamic" ? "dynamic" : "legacy";
}
