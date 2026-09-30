import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/core/db/database.types";
import { loose } from "@/core/db/loose-client";
import { loaded, loadedFailure, type Loaded } from "./rpc-result";

/** Settings → System. Database facts come from admin_system_info() /
 * admin_cron_health(); build facts come from the deployment's own environment
 * (Vercel sets these at build time) — absent locally, in which case the UI says
 * "not available" instead of inventing a value. */

export type SystemInfo = {
  environment: string | null;
  databaseIdentifier: string | null;
  maintenanceMode: boolean;
  postgresVersion: string;
  serverTime: string;
  cronAvailable: boolean;
  openCriticalAlerts: number;
  billingModel: string | null;
};

export async function getSystemInfo(supabase: SupabaseClient<Database>): Promise<Loaded<SystemInfo>> {
  const { data, error } = await loose(supabase).rpc("admin_system_info");
  if (error) return loadedFailure(error);
  const raw = data as Record<string, unknown>;
  return loaded({
    environment: (raw.environment as string | null) ?? null,
    databaseIdentifier: (raw.database_identifier as string | null) ?? null,
    maintenanceMode: Boolean(raw.maintenance_mode),
    postgresVersion: String(raw.postgres_version ?? ""),
    serverTime: String(raw.server_time ?? ""),
    cronAvailable: Boolean(raw.cron_available),
    openCriticalAlerts: Number(raw.open_critical_alerts ?? 0),
    billingModel: (raw.billing_model as string | null) ?? null,
  });
}

export type CronJob = {
  name: string;
  schedule: string;
  active: boolean;
  lastRunAt: string | null;
  lastStatus: string | null;
  lastError: string | null;
  lastDurationMs: number | null;
  runs24h: number;
  failed24h: number;
};

export async function getCronHealth(supabase: SupabaseClient<Database>): Promise<Loaded<CronJob[]>> {
  const { data, error } = await loose(supabase).rpc("admin_cron_health");
  if (error) return loadedFailure(error);
  const rows = (data ?? []) as {
    job_name: string;
    job_schedule: string;
    job_active: boolean;
    last_run_at: string | null;
    last_status: string | null;
    last_error: string | null;
    last_duration_ms: number | null;
    runs_24h: number;
    failed_24h: number;
  }[];
  return loaded(
    rows.map((row) => ({
      name: row.job_name,
      schedule: row.job_schedule,
      active: row.job_active,
      lastRunAt: row.last_run_at,
      lastStatus: row.last_status,
      lastError: row.last_error,
      lastDurationMs: row.last_duration_ms === null ? null : Number(row.last_duration_ms),
      runs24h: Number(row.runs_24h),
      failed24h: Number(row.failed_24h),
    })),
  );
}

export type BuildInfo = {
  commit: string | null;
  branch: string | null;
  vercelEnvironment: string | null;
  region: string | null;
  nodeVersion: string;
};

export function getBuildInfo(): BuildInfo {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA?.trim();
  return {
    commit: sha ? sha.slice(0, 7) : null,
    branch: process.env.VERCEL_GIT_COMMIT_REF?.trim() || null,
    vercelEnvironment: process.env.VERCEL_ENV?.trim() || null,
    region: process.env.VERCEL_REGION?.trim() || null,
    nodeVersion: process.version,
  };
}
