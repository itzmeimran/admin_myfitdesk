import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/core/db/database.types";
import type { Thresholds } from "./format";
import type { ApiEnvFilter, ApiRange } from "./params";

type Client = SupabaseClient<Database>;

/** Every read goes through an admin-gated SECURITY DEFINER RPC — the
 * telemetry tables themselves are service-role-only (see migration
 * 20260930140000_api_performance.sql). */

export type RouteStat = { route: string; method: string; n: number; p95: number | null };

export type ApiOverview = {
  range: ApiRange;
  from: string;
  step_seconds: number;
  thresholds: Thresholds;
  kpis: {
    total: number;
    rpm: number;
    avg_ms: number | null;
    p50_ms: number | null;
    p95_ms: number | null;
    p99_ms: number | null;
    max_ms: number | null;
    successful: number;
    client_errors: number;
    failed: number;
    error_rate_pct: number | null;
    slow: number;
    very_slow: number;
  };
  mix: { fast: number; acceptable: number; slow: number; very_slow: number };
  series: { t: string; n: number; errors: number; avg: number | null; p95: number | null }[];
  slowest: RouteStat[];
  most_requested: RouteStat[];
};

export type ApiAlert = {
  type: "high_p95" | "very_slow" | "error_rate" | "repeated_5xx" | "unusual_traffic";
  severity: "critical" | "warning" | "info";
  route: string;
  method: string;
  message: string;
  value: number;
};
export type ApiDuplicate = {
  route: string;
  method: string;
  organization_id: string | null;
  organization_name: string | null;
  count: number;
  at: string;
  window_seconds: number;
};
export type ApiAlerts = { alerts: ApiAlert[]; duplicates: ApiDuplicate[] };

export type RequestDetail = {
  request_id: string;
  occurred_at: string;
  environment: string;
  route: string;
  method: string;
  status: number;
  duration_ms: number;
  organization_id: string | null;
  organization_name: string | null;
  error_type: string | null;
  error_message: string | null;
  supabase: null | {
    calls: number;
    total_ms: number;
    auth_calls: number;
    auth_ms: number;
    failed_calls: number;
    slowest: { api: string; operation: string; resource: string; duration_ms: number; status: number | null }[];
  };
};

type Scope = { range: ApiRange; env: ApiEnvFilter; org?: string };

/** Gym names for the organization filter. `organizations` has an admin-gated
 * read policy (migration 1002), so this is the ordinary RLS-scoped client. */
export async function listOrgOptions(supabase: Client): Promise<{ value: string; label: string }[]> {
  const { data, error } = await supabase.from("organizations").select("id, name").order("name").limit(500);
  if (error) throw new Error(`Failed to load gyms: ${error.message}`);
  return (data ?? []).map((o) => ({ value: o.id, label: o.name }));
}

function fail(what: string, message: string): never {
  throw new Error(`Failed to load ${what}: ${message}`);
}

export async function getApiOverview(
  supabase: Client,
  scope: Scope & { route?: string; method?: string },
): Promise<ApiOverview> {
  const { data, error } = await supabase.rpc("admin_api_overview", {
    p_range: scope.range,
    p_env: scope.env,
    p_org: scope.org,
    p_route: scope.route,
    p_method: scope.method,
  });
  if (error) fail("API overview", error.message);
  return data as unknown as ApiOverview;
}

export async function getApiAlerts(supabase: Client, env: ApiEnvFilter): Promise<ApiAlerts> {
  const { data, error } = await supabase.rpc("admin_api_alerts", { p_env: env });
  if (error) fail("API alerts", error.message);
  return data as unknown as ApiAlerts;
}

export type EndpointRow = {
  route: string;
  method: string;
  n: number;
  avgMs: number | null;
  p50Ms: number | null;
  p95Ms: number | null;
  maxMs: number | null;
  errors: number;
  errorRate: number | null;
  slowN: number;
};

export async function listEndpoints(
  supabase: Client,
  args: Scope & {
    method?: string;
    status?: number;
    search?: string;
    sort: string;
    dir: "asc" | "desc";
    limit: number;
    offset: number;
  },
): Promise<{ rows: EndpointRow[]; total: number }> {
  const { data, error } = await supabase.rpc("admin_api_endpoints", {
    p_range: args.range,
    p_env: args.env,
    p_org: args.org,
    p_method: args.method,
    p_status: args.status,
    p_search: args.search,
    p_sort: args.sort,
    p_dir: args.dir,
    p_limit: args.limit,
    p_offset: args.offset,
  });
  if (error) fail("endpoints", error.message);
  const rows = data ?? [];
  return {
    total: rows[0]?.total_count ?? 0,
    rows: rows.map((r) => ({
      route: r.route,
      method: r.method,
      n: r.n,
      avgMs: r.avg_ms,
      p50Ms: r.p50_ms,
      p95Ms: r.p95_ms,
      maxMs: r.max_ms,
      errors: r.errors,
      errorRate: r.error_rate,
      slowN: r.slow_n,
    })),
  };
}

