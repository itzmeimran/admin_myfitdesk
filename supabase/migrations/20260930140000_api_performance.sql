-- ═══════════════════════════════════════════════════════════════════════
-- Admin → API Performance monitoring
--
-- One row per monitored API request (route handler), written by the tenant
-- app's collector (FitDeskApp src/core/perf/api-monitor.ts) with the service
-- role, read ONLY through the admin_api_* RPCs below.
--
-- What is stored: timestamp, request id, ROUTE PATTERN (never the concrete
-- URL — /api/mobile/actions/[action], not the values), method, status,
-- duration, organization id, environment, error class + a scrubbed message,
-- and a 12-hex fingerprint used solely to spot duplicate bursts.
-- What is never stored: bodies, headers, cookies, tokens, query strings,
-- IPs, user ids.
--
-- Retention (see api_monitor_settings):
--   api_request_events   raw rows      7 days   (Request Explorer, Errors)
--   api_metrics_hourly   hourly rollup 90 days  (24h / 7d / 30d aggregates)
-- The rollup is recomputed every 5 minutes for the last 2 hours, so the
-- raw table can be pruned aggressively without losing trends.
--
-- Percentiles: latency histograms (29 fixed buckets) are stored per rollup
-- row and summed for any window, so P50/P95/P99 stay correct across many
-- rows. Values are interpolated inside a bucket — accurate to roughly the
-- bucket width (a few %–30% at the extremes), never exact per-request.
-- ═══════════════════════════════════════════════════════════════════════

-- ── Tables ────────────────────────────────────────────────────────────
create table if not exists public.api_request_events (
  id bigint generated always as identity primary key,
  request_id uuid not null,
  occurred_at timestamptz not null default now(),
  environment text not null default 'production'
    check (environment in ('production', 'preview', 'development')),
  route text not null check (length(route) <= 200),
  method text not null check (length(method) <= 10),
  status integer not null check (status between 100 and 599),
  duration_ms numeric(10, 2) not null check (duration_ms >= 0),
  organization_id uuid,
  error_type text check (length(error_type) <= 80),
  error_message text check (length(error_message) <= 300),
  fingerprint text check (length(fingerprint) <= 32)
);
create unique index if not exists api_request_events_request_id_key
  on public.api_request_events (request_id);
create index if not exists api_request_events_env_time_idx
  on public.api_request_events (environment, occurred_at desc);
create index if not exists api_request_events_route_time_idx
  on public.api_request_events (route, method, occurred_at desc);
create index if not exists api_request_events_org_time_idx
  on public.api_request_events (organization_id, occurred_at desc) where organization_id is not null;
create index if not exists api_request_events_errors_idx
  on public.api_request_events (occurred_at desc) where status >= 400;
create index if not exists api_request_events_time_idx
  on public.api_request_events (occurred_at);

create table if not exists public.api_metrics_hourly (
  bucket timestamptz not null,
  environment text not null,
  route text not null,
  method text not null,
  -- nil uuid = "no organization" (primary keys cannot contain NULL)
  organization_id uuid not null default '00000000-0000-0000-0000-000000000000',
  status integer not null,
  n bigint not null,
  sum_ms double precision not null,
  max_ms double precision not null,
  hist integer[] not null,
  primary key (bucket, environment, route, method, organization_id, status)
);
create index if not exists api_metrics_hourly_env_bucket_idx
  on public.api_metrics_hourly (environment, bucket desc);

create table if not exists public.api_monitor_settings (
  id boolean primary key default true check (id),
  fast_ms integer not null default 300,
  acceptable_ms integer not null default 800,
  slow_ms integer not null default 2000,
  p95_alert_ms integer not null default 1500,
  error_rate_alert_pct numeric not null default 5,
  spike_factor numeric not null default 5,
  spike_min_rpm numeric not null default 30,
  duplicate_min_count integer not null default 8,
  duplicate_window_seconds integer not null default 2,
  raw_retention_days integer not null default 7,
  hourly_retention_days integer not null default 90,
  updated_at timestamptz not null default now()
);
insert into public.api_monitor_settings default values on conflict do nothing;

-- Service-role only. RLS forced with no policies: an ordinary user token
-- reads and writes zero rows (same posture as query_perf_events).
alter table public.api_request_events enable row level security;
alter table public.api_request_events force row level security;
alter table public.api_metrics_hourly enable row level security;
alter table public.api_metrics_hourly force row level security;
alter table public.api_monitor_settings enable row level security;
alter table public.api_monitor_settings force row level security;
revoke all on public.api_request_events, public.api_metrics_hourly, public.api_monitor_settings from anon, authenticated;

