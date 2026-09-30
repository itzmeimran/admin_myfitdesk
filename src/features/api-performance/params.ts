import type { AdminEnvironment } from "@/core/config/environments";

export const RANGES = [
  { value: "15m", label: "15 min" },
  { value: "1h", label: "1 hour" },
  { value: "24h", label: "24 hours" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
] as const;
export type ApiRange = (typeof RANGES)[number]["value"];
export const DEFAULT_RANGE: ApiRange = "24h";

export const ENVIRONMENTS = [
  { value: "production", label: "Production" },
  { value: "preview", label: "Preview" },
  { value: "development", label: "Development" },
  { value: "all", label: "All" },
] as const;
export type ApiEnvFilter = (typeof ENVIRONMENTS)[number]["value"];

export const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

export type RawSearchParams = Record<string, string | string[] | undefined>;

export function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/**
 * Production is the default when the admin panel is pointed at the PROD
 * Supabase project (the whole point of watching it); pointed at DEV there is
 * usually no production traffic, so the default widens to "all".
 * DEV and PROD are separate projects with separate telemetry either way —
 * this filter only separates production / preview / development rows that
 * share one project.
 */
export function parseApiParams(sp: RawSearchParams, adminEnvironment: AdminEnvironment) {
  const rawRange = first(sp.range);
  const range = (RANGES.find((r) => r.value === rawRange)?.value ?? DEFAULT_RANGE) as ApiRange;
  const rawEnv = first(sp.env);
  const env = (ENVIRONMENTS.find((e) => e.value === rawEnv)?.value ??
    (adminEnvironment === "prod" ? "production" : "all")) as ApiEnvFilter;
  return { range, env };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function uuidOrUndefined(v: string | undefined): string | undefined {
  return v && UUID_RE.test(v) ? v : undefined;
}

export function intOrUndefined(v: string | undefined): number | undefined {
  if (!v) return undefined;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : undefined;
}

/** Builds a same-section link that carries range/env (and any extras). */
export function withParams(
  pathname: string,
  current: RawSearchParams,
  overrides: Record<string, string | undefined>,
  keep: readonly string[] = ["range", "env"],
): string {
  const params = new URLSearchParams();
  for (const key of keep) {
    const v = first(current[key]);
    if (v) params.set(key, v);
  }
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined || v === "") params.delete(k);
    else params.set(k, v);
  }
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}