export type RequestRow = {
  requestId: string;
  occurredAt: string;
  route: string;
  method: string;
  status: number;
  durationMs: number;
  organizationId: string | null;
  organizationName: string | null;
  environment: string;
  errorType: string | null;
};

export async function listRequests(
  supabase: Client,
  args: Scope & {
    request?: string;
    route?: string;
    routeExact?: boolean;
    status?: number;
    minStatus?: number;
    method?: string;
    minMs?: number;
    sort?: "time" | "duration";
    limit: number;
    offset: number;
  },
): Promise<{ rows: RequestRow[]; total: number }> {
  const { data, error } = await supabase.rpc("admin_api_requests", {
    p_range: args.range,
    p_env: args.env,
    p_request: args.request,
    p_route: args.route,
    p_route_exact: args.routeExact,
    p_org: args.org,
    p_status: args.status,
    p_min_status: args.minStatus,
    p_method: args.method,
    p_min_ms: args.minMs,
    p_sort: args.sort,
    p_limit: args.limit,
    p_offset: args.offset,
  });
  if (error) fail("requests", error.message);
  const rows = data ?? [];
  return {
    total: rows[0]?.total_count ?? 0,
    rows: rows.map((r) => ({
      requestId: r.request_id,
      occurredAt: r.occurred_at,
      route: r.route,
      method: r.method,
      status: r.status,
      durationMs: Number(r.duration_ms),
      organizationId: r.organization_id,
      organizationName: r.organization_name,
      environment: r.environment,
      errorType: r.error_type,
    })),
  };
}

export async function getRequestDetail(supabase: Client, requestId: string): Promise<RequestDetail | null> {
  const { data, error } = await supabase.rpc("admin_api_request_detail", { p_request_id: requestId });
  if (error) fail("request", error.message);
  return (data as unknown as RequestDetail | null) ?? null;
}

export type ErrorGroup = {
  route: string;
  method: string;
  status: number;
  errorType: string;
  sampleMessage: string | null;
  occurrences: number;
  lastAt: string;
  orgCount: number;
  organizationId: string | null;
  organizationName: string | null;
};

export async function listErrors(
  supabase: Client,
  args: Scope & { search?: string; minStatus: number; limit: number; offset: number },
): Promise<{ rows: ErrorGroup[]; total: number }> {
  const { data, error } = await supabase.rpc("admin_api_errors", {
    p_range: args.range,
    p_env: args.env,
    p_org: args.org,
    p_search: args.search,
    p_min_status: args.minStatus,
    p_limit: args.limit,
    p_offset: args.offset,
  });
  if (error) fail("errors", error.message);
  const rows = data ?? [];
  return {
    total: rows[0]?.total_count ?? 0,
    rows: rows.map((r) => ({
      route: r.route,
      method: r.method,
      status: r.status,
      errorType: r.error_type,
      sampleMessage: r.sample_message,
      occurrences: r.occurrences,
      lastAt: r.last_at,
      orgCount: r.org_count,
      organizationId: r.organization_id,
      organizationName: r.organization_name,
    })),
  };
}

export type OrgUsageRow = {
  organizationId: string | null;
  organizationName: string | null;
  n: number;
  avgMs: number | null;
  p95Ms: number | null;
  maxMs: number | null;
  errors: number;
  errorRate: number | null;
};

export async function listOrgUsage(
  supabase: Client,
  args: Omit<Scope, "org"> & { search?: string; sort: string; dir: "asc" | "desc"; limit: number; offset: number },
): Promise<{ rows: OrgUsageRow[]; total: number }> {
  const { data, error } = await supabase.rpc("admin_api_organizations", {
    p_range: args.range,
    p_env: args.env,
    p_search: args.search,
    p_sort: args.sort,
    p_dir: args.dir,
    p_limit: args.limit,
    p_offset: args.offset,
  });
  if (error) fail("organization usage", error.message);
  const rows = data ?? [];
  return {
    total: rows[0]?.total_count ?? 0,
    rows: rows.map((r) => ({
      organizationId: r.organization_id,
      organizationName: r.organization_name,
      n: r.n,
      avgMs: r.avg_ms,
      p95Ms: r.p95_ms,
      maxMs: r.max_ms,
      errors: r.errors,
      errorRate: r.error_rate,
    })),
  };
}