-- ── Histogram helpers (pure) ──────────────────────────────────────────
-- 28 upper bounds → 29 buckets: [0,5) … [30000,60000) [60000,∞). The class
-- thresholds (300 / 800 / 2000) are deliberately ON a bound so the
-- Fast/Acceptable/Slow/Very Slow split is exact for the defaults.
create or replace function app.api_bounds()
returns numeric[] language sql immutable
as $$ select array[5,10,20,35,50,75,100,150,200,250,300,400,500,650,800,1000,1250,1500,2000,2500,3000,4000,5000,7500,10000,15000,30000,60000]::numeric[] $$;

create or replace function app.api_hist_build(p_wb integer[], p_cnt integer[])
returns integer[] language plpgsql immutable
as $$
declare
  h integer[] := array_fill(0, array[29]);
  i integer;
begin
  for i in 1..coalesce(array_length(p_wb, 1), 0) loop
    h[p_wb[i] + 1] := h[p_wb[i] + 1] + p_cnt[i];
  end loop;
  return h;
end;
$$;

create or replace function app.api_hist_add(a integer[], b integer[])
returns integer[] language plpgsql immutable
as $$
declare
  r integer[];
  i integer;
begin
  if a is null then return b; end if;
  if b is null then return a; end if;
  r := a;
  for i in 1..29 loop r[i] := r[i] + b[i]; end loop;
  return r;
end;
$$;

drop aggregate if exists app.api_hist_sum(integer[]);
create aggregate app.api_hist_sum(integer[]) (sfunc = app.api_hist_add, stype = integer[]);

create or replace function app.api_hist_pct(h integer[], q double precision, mx double precision)
returns double precision language plpgsql immutable
as $$
declare
  b numeric[] := app.api_bounds();
  total bigint;
  target double precision;
  cum bigint := 0;
  i integer;
  lo double precision;
  hi double precision;
begin
  if h is null then return null; end if;
  select coalesce(sum(x), 0) into total from unnest(h) x;
  if total = 0 then return null; end if;
  target := q * total;
  for i in 1..29 loop
    if h[i] > 0 and cum + h[i] >= target then
      lo := case when i = 1 then 0 else b[i - 1] end;
      hi := case when i = 29 then greatest(mx, lo) else b[i] end;
      return least(lo + (hi - lo) * ((target - cum) / h[i]), mx);
    end if;
    cum := cum + h[i];
  end loop;
  return mx;
end;
$$;

-- Requests whose bucket upper bound is <= thr.
create or replace function app.api_hist_le(h integer[], thr numeric)
returns bigint language plpgsql immutable
as $$
declare
  b numeric[] := app.api_bounds();
  s bigint := 0;
  i integer;
begin
  if h is null then return 0; end if;
  for i in 1..28 loop
    if b[i] <= thr then s := s + h[i]; end if;
  end loop;
  return s;
end;
$$;

create or replace function app.api_range_start(p_range text)
returns timestamptz language sql stable
as $$
  select case p_range
    when '15m' then now() - interval '15 minutes'
    when '1h' then now() - interval '1 hour'
    when '7d' then now() - interval '7 days'
    when '30d' then now() - interval '30 days'
    else now() - interval '24 hours'
  end
$$;

-- ── Unified aggregate source ──────────────────────────────────────────
-- ≤ 1h reads raw rows (minute buckets); longer reads the hourly rollup.
-- Every admin_api_* aggregate goes through this one function, so the two
-- tiers can never drift apart. Admin-gated itself as defense in depth.
create or replace function app.api_rows(
  p_range text, p_env text, p_org uuid default null, p_route text default null, p_method text default null
)
returns table (
  bucket timestamptz, route text, method text, organization_id uuid, status integer,
  n bigint, sum_ms double precision, max_ms double precision, hist integer[]
)
language plpgsql
stable
security definer
set search_path = public, app, pg_temp
as $$
#variable_conflict use_column
declare
  v_from timestamptz := app.api_range_start(p_range);
