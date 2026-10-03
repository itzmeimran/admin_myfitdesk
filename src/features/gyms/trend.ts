import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/core/db/database.types";
import type { GymTrend, TrendPoint } from "./trend-types";

type RawPoint = { at: string; pay_minor: number; txn: number; mem: number };
type RawTrend = { daily: RawPoint[]; hourly: RawPoint[] };

const toPoint = (p: RawPoint): TrendPoint => ({
  at: p.at,
  payMinor: Number(p.pay_minor),
  txn: Number(p.txn),
  mem: Number(p.mem),
});

/** Dense per-day (60) and per-hour (48) payment/enrolment series for one gym,
 * from the admin-gated `admin_gym_trend` RPC (aggregates only, never rows). */
export async function getGymTrend(
  supabase: SupabaseClient<Database>,
  organizationId: string,
): Promise<GymTrend> {
  const { data, error } = await supabase.rpc("admin_gym_trend", { p_organization_id: organizationId });
  if (error) throw new Error(`Failed to load the gym trend: ${error.message}`);
  const raw = (Array.isArray(data) ? data[0] : data) as RawTrend | null;
  if (!raw) throw new Error("The gym trend returned no data.");
  return { daily: (raw.daily ?? []).map(toPoint), hourly: (raw.hourly ?? []).map(toPoint) };
}
