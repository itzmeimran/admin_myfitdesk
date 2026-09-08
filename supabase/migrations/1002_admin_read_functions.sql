-- ═══════════════════════════════════════════════════════════════════════
-- Applied to the live project 2026-09-08, same session/authorization as
-- 1001_platform_admins.sql — see CLAUDE.md D-1.
--
-- Grants a platform admin the read (and, for platform_packages, write)
-- access the Overview/Gyms/Packages/Revenue screens need, drawing the same
-- boundary the admin plan committed to:
--
--   Platform-plane tables (organizations, organization_subscriptions,
--   platform_packages, platform_payments) — this is MyFitDesk's OWN
--   business data about the tenant relationship (who they are, what they
--   pay, what they're entitled to), not customer PII. These get direct
--   admin-gated RLS SELECT policies, so the app queries them the normal
--   way through the RLS-scoped server client — no RPC needed, same as
--   every other table in this product.
--
--   Tenant-plane operational tables (members, branches, staff_memberships)
--   stay exactly as protected as they are today — no new SELECT policy on
--   any of them. An admin gets COUNTS only, through the SECURITY DEFINER
--   functions below, which never return a row of member/staff PII. This is
--   the deliberate line the admin plan draws (its own §9.6): operational
--   visibility, not a directory of another gym's customers.
--
-- Every function is admin-gated the same way as app.is_platform_admin()
-- itself: SECURITY DEFINER, pinned search_path, explicit
-- revoke-from-everyone-then-grant-to-authenticated (see 1001's comment on
-- why both revokes are required — FitDeskApp's own 0038/0040 hit this).
-- ═══════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- Platform-plane RLS — admin-gated, additive to each table's existing
-- owner-scoped policy (RLS policies are OR'd together, so a gym owner's
-- own access is untouched).
-- ─────────────────────────────────────────────────────────────────────────

drop policy if exists organizations_admin_select on public.organizations;
create policy organizations_admin_select on public.organizations
  for select to authenticated
  using (app.is_platform_admin());

drop policy if exists organization_subscriptions_admin_select on public.organization_subscriptions;
create policy organization_subscriptions_admin_select on public.organization_subscriptions
  for select to authenticated
  using (app.is_platform_admin());

drop policy if exists platform_payments_admin_select on public.platform_payments;
create policy platform_payments_admin_select on public.platform_payments
  for select to authenticated
  using (app.is_platform_admin());

-- platform_packages already has platform_packages_select (true) for any
-- authenticated user — that's an intentional existing policy (0028: "it is
-- a price list, and an owner has to see it to buy"), unrelated to admin
-- access, and left alone. What's missing is WRITE: today literally nobody
-- can write this table except the service role (0028's own comment: "the
-- catalogue is changed by MyFitDesk ... never from the app"). This is the
-- actual gap the Packages admin screen exists to close.
drop policy if exists platform_packages_admin_write on public.platform_packages;
create policy platform_packages_admin_write on public.platform_packages
  for all to authenticated
  using (app.is_platform_admin())
  with check (app.is_platform_admin());

-- ─────────────────────────────────────────────────────────────────────────
-- app.derive_subscription_state(status, period_end, grace_days) →
-- 'trialing' | 'active' | 'grace' | 'read_only' | 'cancelled'
--
-- Reimplements FitDeskApp's resolveBillingAccess() (src/features/billing/
-- access.ts) in SQL, for use inside the aggregate functions below — same
-- rule, same "derived from dates, never read off status" principle, with
-- the one addition of a `cancelled` terminal state resolveBillingAccess
-- doesn't need to express (a cancelled row here is BillingAccess-shaped as
-- 'read_only' from the tenant app's point of view; the admin screens want
-- to distinguish "lapsed" from "the owner actually cancelled", which is
-- exactly the distinction the design's PILL map draws between Read-only
-- and Cancelled).
--
-- Kept as a plain SQL function (not embedded three times) so this stays a
-- single place to fix if the tenant-app rule ever changes. Immutable-in-
-- spirit but marked STABLE, not IMMUTABLE, since it reads `now()`.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function app.derive_subscription_state(
  p_status text,
  p_period_end timestamptz,
  p_grace_days integer
) returns text
language sql
stable
as $$
  select case
    when p_status = 'cancelled' then 'cancelled'
    when now() < p_period_end then (case when p_status = 'trialing' then 'trialing' else 'active' end)
    when now() < p_period_end + make_interval(days => coalesce(p_grace_days, 0)) then 'grace'
    else 'read_only'
  end
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- admin_gym_directory() — backs the Gyms screen. One row per organization;
-- member/branch/staff counts and lifetime platform revenue are computed
-- here (SECURITY DEFINER, so it sees every org regardless of RLS) rather
-- than exposed as a queryable policy on members/branches/staff_memberships
-- — this function returns counts, never a member's name, phone or email.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.admin_gym_directory()
returns table (
  organization_id uuid,
  name text,
  owner_name text,
  city text,
  package_name text,
  package_code text,
  billing_period text,
  price_minor bigint,
  currency text,
  state text,
  current_period_end timestamptz,
  grace_days integer,
  member_count bigint,
  member_cap integer,
  branch_count bigint,
  branch_cap integer,
  staff_count bigint,
  staff_cap integer,
  lifetime_paid_minor bigint,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public, app, pg_temp
as $$
  select
    o.id,
    o.name,
    (
      select coalesce(nullif(trim(sm.first_name || ' ' || coalesce(sm.last_name, '')), ''), sm.email::text)
      from staff_memberships sm
      where sm.organization_id = o.id and sm.role = 'owner'
      order by sm.created_at asc
      limit 1
    ),
    o.city,
    pk.name,
    pk.code,
    pk.billing_period,
    pk.price_minor,
    pk.currency,
    app.derive_subscription_state(os.status, os.current_period_end, os.grace_days),
    os.current_period_end,
    os.grace_days,
    (select count(*) from members m where m.organization_id = o.id and m.deleted_at is null),
    pk.max_members,
    (select count(*) from branches b where b.organization_id = o.id and b.status = 'active'),
    pk.max_branches,
    (select count(*) from staff_memberships sm2 where sm2.organization_id = o.id),
    pk.max_staff,
    (select coalesce(sum(pp.amount_minor), 0) from platform_payments pp where pp.organization_id = o.id and pp.status = 'succeeded'),
    o.created_at
  from organizations o
  left join organization_subscriptions os on os.organization_id = o.id
  left join platform_packages pk on pk.id = os.package_id
  where app.is_platform_admin()
  order by o.created_at desc
$$;

revoke execute on function public.admin_gym_directory() from public, anon, authenticated;
grant execute on function public.admin_gym_directory() to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- admin_package_mix() — backs Packages' "gyms on this tier" / MRR share
-- and Overview's "Package mix" section. Yearly rows are normalised to a
-- monthly figure (÷12) so a mixed Monthly/Yearly book still sums to one
-- honest MRR number — same normalisation the design's own copy states
-- ("Yearly packages normalised to a monthly figure").
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.admin_package_mix()
returns table (
  package_id uuid,
  code text,
  name text,
  billing_period text,
  price_minor bigint,
  gym_count bigint,
  mrr_minor bigint
)
language sql
stable
security definer
set search_path = public, app, pg_temp
as $$
  select
    pk.id,
    pk.code,
    pk.name,
    pk.billing_period,
    pk.price_minor,
    count(os.organization_id),
    -- The CASE must check os.organization_id first: a tier with zero
    -- subscribers still produces one row from the LEFT JOIN (os columns
    -- null, pk columns present), and pk.price_minor is reachable from that
    -- row regardless — reading it unconditionally here counted one
    -- phantom month's price for every zero-subscriber tier. Caught by
    -- hand-verifying this function's output against the live data before
    -- wiring it into any page (starter_yearly showed gym_count 0 but
    -- mrr_minor 37416 instead of 0).
    coalesce(sum(case
      when os.organization_id is null then 0
      when pk.billing_period = 'yearly' then pk.price_minor / 12
      else pk.price_minor
    end), 0)
  from platform_packages pk
  left join organization_subscriptions os
    on os.package_id = pk.id
    and os.status <> 'cancelled'
  where app.is_platform_admin()
  group by pk.id, pk.code, pk.name, pk.billing_period, pk.price_minor, pk.sort_order
  order by pk.sort_order
$$;

revoke execute on function public.admin_package_mix() from public, anon, authenticated;
grant execute on function public.admin_package_mix() to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- admin_overview_stats(p_period_start, p_period_end, p_prev_start, p_prev_end)
-- — backs the Overview screen. One round trip for every headline number:
-- tenant state counts, new signups (current vs previous period), platform
-- revenue (current vs previous), MRR (normalised, active tenants only),
-- trials ending within 7 days, lapsed/read-only count, failed and
-- awaiting-settlement platform charges. Periods are computed in TypeScript
-- (matching features/reports/period.ts's own convention: compute the
-- calendar range client/server-side, pass instants in) rather than three
-- hardcoded variants here — the design's This month/Quarter/Year toggle
-- maps to different arguments to the same function, not different SQL.
--
-- Deliberately returns jsonb rather than a wide row: the shape here mirrors
-- the Overview page's own widget grouping (see design-audit.md), and a
-- single jsonb_build_object keeps every number computed against the same
-- consistent snapshot of `now()` rather than N separate round trips each
-- reading a microscopically different instant.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.admin_overview_stats(
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_prev_start timestamptz,
  p_prev_end timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_result jsonb;
begin
  if not app.is_platform_admin() then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;

  select jsonb_build_object(
    'tenant_counts', (
      select jsonb_object_agg(state, cnt) from (
        select app.derive_subscription_state(os.status, os.current_period_end, os.grace_days) as state, count(*) as cnt
        from organization_subscriptions os
        group by 1
      ) t
    ),
    'total_gyms', (select count(*) from organizations),
    'new_signups_current', (select count(*) from organizations where created_at >= p_period_start and created_at < p_period_end),
    'new_signups_previous', (select count(*) from organizations where created_at >= p_prev_start and created_at < p_prev_end),
    'total_branches', (select count(*) from branches where status = 'active'),
    'total_members', (select count(*) from members where deleted_at is null),
    'platform_revenue_current_minor', (
      select coalesce(sum(amount_minor), 0) from platform_payments
      where status = 'succeeded' and paid_at >= p_period_start and paid_at < p_period_end
    ),
    'platform_revenue_previous_minor', (
      select coalesce(sum(amount_minor), 0) from platform_payments
      where status = 'succeeded' and paid_at >= p_prev_start and paid_at < p_prev_end
    ),
    'mrr_minor', (
      select coalesce(sum(case when pk.billing_period = 'yearly' then pk.price_minor / 12 else pk.price_minor end), 0)
      from organization_subscriptions os
      join platform_packages pk on pk.id = os.package_id
      where os.status not in ('cancelled')
        and app.derive_subscription_state(os.status, os.current_period_end, os.grace_days) in ('active', 'grace')
    ),
    'trials_ending_7d', (
      select count(*) from organization_subscriptions os
      where os.status = 'trialing' and os.current_period_end < now() + interval '7 days' and os.current_period_end >= now()
    ),
    'in_grace_count', (
      select count(*) from organization_subscriptions os
      where app.derive_subscription_state(os.status, os.current_period_end, os.grace_days) = 'grace'
    ),
    'read_only_count', (
      select count(*) from organization_subscriptions os
      where app.derive_subscription_state(os.status, os.current_period_end, os.grace_days) = 'read_only'
    ),
    'failed_charges_current', (
      select jsonb_build_object('count', count(*), 'amount_minor', coalesce(sum(amount_minor), 0))
      from platform_payments where status = 'failed' and created_at >= p_period_start and created_at < p_period_end
    ),
    'awaiting_settlement', (
      select jsonb_build_object('count', count(*), 'amount_minor', coalesce(sum(amount_minor), 0))
      from platform_payments where status = 'created' and created_at < now() - interval '1 hour'
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke execute on function public.admin_overview_stats(timestamptz, timestamptz, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.admin_overview_stats(timestamptz, timestamptz, timestamptz, timestamptz) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- admin_gyms_near_cap(p_limit) — "Hitting package limits" panel. Compares
-- each gym's current usage to its own package's caps; unlimited (null cap)
-- rows are excluded since there is no pressure to report. Ordered by
-- whichever resource is closest to its cap.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.admin_gyms_near_cap(p_limit integer default 5)
returns table (
  organization_id uuid,
  name text,
  resource text,
  used_count bigint,
  cap_count integer,
  pct numeric
)
language sql
stable
security definer
set search_path = public, app, pg_temp
as $$
  select organization_id, name, resource, used_count, cap_count, pct
  from (
    select
      o.id as organization_id,
      o.name,
      'members' as resource,
      (select count(*) from members m where m.organization_id = o.id and m.deleted_at is null) as used_count,
      pk.max_members as cap_count,
      case when pk.max_members > 0 then
        round(100.0 * (select count(*) from members m where m.organization_id = o.id and m.deleted_at is null) / pk.max_members, 1)
      else null end as pct
    from organizations o
    join organization_subscriptions os on os.organization_id = o.id
    join platform_packages pk on pk.id = os.package_id
    where app.is_platform_admin() and pk.max_members is not null
    union all
    select
      o.id, o.name, 'branches',
      (select count(*) from branches b where b.organization_id = o.id and b.status = 'active'),
      pk.max_branches,
      case when pk.max_branches > 0 then
        round(100.0 * (select count(*) from branches b where b.organization_id = o.id and b.status = 'active') / pk.max_branches, 1)
      else null end
    from organizations o
    join organization_subscriptions os on os.organization_id = o.id
    join platform_packages pk on pk.id = os.package_id
    where app.is_platform_admin() and pk.max_branches is not null
    union all
    select
      o.id, o.name, 'staff',
      (select count(*) from staff_memberships sm where sm.organization_id = o.id),
      pk.max_staff,
      case when pk.max_staff > 0 then
        round(100.0 * (select count(*) from staff_memberships sm where sm.organization_id = o.id) / pk.max_staff, 1)
      else null end
    from organizations o
    join organization_subscriptions os on os.organization_id = o.id
    join platform_packages pk on pk.id = os.package_id
    where app.is_platform_admin() and pk.max_staff is not null
  ) usage
  where pct is not null
  order by pct desc
  limit p_limit
$$;

revoke execute on function public.admin_gyms_near_cap(integer) from public, anon, authenticated;
grant execute on function public.admin_gyms_near_cap(integer) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- admin_revenue_trend(p_weeks) — the Overview 12-week bar chart and
-- Revenue's own trend, if it grows one later. Buckets platform_payments by
-- calendar week (Monday start, matching the tenant app's own week_start
-- default), normalised the same way admin_package_mix() is.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.admin_revenue_trend(p_weeks integer default 12)
returns table (
  week_start date,
  revenue_minor bigint
)
language sql
stable
security definer
set search_path = public, app, pg_temp
as $$
  select
    d::date as week_start,
    coalesce((
      select sum(amount_minor) from platform_payments pp
      where pp.status = 'succeeded'
        and pp.paid_at >= d
        and pp.paid_at < d + interval '7 days'
    ), 0)
  from generate_series(
    date_trunc('week', now()) - make_interval(weeks => greatest(p_weeks, 1) - 1),
    date_trunc('week', now()),
    interval '7 days'
  ) d
  where app.is_platform_admin()
  order by 1
$$;

revoke execute on function public.admin_revenue_trend(integer) from public, anon, authenticated;
grant execute on function public.admin_revenue_trend(integer) to authenticated;