begin
  if not app.is_platform_admin() then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;

  if p_range in ('15m', '1h') then
    return query
      select g.bucket, g.route, g.method, g.organization_id, g.status,
             sum(g.c)::bigint, sum(g.s)::double precision, max(g.m)::double precision,
             app.api_hist_build(array_agg(g.wb), array_agg(g.c::integer))
      from (
        select date_trunc('minute', e.occurred_at) as bucket, e.route, e.method, e.organization_id, e.status,
               width_bucket(e.duration_ms, app.api_bounds()) as wb,
               count(*) as c, sum(e.duration_ms) as s, max(e.duration_ms) as m
        from public.api_request_events e
        where e.occurred_at >= v_from
          and (p_env = 'all' or e.environment = p_env)
          and (p_org is null or e.organization_id = p_org)
          and (p_route is null or e.route = p_route)
          and (p_method is null or e.method = p_method)
        group by 1, 2, 3, 4, 5, 6
      ) g
      group by g.bucket, g.route, g.method, g.organization_id, g.status;
  else
    return query
      select h.bucket, h.route, h.method,
             nullif(h.organization_id, '00000000-0000-0000-0000-000000000000'::uuid),
             h.status, h.n, h.sum_ms, h.max_ms, h.hist
      from public.api_metrics_hourly h
      where h.bucket >= date_trunc('hour', v_from)
        and (p_env = 'all' or h.environment = p_env)
        and (p_org is null or h.organization_id = p_org)
        and (p_route is null or h.route = p_route)
        and (p_method is null or h.method = p_method);
  end if;
end;
$$;

-- ── Overview / endpoint detail ────────────────────────────────────────
create or replace function public.admin_api_overview(
  p_range text default '24h', p_env text default 'all', p_org uuid default null,
  p_route text default null, p_method text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app, pg_temp
as $$
declare
  cfg public.api_monitor_settings%rowtype;
  v_from timestamptz;
  v_minutes double precision;
  v_step interval;
  v_origin constant timestamptz := timestamptz '2000-01-01 00:00+00';
  v_out jsonb;
begin
  if not app.is_platform_admin() then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;

  select * into cfg from public.api_monitor_settings limit 1;
  v_from := app.api_range_start(p_range);
  v_minutes := greatest(extract(epoch from (now() - v_from)) / 60.0, 1);
  v_step := case p_range
    when '15m' then interval '1 minute'
    when '1h' then interval '1 minute'
    when '7d' then interval '3 hours'
    when '30d' then interval '12 hours'
    else interval '1 hour' end;

  with r as (select * from app.api_rows(p_range, p_env, p_org, p_route, p_method)),
  tot as (
    select coalesce(sum(r.n), 0)::bigint as n,
           coalesce(sum(r.sum_ms), 0)::double precision as sum_ms,
           coalesce(max(r.max_ms), 0)::double precision as max_ms,
           coalesce(sum(r.n) filter (where r.status >= 500), 0)::bigint as e5,
           coalesce(sum(r.n) filter (where r.status >= 400 and r.status < 500), 0)::bigint as e4,
           app.api_hist_sum(r.hist) as h
    from r
  ),
  grid as (
    select generate_series(date_bin(v_step, v_from, v_origin), date_bin(v_step, now(), v_origin), v_step) as t
  ),
  ser as (
    select date_bin(v_step, r.bucket, v_origin) as t,
           sum(r.n)::bigint as n,
           coalesce(sum(r.n) filter (where r.status >= 500), 0)::bigint as e,
           sum(r.sum_ms) as s, max(r.max_ms) as m, app.api_hist_sum(r.hist) as h
    from r group by 1
  ),
  series as (
    select coalesce(jsonb_agg(jsonb_build_object(
             't', g.t, 'n', coalesce(s.n, 0), 'errors', coalesce(s.e, 0),
             'avg', case when s.n > 0 then s.s / s.n end,
             'p95', app.api_hist_pct(s.h, 0.95, s.m)
           ) order by g.t), '[]'::jsonb) as j
    from grid g left join ser s on s.t = g.t
  ),
  rt as (
    select r.route, r.method, sum(r.n)::bigint as n, max(r.max_ms) as mx, app.api_hist_sum(r.hist) as h
    from r group by r.route, r.method
  ),
  slowest as (
    select coalesce(jsonb_agg(jsonb_build_object('route', z.route, 'method', z.method, 'n', z.n, 'p95', z.p95) order by z.p95 desc), '[]'::jsonb) as j
    from (select rt.route, rt.method, rt.n, app.api_hist_pct(rt.h, 0.95, rt.mx) as p95
          from rt order by 4 desc nulls last limit 5) z
  ),
  popular as (
    select coalesce(jsonb_agg(jsonb_build_object('route', z.route, 'method', z.method, 'n', z.n, 'p95', z.p95) order by z.n desc), '[]'::jsonb) as j
    from (select rt.route, rt.method, rt.n, app.api_hist_pct(rt.h, 0.95, rt.mx) as p95
          from rt order by rt.n desc limit 5) z
  )
  select jsonb_build_object(
    'range', p_range,
    'from', v_from,
    'step_seconds', extract(epoch from v_step),
    'thresholds', jsonb_build_object(
      'fast_ms', cfg.fast_ms, 'acceptable_ms', cfg.acceptable_ms, 'slow_ms', cfg.slow_ms,
      'p95_alert_ms', cfg.p95_alert_ms),
    'kpis', jsonb_build_object(
      'total', tot.n,
      'rpm', tot.n / v_minutes,
      'avg_ms', case when tot.n > 0 then tot.sum_ms / tot.n end,
      'p50_ms', app.api_hist_pct(tot.h, 0.50, tot.max_ms),
      'p95_ms', app.api_hist_pct(tot.h, 0.95, tot.max_ms),
      'p99_ms', app.api_hist_pct(tot.h, 0.99, tot.max_ms),
      'max_ms', case when tot.n > 0 then tot.max_ms end,
      'successful', tot.n - tot.e5 - tot.e4,
      'client_errors', tot.e4,
      'failed', tot.e5,
      'error_rate_pct', case when tot.n > 0 then tot.e5::double precision / tot.n * 100 end,
      'slow', tot.n - app.api_hist_le(tot.h, cfg.acceptable_ms),
      'very_slow', tot.n - app.api_hist_le(tot.h, cfg.slow_ms)),
    'mix', jsonb_build_object(
      'fast', app.api_hist_le(tot.h, cfg.fast_ms),
      'acceptable', app.api_hist_le(tot.h, cfg.acceptable_ms) - app.api_hist_le(tot.h, cfg.fast_ms),
      'slow', app.api_hist_le(tot.h, cfg.slow_ms) - app.api_hist_le(tot.h, cfg.acceptable_ms),
      'very_slow', tot.n - app.api_hist_le(tot.h, cfg.slow_ms)),
    'series', series.j,
    'slowest', slowest.j,
    'most_requested', popular.j
  ) into v_out
  from tot, series, slowest, popular;

  return v_out;
end;
$$;

-- ── Endpoints table ───────────────────────────────────────────────────
create or replace function public.admin_api_endpoints(
  p_range text default '24h', p_env text default 'all', p_org uuid default null,
  p_method text default null, p_status integer default null, p_search text default null,
  p_sort text default 'requests', p_dir text default 'desc',
  p_limit integer default 25, p_offset integer default 0
)
returns table (
  route text, method text, n bigint, avg_ms double precision, p50_ms double precision,
  p95_ms double precision, max_ms double precision, errors bigint, error_rate double precision,
  slow_n bigint, total_count bigint
)
language plpgsql
stable
security definer
set search_path = public, app, pg_temp
as $$
#variable_conflict use_column
declare
  cfg public.api_monitor_settings%rowtype;
  v_col text;
  v_dir text;
begin
  if not app.is_platform_admin() then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;
  select * into cfg from public.api_monitor_settings limit 1;

  v_col := case p_sort
    when 'avg' then 'avg_ms' when 'p50' then 'p50_ms' when 'p95' then 'p95_ms' when 'max' then 'max_ms'
    when 'errors' then 'errors' when 'error_rate' then 'error_rate' when 'slow' then 'slow_n'
    when 'route' then 'route' else 'n' end;
  v_dir := case lower(coalesce(p_dir, 'desc')) when 'asc' then 'asc' else 'desc' end;

  return query execute format($f$
    with g as (
      select r.route, r.method, sum(r.n)::bigint as n, sum(r.sum_ms) as sum_ms, max(r.max_ms) as max_ms,
             coalesce(sum(r.n) filter (where r.status >= 500), 0)::bigint as errors,
             app.api_hist_sum(r.hist) as h
      from app.api_rows($1, $2, $3) r
      where ($4 is null or r.method = $4)
        and ($5 is null or r.status = $5)
        and ($6 is null or $6 = '' or r.route ilike '%%' || $6 || '%%')
      group by r.route, r.method
    ),
    x as (
      select g.route, g.method, g.n,
             (g.sum_ms / g.n)::double precision as avg_ms,
             app.api_hist_pct(g.h, 0.5, g.max_ms) as p50_ms,
             app.api_hist_pct(g.h, 0.95, g.max_ms) as p95_ms,
             g.max_ms::double precision as max_ms, g.errors,
             (g.errors::double precision / g.n * 100) as error_rate,
             (g.n - app.api_hist_le(g.h, $7))::bigint as slow_n
      from g
    )
    select x.route, x.method, x.n, x.avg_ms, x.p50_ms, x.p95_ms, x.max_ms, x.errors, x.error_rate, x.slow_n,
           count(*) over()::bigint as total_count
    from x
    order by x.%I %s nulls last, x.route, x.method
    limit $8 offset $9
  $f$, v_col, v_dir)
  using p_range, p_env, p_org, p_method, p_status, p_search, cfg.acceptable_ms::numeric,
        greatest(least(p_limit, 200), 1), greatest(p_offset, 0);
end;
$$;

-- ── Request explorer ──────────────────────────────────────────────────
create or replace function public.admin_api_requests(
  p_range text default '24h', p_env text default 'all', p_request text default null,
  p_route text default null, p_route_exact boolean default false, p_org uuid default null,
  p_status integer default null, p_min_status integer default null, p_method text default null,
  p_min_ms numeric default null, p_sort text default 'time',
  p_limit integer default 25, p_offset integer default 0
)
returns table (
  request_id uuid, occurred_at timestamptz, route text, method text, status integer,
  duration_ms numeric, organization_id uuid, organization_name text, environment text,
  error_type text, total_count bigint
)
language plpgsql
stable
security definer
set search_path = public, app, pg_temp
as $$
#variable_conflict use_column
declare
  v_from timestamptz := app.api_range_start(p_range);
  v_req text := nullif(regexp_replace(lower(coalesce(p_request, '')), '^req_|-', '', 'g'), '');
begin
  if not app.is_platform_admin() then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;

  return query
    select z.request_id, z.occurred_at, z.route, z.method, z.status, z.duration_ms,
           z.organization_id, o.name::text, z.environment, z.error_type, z.total_count
    from (
      select e.request_id, e.occurred_at, e.route, e.method, e.status, e.duration_ms,
             e.organization_id, e.environment, e.error_type,
             count(*) over()::bigint as total_count
      from public.api_request_events e
      where e.occurred_at >= v_from
        and (p_env = 'all' or e.environment = p_env)
        and (v_req is null or replace(e.request_id::text, '-', '') like v_req || '%')
        and (p_route is null or p_route = ''
             or (p_route_exact and e.route = p_route)
             or (not p_route_exact and e.route ilike '%' || p_route || '%'))
        and (p_org is null or e.organization_id = p_org)
        and (p_status is null or e.status = p_status)
        and (p_min_status is null or e.status >= p_min_status)
        and (p_method is null or e.method = p_method)
        and (p_min_ms is null or e.duration_ms >= p_min_ms)
      order by case when p_sort = 'duration' then e.duration_ms end desc nulls last,
               e.occurred_at desc
      limit greatest(least(p_limit, 200), 1) offset greatest(p_offset, 0)
    ) z
    left join public.organizations o on o.id = z.organization_id
    order by case when p_sort = 'duration' then z.duration_ms end desc nulls last,
             z.occurred_at desc;
end;
$$;

-- ── One request, with whatever Supabase spans exist for it ────────────
create or replace function public.admin_api_request_detail(p_request_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_ev public.api_request_events%rowtype;
  v_org text;
  v_spans jsonb := null;
begin
  if not app.is_platform_admin() then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;

  select * into v_ev from public.api_request_events where request_id = p_request_id;
  if not found then return null; end if;
  select name into v_org from public.organizations where id = v_ev.organization_id;

  -- Supabase timings exist only when the tenant app persists query spans
  -- (PERF_PERSIST=1 → query_perf_events). Absent → null, never guessed.
  if to_regclass('public.query_perf_events') is not null then
    execute $q$
      select case when count(*) = 0 then null else jsonb_build_object(
        'calls', count(*),
        'total_ms', round(sum(duration_ms), 1),
        'auth_calls', count(*) filter (where api = 'auth'),
        'auth_ms', round(coalesce(sum(duration_ms) filter (where api = 'auth'), 0), 1),
        'failed_calls', count(*) filter (where not ok),
        'slowest', (select coalesce(jsonb_agg(jsonb_build_object(
            'api', s.api, 'operation', s.operation, 'resource', s.resource,
            'duration_ms', s.duration_ms, 'status', s.status) order by s.duration_ms desc), '[]'::jsonb)
          from (select api, operation, resource, duration_ms, status
                from public.query_perf_events where request_id = $1
                order by duration_ms desc limit 5) s)
      ) end
      from public.query_perf_events where request_id = $1
    $q$ into v_spans using p_request_id;
  end if;

  return jsonb_build_object(
    'request_id', v_ev.request_id,
    'occurred_at', v_ev.occurred_at,
    'environment', v_ev.environment,
    'route', v_ev.route,
    'method', v_ev.method,
    'status', v_ev.status,
    'duration_ms', v_ev.duration_ms,
    'organization_id', v_ev.organization_id,
    'organization_name', v_org,
    'error_type', v_ev.error_type,
    'error_message', v_ev.error_message,
    'supabase', v_spans
  );
end;
$$;

-- ── Errors ────────────────────────────────────────────────────────────
create or replace function public.admin_api_errors(
  p_range text default '24h', p_env text default 'all', p_org uuid default null,
  p_search text default null, p_min_status integer default 400,
  p_limit integer default 25, p_offset integer default 0
)
returns table (
  route text, method text, status integer, error_type text, sample_message text,
  occurrences bigint, last_at timestamptz, org_count bigint,
  organization_id uuid, organization_name text, total_count bigint
)
language plpgsql
stable
security definer
set search_path = public, app, pg_temp
as $$
#variable_conflict use_column
declare
  v_from timestamptz := app.api_range_start(p_range);
begin
  if not app.is_platform_admin() then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;

  return query
    select z.route, z.method, z.status, z.error_type, z.sample_message, z.occurrences, z.last_at,
           z.org_count, z.organization_id, o.name::text, z.total_count
    from (
      select e.route, e.method, e.status, coalesce(e.error_type, '')::text as error_type,
             (array_agg(e.error_message order by e.occurred_at desc))[1] as sample_message,
             count(*)::bigint as occurrences,
             max(e.occurred_at) as last_at,
             count(distinct e.organization_id)::bigint as org_count,
             case when count(distinct e.organization_id) = 1
                  then (array_agg(e.organization_id) filter (where e.organization_id is not null))[1] end as organization_id,
             count(*) over()::bigint as total_count
      from public.api_request_events e
      where e.occurred_at >= v_from
        and e.status >= p_min_status
        and (p_env = 'all' or e.environment = p_env)
        and (p_org is null or e.organization_id = p_org)
        and (p_search is null or p_search = '' or e.route ilike '%' || p_search || '%')
      group by e.route, e.method, e.status, coalesce(e.error_type, '')
    ) z
    left join public.organizations o on o.id = z.organization_id
    order by z.occurrences desc, z.last_at desc
    limit greatest(least(p_limit, 200), 1) offset greatest(p_offset, 0);
end;
$$;

-- ── Per-organization usage ────────────────────────────────────────────
create or replace function public.admin_api_organizations(
  p_range text default '24h', p_env text default 'all', p_search text default null,
  p_sort text default 'requests', p_dir text default 'desc',
  p_limit integer default 25, p_offset integer default 0
)
returns table (
  organization_id uuid, organization_name text, n bigint, avg_ms double precision,
  p95_ms double precision, max_ms double precision, errors bigint, error_rate double precision,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public, app, pg_temp
as $$
#variable_conflict use_column
declare
  v_col text;
  v_dir text;
begin
  if not app.is_platform_admin() then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;
  v_col := case p_sort
    when 'avg' then 'avg_ms' when 'p95' then 'p95_ms' when 'max' then 'max_ms'
    when 'errors' then 'errors' when 'error_rate' then 'error_rate' when 'name' then 'organization_name'
    else 'n' end;
  v_dir := case lower(coalesce(p_dir, 'desc')) when 'asc' then 'asc' else 'desc' end;

  return query execute format($f$
    with g as (
      select r.organization_id, sum(r.n)::bigint as n, sum(r.sum_ms) as sum_ms, max(r.max_ms) as max_ms,
             coalesce(sum(r.n) filter (where r.status >= 500), 0)::bigint as errors,
             app.api_hist_sum(r.hist) as h
      from app.api_rows($1, $2) r
      group by r.organization_id
    ),
    x as (
      select g.organization_id, o.name::text as organization_name, g.n,
             (g.sum_ms / g.n)::double precision as avg_ms,
             app.api_hist_pct(g.h, 0.95, g.max_ms) as p95_ms,
             g.max_ms::double precision as max_ms, g.errors,
             (g.errors::double precision / g.n * 100) as error_rate
      from g left join public.organizations o on o.id = g.organization_id
      where ($3 is null or $3 = '' or o.name ilike '%%' || $3 || '%%')
    )
    select x.organization_id, x.organization_name, x.n, x.avg_ms, x.p95_ms, x.max_ms, x.errors, x.error_rate,
           count(*) over()::bigint as total_count
    from x
    order by x.%I %s nulls last, x.organization_name
    limit $4 offset $5
  $f$, v_col, v_dir)
  using p_range, p_env, p_search, greatest(least(p_limit, 200), 1), greatest(p_offset, 0);
end;
$$;

-- ── Alerts, unusual traffic, duplicate bursts ─────────────────────────
-- Informational only. Nothing here changes data or blocks a request.
create or replace function public.admin_api_alerts(p_env text default 'all')
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app, pg_temp
as $$
declare
  cfg public.api_monitor_settings%rowtype;
  v_alerts jsonb := '[]'::jsonb;
  v_dups jsonb := '[]'::jsonb;
  v_base_from timestamptz := date_trunc('hour', now()) - interval '24 hours';
  v_base_to timestamptz := date_trunc('hour', now());
begin
  if not app.is_platform_admin() then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;
  select * into cfg from public.api_monitor_settings limit 1;

  with cur as (           -- last 15 minutes, per route
    select e.route, e.method, count(*) as n,
           count(*) filter (where e.status >= 500) as e5,
           count(*) filter (where e.duration_ms > cfg.slow_ms) as very_slow,
           max(e.duration_ms) as mx,
           percentile_cont(0.95) within group (order by e.duration_ms) as p95
    from public.api_request_events e
    where e.occurred_at >= now() - interval '15 minutes' and (p_env = 'all' or e.environment = p_env)
    group by e.route, e.method
  ),
  cur5 as (               -- last 5 minutes, per route
    select e.route, e.method, count(*)::double precision / 5 as rpm
    from public.api_request_events e
    where e.occurred_at >= now() - interval '5 minutes' and (p_env = 'all' or e.environment = p_env)
    group by e.route, e.method
  ),
  base as (               -- previous 24 full hours, from the rollup
    select h.route, h.method, sum(h.n)::double precision / 1440 as rpm,
           sum(h.n) filter (where h.status >= 500)::double precision / nullif(sum(h.n), 0) * 100 as err_pct,
           sum(h.n) as n
    from public.api_metrics_hourly h
    where h.bucket >= v_base_from and h.bucket < v_base_to and (p_env = 'all' or h.environment = p_env)
    group by h.route, h.method
  ),
  five as (               -- repeated 5xx in the last 10 minutes
    select e.route, e.method, count(*) as n
    from public.api_request_events e
    where e.occurred_at >= now() - interval '10 minutes' and e.status >= 500 and (p_env = 'all' or e.environment = p_env)
    group by e.route, e.method
  ),
  a as (
    select 'high_p95'::text as type, 'warning'::text as severity, c.route, c.method,
           format('P95 %s ms over the last 15 min (threshold %s ms)', round(c.p95::numeric), cfg.p95_alert_ms) as message,
           c.p95::double precision as value
    from cur c where c.n >= 5 and c.p95 >= cfg.p95_alert_ms
    union all
    select 'very_slow', 'info', c.route, c.method,
           format('%s request(s) over %s ms in the last 15 min (max %s ms)', c.very_slow, cfg.slow_ms, round(c.mx::numeric)),
           c.very_slow::double precision
    from cur c where c.very_slow > 0
    union all
    select 'error_rate', 'critical', c.route, c.method,
           format('%s%% server errors over the last 15 min (24h baseline %s%%)',
                  round((c.e5::numeric / c.n) * 100, 1), round(coalesce(b.err_pct, 0)::numeric, 1)),
           (c.e5::double precision / c.n) * 100
    from cur c left join base b on b.route = c.route and b.method = c.method
    where c.n >= 10
      and (c.e5::double precision / c.n) * 100 >= cfg.error_rate_alert_pct
      and (c.e5::double precision / c.n) * 100 >= 2 * coalesce(b.err_pct, 0)
    union all
    select 'repeated_5xx', 'critical', f.route, f.method,
           format('%s server errors in the last 10 min', f.n), f.n::double precision
    from five f where f.n >= 3
    union all
    select 'unusual_traffic', 'warning', c5.route, c5.method,
           format('%s req/min now vs ~%s req/min normally', round(c5.rpm::numeric, 1), round(b.rpm::numeric, 1)),
           c5.rpm
    from cur5 c5 join base b on b.route = c5.route and b.method = c5.method
    where b.n >= 50 and c5.rpm >= cfg.spike_min_rpm and c5.rpm >= cfg.spike_factor * greatest(b.rpm, 0.5)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'type', a.type, 'severity', a.severity, 'route', a.route, 'method', a.method,
           'message', a.message, 'value', a.value)
         order by case a.severity when 'critical' then 0 when 'warning' then 1 else 2 end, a.value desc), '[]'::jsonb)
  into v_alerts
  from a;

  -- Duplicate bursts: same route + method + organization + fingerprint,
  -- >= N times inside one W-second window, in the last 15 minutes.
  select coalesce(jsonb_agg(jsonb_build_object(
           'route', d.route, 'method', d.method, 'organization_id', d.organization_id,
           'organization_name', o.name, 'count', d.n, 'at', d.at, 'window_seconds', cfg.duplicate_window_seconds)
         order by d.n desc, d.at desc), '[]'::jsonb)
  into v_dups
  from (
    select e.route, e.method, e.organization_id, count(*) as n, min(e.occurred_at) as at
    from public.api_request_events e
    where e.occurred_at >= now() - interval '15 minutes'
      and e.fingerprint is not null and (p_env = 'all' or e.environment = p_env)
    group by e.route, e.method, e.organization_id, e.fingerprint,
             floor(extract(epoch from e.occurred_at) / cfg.duplicate_window_seconds)
    having count(*) >= cfg.duplicate_min_count
    order by count(*) desc limit 10
  ) d
  left join public.organizations o on o.id = d.organization_id;

  return jsonb_build_object('alerts', v_alerts, 'duplicates', v_dups);
end;
$$;

-- ── Maintenance (cron only — NOT callable by any client role) ─────────
create or replace function app.api_rollup_recent()
returns integer
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_from timestamptz := date_trunc('hour', now()) - interval '2 hours';
  v_rows integer;
begin
  delete from public.api_metrics_hourly where bucket >= v_from;
  insert into public.api_metrics_hourly
    (bucket, environment, route, method, organization_id, status, n, sum_ms, max_ms, hist)
  select g.bucket, g.environment, g.route, g.method, g.org, g.status,
         sum(g.c)::bigint, sum(g.s)::double precision, max(g.m)::double precision,
         app.api_hist_build(array_agg(g.wb), array_agg(g.c::integer))
  from (
    select date_trunc('hour', e.occurred_at) as bucket, e.environment, e.route, e.method,
           coalesce(e.organization_id, '00000000-0000-0000-0000-000000000000'::uuid) as org, e.status,
           width_bucket(e.duration_ms, app.api_bounds()) as wb,
           count(*) as c, sum(e.duration_ms) as s, max(e.duration_ms) as m
    from public.api_request_events e
    where e.occurred_at >= v_from
    group by 1, 2, 3, 4, 5, 6, 7
  ) g
  group by g.bucket, g.environment, g.route, g.method, g.org, g.status;
  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

create or replace function app.api_prune()
returns jsonb
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  cfg public.api_monitor_settings%rowtype;
  v_raw integer;
  v_hourly integer;
begin
  select * into cfg from public.api_monitor_settings limit 1;
  -- Never prune raw rows the rollup has not yet captured.
  perform app.api_rollup_recent();
  delete from public.api_request_events
    where occurred_at < now() - make_interval(days => greatest(cfg.raw_retention_days, 1));
  get diagnostics v_raw = row_count;
  delete from public.api_metrics_hourly
    where bucket < now() - make_interval(days => greatest(cfg.hourly_retention_days, 1));
  get diagnostics v_hourly = row_count;
  return jsonb_build_object('raw_deleted', v_raw, 'hourly_deleted', v_hourly);
end;
$$;

-- ── Grants: every admin_api_* RPC is authenticated-only; helpers are not
-- callable by any client role. (Both revokes — PUBLIC and the explicit
-- roles — per this project's recorded trap.)
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname like 'admin\_api\_%'
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
end $$;

revoke execute on function app.api_rows(text, text, uuid, text, text) from public, anon, authenticated;
revoke execute on function app.api_rollup_recent() from public, anon, authenticated;
revoke execute on function app.api_prune() from public, anon, authenticated;

-- ── Schedules (idempotent) ────────────────────────────────────────────
do $$
begin
  create extension if not exists pg_cron;
exception when others then
  raise notice 'pg_cron unavailable (%); enable it in Dashboard → Database → Extensions, then re-run this block', sqlerrm;
end $$;

do $$
begin
  if to_regclass('cron.job') is not null then
    perform cron.unschedule(jobname) from cron.job where jobname in ('api-metrics-rollup', 'api-metrics-prune');
    perform cron.schedule('api-metrics-rollup', '*/5 * * * *', 'select app.api_rollup_recent()');
    perform cron.schedule('api-metrics-prune', '17 3 * * *', 'select app.api_prune()');
  end if;
end $$;
