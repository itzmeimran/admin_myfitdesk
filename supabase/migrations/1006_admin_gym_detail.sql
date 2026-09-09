-- ═══════════════════════════════════════════════════════════════════════
-- NOT YET APPLIED TO ANY LIVE PROJECT — written and reviewed locally only,
-- same status 1005 started in before it was applied. This session has no
-- Supabase MCP tool and no .env.local, so unlike the migrations above it,
-- this one could not be run or live-verified from inside this session at
-- all. It needs the same explicit go-ahead (CLAUDE.md D-1) AND a session
-- with real DB access before it ever touches the live project.
--
-- Backs the Gyms list redesign + new Gym Detail page (Platform Admin →
-- Gyms → [Gym Name]). Three kinds of change:
--
--   1. Real server-side search/filter/sort/pagination for the Gyms list —
--      admin_gyms_summary() (status-breakdown tiles) and admin_gyms_list()
--      (the table itself: filters + a dynamic, allowlisted ORDER BY +
--      LIMIT/OFFSET + a `count(*) over()` total, all computed in one round
--      trip so the app never has to pull the whole gym table into Node to
--      paginate it client-side).
--
--   2. A reversal of a documented decision (CLAUDE.md, 1002's own header
--      comment): platform admins were deliberately restricted to
--      member/staff COUNTS, never a row of member/staff PII. The product
--      owner explicitly reversed that for this feature (Members/Staff tabs
--      need to be real searchable directories) — but this is done via new
--      curated SECURITY DEFINER functions (admin_gym_members(),
--      admin_gym_staff(), admin_gym_branches()), NOT a blanket admin-select
--      RLS policy on members/staff_memberships/branches/
--      member_subscriptions. A SECURITY DEFINER function already bypasses
--      RLS for what it queries internally, so a blanket policy here would
--      add nothing these functions need — it would only additionally let
--      any admin session hit `.from("members").select("*")` directly over
--      PostgREST and get every raw column (avatar_path, deleted_at, etc.),
--      bypassing the exact column curation these functions exist to
--      provide. Same reasoning 1003's migration already used to drop
--      platform_packages' blanket write policy in favor of narrow RPCs,
--      applied here to reads of genuinely sensitive tenant PII.
--
--   3. A genuinely new concept: hard-suspend. Today an account's state is
--      entirely derived from its subscription (active/trialing/grace/
--      read-only/cancelled) — there is no notion of an admin cutting off
--      access independent of billing. `organizations.suspended_at` (+
--      `suspended_by`/`suspension_reason`) adds exactly that, with
--      admin_suspend_organization()/admin_reactivate_organization() as the
--      only writers (narrow RPC + audit row, same convention as every other
--      admin_* write in this app).
--
--      IMPORTANT SCOPE NOTE: this migration only lets a platform admin flag
--      an organization as suspended and surfaces that flag everywhere this
--      admin app reads gym state. It does NOT — and, per CLAUDE.md's D-B
--      (this is a separate repo from the tenant app; no cross-repo changes
--      without sign-off), cannot from here — make FitDeskApp's own
--      session/RLS layer actually deny a suspended org's staff from logging
--      in. Enforcing the block inside the tenant app is real follow-up work
--      that belongs in the FitDeskApp repo, with its own sign-off. Flagged
--      here and in CLAUDE.md/the task summary rather than silently assumed.
--
-- Every new function: SECURITY DEFINER, pinned search_path, explicit
-- revoke-then-grant (1001's comment explains why both revokes are needed).
-- Every write function does its table write and its admin_audit_log entry
-- in one transaction — never a blanket write policy (1003/1004's own
-- reasoning, unchanged here).
-- ═══════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- Hard-suspend columns.
-- ─────────────────────────────────────────────────────────────────────────
alter table public.organizations
  add column if not exists suspended_at timestamptz,
  add column if not exists suspended_by uuid references auth.users(id),
  add column if not exists suspension_reason text;

-- No new RLS SELECT policies on branches/members/staff_memberships/
-- member_subscriptions/membership_plans, or on payment_gateway_integrations/
-- whatsapp_integrations/notification_preferences — deliberately, see the
-- header comment above. Every read this migration adds (branches, staff,
-- members, and the Settings tab's configuration status) goes through a
-- narrow SECURITY DEFINER function below (admin_gym_branches(),
-- admin_gym_staff(), admin_gym_members(), admin_gym_configuration()) that
-- curates exactly which columns come back, instead of a blanket policy
-- that would let any admin session read every raw column of a sensitive
-- table directly over PostgREST.

-- ─────────────────────────────────────────────────────────────────────────
-- Supporting indexes — every admin_gym_* function below counts/joins these
-- tables by organization_id (or member_id) on every call; the task brief's
-- own §12 asks this to hold up at 10,000+ gyms, and these are safe, additive,
-- IF NOT EXISTS index-only changes (no lock beyond the standard index build,
-- no behavior change for the tenant app).
-- ─────────────────────────────────────────────────────────────────────────
create index if not exists members_org_active_idx on public.members (organization_id) where deleted_at is null;
create index if not exists branches_org_status_idx on public.branches (organization_id, status);
create index if not exists staff_memberships_org_idx on public.staff_memberships (organization_id);
create index if not exists platform_payments_org_status_idx on public.platform_payments (organization_id, status);
create index if not exists member_subscriptions_member_end_idx on public.member_subscriptions (member_id, end_date desc) where deleted_at is null;

-- ─────────────────────────────────────────────────────────────────────────
-- admin_gyms_summary() — the Gyms list header tiles (Total/Active/Trialing/
-- Grace/Read-only/Cancelled/Suspended + platform-wide branch/member totals).
-- One aggregate round trip, no rows returned — scales the same at 10 gyms
-- or 10,000.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.admin_gyms_summary()
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
    'total', count(*),
    'active', count(*) filter (where o.suspended_at is null and app.derive_subscription_state(os.status, os.current_period_end, os.grace_days) = 'active'),
    'trialing', count(*) filter (where o.suspended_at is null and app.derive_subscription_state(os.status, os.current_period_end, os.grace_days) = 'trialing'),
    'grace', count(*) filter (where o.suspended_at is null and app.derive_subscription_state(os.status, os.current_period_end, os.grace_days) = 'grace'),
    'read_only', count(*) filter (where o.suspended_at is null and app.derive_subscription_state(os.status, os.current_period_end, os.grace_days) = 'read_only'),
    'cancelled', count(*) filter (where o.suspended_at is null and app.derive_subscription_state(os.status, os.current_period_end, os.grace_days) = 'cancelled'),
    'suspended', count(*) filter (where o.suspended_at is not null),
    'total_branches', (select count(*) from branches where status = 'active'),
    'total_members', (select count(*) from members where deleted_at is null)
  ) into v_result
  from organizations o
  left join organization_subscriptions os on os.organization_id = o.id;

  return v_result;
end;
$$;

revoke execute on function public.admin_gyms_summary() from public, anon, authenticated;
grant execute on function public.admin_gyms_summary() to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- admin_gyms_list(...) — the Gyms table itself. Filters, a dynamic but
-- allowlisted ORDER BY (p_sort_col is switched through a fixed CASE before
-- ever reaching format(%I), so it can never carry arbitrary SQL), and
-- LIMIT/OFFSET, all in one query. `count(*) over()` reports the filtered
-- total (for the pager) without a second round trip — it's computed after
-- the WHERE clause and before LIMIT/OFFSET, i.e. exactly the "N results"
-- figure the pager needs, not the unfiltered table size.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.admin_gyms_list(
  p_search text default null,
  p_status text default null,
  p_package_id uuid default null,
  p_billing_period text default null,
  p_min_branches integer default null,
  p_sort_col text default 'created_at',
  p_sort_dir text default 'desc',
  p_limit integer default 25,
  p_offset integer default 0
)
returns table (
  organization_id uuid,
  name text,
  owner_name text,
  owner_email text,
  city text,
  package_id uuid,
  package_name text,
  package_code text,
  billing_period text,
  price_minor bigint,
  currency text,
  state text,
  suspended_at timestamptz,
  current_period_end timestamptz,
  grace_days integer,
  member_count bigint,
  member_cap integer,
  branch_count bigint,
  branch_cap integer,
  staff_count bigint,
  staff_cap integer,
  lifetime_paid_minor bigint,
  created_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_sort_col text;
  v_sort_dir text;
  v_sql text;
begin
  if not app.is_platform_admin() then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;

  v_sort_col := case p_sort_col
    when 'name' then 'name'
    when 'owner_name' then 'owner_name'
    when 'package_name' then 'package_name'
    when 'state' then 'state'
    when 'member_count' then 'member_count'
    when 'branch_count' then 'branch_count'
    when 'staff_count' then 'staff_count'
    when 'current_period_end' then 'current_period_end'
    when 'lifetime_paid_minor' then 'lifetime_paid_minor'
    when 'created_at' then 'created_at'
    else 'created_at'
  end;
  v_sort_dir := case lower(coalesce(p_sort_dir, 'desc')) when 'asc' then 'asc' else 'desc' end;

  v_sql := format($f$
    with base as (
      select
        o.id as organization_id,
        o.name,
        (
          select coalesce(nullif(trim(sm.first_name || ' ' || coalesce(sm.last_name, '')), ''), sm.email::text)
          from staff_memberships sm
          where sm.organization_id = o.id and sm.role = 'owner'
          order by sm.created_at asc
          limit 1
        ) as owner_name,
        (
          select sm.email::text
          from staff_memberships sm
          where sm.organization_id = o.id and sm.role = 'owner'
          order by sm.created_at asc
          limit 1
        ) as owner_email,
        o.city,
        pk.id as package_id,
        pk.name as package_name,
        pk.code as package_code,
        pk.billing_period,
        pk.price_minor,
        pk.currency,
        case
          when o.suspended_at is not null then 'suspended'
          else app.derive_subscription_state(os.status, os.current_period_end, os.grace_days)
        end as state,
        o.suspended_at,
        os.current_period_end,
        os.grace_days,
        (select count(*) from members m where m.organization_id = o.id and m.deleted_at is null) as member_count,
        pk.max_members as member_cap,
        (select count(*) from branches b where b.organization_id = o.id and b.status = 'active') as branch_count,
        pk.max_branches as branch_cap,
        (select count(*) from staff_memberships sm2 where sm2.organization_id = o.id) as staff_count,
        pk.max_staff as staff_cap,
        (select coalesce(sum(pp.amount_minor), 0) from platform_payments pp where pp.organization_id = o.id and pp.status = 'succeeded') as lifetime_paid_minor,
        o.created_at
      from organizations o
      left join organization_subscriptions os on os.organization_id = o.id
      left join platform_packages pk on pk.id = os.package_id
    )
    select *, count(*) over() as total_count
    from base
    where
      ($1 is null or $1 = '' or name ilike '%%' || $1 || '%%' or owner_name ilike '%%' || $1 || '%%' or owner_email ilike '%%' || $1 || '%%' or city ilike '%%' || $1 || '%%')
      and ($2 is null or state = $2)
      and ($3 is null or package_id = $3)
      and ($4 is null or billing_period = $4)
      and ($5 is null or branch_count >= $5)
    order by %I %s nulls last, organization_id
    limit $6 offset $7
  $f$, v_sort_col, v_sort_dir);

  return query execute v_sql
    using p_search, p_status, p_package_id, p_billing_period, p_min_branches, p_limit, p_offset;
end;
$$;

revoke execute on function public.admin_gyms_list(text, text, uuid, text, integer, text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.admin_gyms_list(text, text, uuid, text, integer, text, text, integer, integer) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- admin_gym_detail(p_organization_id) — the Gym Detail header + Overview
-- tab in one round trip: organization fields, owner, subscription (with
-- derived state), usage vs caps, lifetime platform revenue, and the plan's
-- feature list. jsonb (not TABLE) since this is a single nested object, not
-- a set of rows — same shape choice as admin_overview_stats.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.admin_gym_detail(p_organization_id uuid)
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
    'organization', jsonb_build_object(
      'id', o.id,
      'name', o.name,
      'slug', o.slug,
      'city', o.city,
      'state', o.state,
      'country', o.country,
      'address_line', o.address_line,
      'postal_code', o.postal_code,
      'contact_email', o.contact_email,
      'contact_phone', o.contact_phone,
      'default_timezone', o.default_timezone,
      'default_currency', o.default_currency,
      'logo_url', o.logo_url,
      'grace_period_days', o.grace_period_days,
      'week_start', o.week_start,
      'opens_at', o.opens_at,
      'closes_at', o.closes_at,
      'created_at', o.created_at,
      'updated_at', o.updated_at,
      'deletion_requested_at', o.deletion_requested_at,
      'suspended_at', o.suspended_at,
      'suspension_reason', o.suspension_reason
    ),
    'owner', (
      select jsonb_build_object(
        'staff_id', sm.id,
        'name', coalesce(nullif(trim(sm.first_name || ' ' || coalesce(sm.last_name, '')), ''), sm.email::text),
        'email', sm.email::text,
        'phone', sm.phone_e164
      )
      from staff_memberships sm
      where sm.organization_id = o.id and sm.role = 'owner'
      order by sm.created_at asc
      limit 1
    ),
    'subscription', (
      select jsonb_build_object(
        'package_id', pk.id,
        'package_name', pk.name,
        'package_code', pk.code,
        'billing_period', pk.billing_period,
        'price_minor', pk.price_minor,
        'currency', pk.currency,
        'status', os.status,
        'state', app.derive_subscription_state(os.status, os.current_period_end, os.grace_days),
        'current_period_start', os.current_period_start,
        'current_period_end', os.current_period_end,
        'grace_days', os.grace_days,
        'auto_renew', os.auto_renew,
        'cancelled_at', os.cancelled_at,
        'created_at', os.created_at
      )
      from organization_subscriptions os
      left join platform_packages pk on pk.id = os.package_id
      where os.organization_id = o.id
    ),
    'usage', jsonb_build_object(
      'member_count', (select count(*) from members m where m.organization_id = o.id and m.deleted_at is null),
      'branch_count', (select count(*) from branches b where b.organization_id = o.id and b.status = 'active'),
      'staff_count', (select count(*) from staff_memberships sm2 where sm2.organization_id = o.id),
      'member_cap', pk.max_members,
      'branch_cap', pk.max_branches,
      'staff_cap', pk.max_staff
    ),
    'lifetime_paid_minor', (select coalesce(sum(pp.amount_minor), 0) from platform_payments pp where pp.organization_id = o.id and pp.status = 'succeeded'),
    'features', coalesce(pk.features, '{}')
  ) into v_result
  from organizations o
  left join organization_subscriptions os on os.organization_id = o.id
  left join platform_packages pk on pk.id = os.package_id
  where o.id = p_organization_id;

  if v_result is null then
    raise exception 'Gym not found' using errcode = 'no_data_found';
  end if;

  return v_result;
end;
$$;

revoke execute on function public.admin_gym_detail(uuid) from public, anon, authenticated;
grant execute on function public.admin_gym_detail(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- admin_gym_branches(...) — the Detail page's Branches tab.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.admin_gym_branches(
  p_organization_id uuid,
  p_search text default null,
  p_status text default null,
  p_sort_col text default 'created_at',
  p_sort_dir text default 'desc',
  p_limit integer default 25,
  p_offset integer default 0
)
returns table (
  id uuid,
  name text,
  status text,
  timezone text,
  currency text,
  member_count bigint,
  staff_count bigint,
  created_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_sort_col text;
  v_sort_dir text;
  v_sql text;
begin
  if not app.is_platform_admin() then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from organizations where id = p_organization_id) then
    raise exception 'Gym not found' using errcode = 'no_data_found';
  end if;

  v_sort_col := case p_sort_col
    when 'name' then 'name'
    when 'status' then 'status'
    when 'member_count' then 'member_count'
    when 'staff_count' then 'staff_count'
    when 'created_at' then 'created_at'
    else 'created_at'
  end;
  v_sort_dir := case lower(coalesce(p_sort_dir, 'desc')) when 'asc' then 'asc' else 'desc' end;

  v_sql := format($f$
    with base as (
      select
        b.id, b.name, b.status, b.timezone, b.currency,
        (select count(*) from members m where m.branch_id = b.id and m.deleted_at is null) as member_count,
        (select count(*) from staff_memberships sm where sm.branch_id = b.id) as staff_count,
        b.created_at
      from branches b
      where b.organization_id = $1
    )
    select *, count(*) over() as total_count
    from base
    where
      ($2 is null or $2 = '' or name ilike '%%' || $2 || '%%')
      and ($3 is null or status = $3)
    order by %I %s nulls last, id
    limit $4 offset $5
  $f$, v_sort_col, v_sort_dir);

  return query execute v_sql using p_organization_id, p_search, p_status, p_limit, p_offset;
end;
$$;

revoke execute on function public.admin_gym_branches(uuid, text, text, text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.admin_gym_branches(uuid, text, text, text, text, integer, integer) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- admin_gym_staff(...) — the Detail page's Users & Staff tab. Real PII per
-- the product owner's reversal (see header) — name/email/phone/role/branch.
-- No `last_login` column exists anywhere in this schema (neither
-- staff_memberships nor auth.users is read here), so this deliberately
-- does not invent one; the UI shows "Not tracked" rather than a fabricated
-- date. "Status" is derived from `deletion_requested_at` (the only
-- lifecycle signal staff_memberships actually has), not a real `status`
-- column — this table has none.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.admin_gym_staff(
  p_organization_id uuid,
  p_search text default null,
  p_role text default null,
  p_branch_id uuid default null,
  p_status text default null,
  p_sort_col text default 'created_at',
  p_sort_dir text default 'desc',
  p_limit integer default 25,
  p_offset integer default 0
)
returns table (
  id uuid,
  first_name text,
  last_name text,
  email text,
  role text,
  branch_id uuid,
  branch_name text,
  phone_e164 text,
  status text,
  created_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_sort_col text;
  v_sort_dir text;
  v_sql text;
begin
  if not app.is_platform_admin() then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from organizations where id = p_organization_id) then
    raise exception 'Gym not found' using errcode = 'no_data_found';
  end if;

  v_sort_col := case p_sort_col
    when 'name' then 'first_name'
    when 'role' then 'role'
    when 'status' then 'status'
    when 'branch_name' then 'branch_name'
    when 'created_at' then 'created_at'
    else 'created_at'
  end;
  v_sort_dir := case lower(coalesce(p_sort_dir, 'desc')) when 'asc' then 'asc' else 'desc' end;

  v_sql := format($f$
    with base as (
      select
        sm.id, sm.first_name, sm.last_name, sm.email::text as email, sm.role,
        sm.branch_id, br.name as branch_name, sm.phone_e164,
        case when sm.deletion_requested_at is not null then 'pending_removal' else 'active' end as status,
        sm.created_at
      from staff_memberships sm
      left join branches br on br.id = sm.branch_id
      where sm.organization_id = $1
    )
    select *, count(*) over() as total_count
    from base
    where
      ($2 is null or $2 = '' or first_name ilike '%%' || $2 || '%%' or last_name ilike '%%' || $2 || '%%' or email ilike '%%' || $2 || '%%')
      and ($3 is null or role = $3)
      and ($4 is null or branch_id = $4)
      and ($5 is null or status = $5)
    order by %I %s nulls last, id
    limit $6 offset $7
  $f$, v_sort_col, v_sort_dir);

  return query execute v_sql
    using p_organization_id, p_search, p_role, p_branch_id, p_status, p_limit, p_offset;
end;
$$;

revoke execute on function public.admin_gym_staff(uuid, text, text, uuid, text, text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.admin_gym_staff(uuid, text, text, uuid, text, text, text, integer, integer) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- admin_gym_members(...) — the Detail page's Members tab. Real PII per the
-- product owner's reversal (see header). A member's current plan/expiry
-- comes from its most-recent (by end_date) non-deleted member_subscriptions
-- row via a LATERAL join — the same "latest row wins" idea FitDeskApp's own
-- billing access resolution uses, just applied per-member instead of
-- per-org.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.admin_gym_members(
  p_organization_id uuid,
  p_search text default null,
  p_status text default null,
  p_branch_id uuid default null,
  p_plan_name text default null,
  p_expiry_state text default null,
  p_sort_col text default 'created_at',
  p_sort_dir text default 'desc',
  p_limit integer default 25,
  p_offset integer default 0
)
returns table (
  id uuid,
  first_name text,
  last_name text,
  email text,
  phone_e164 text,
  branch_id uuid,
  branch_name text,
  status text,
  joined_on date,
  created_at timestamptz,
  plan_name text,
  subscription_end_date timestamptz,
  expiry_state text,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_sort_col text;
  v_sort_dir text;
  v_sql text;
begin
  if not app.is_platform_admin() then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from organizations where id = p_organization_id) then
    raise exception 'Gym not found' using errcode = 'no_data_found';
  end if;

  v_sort_col := case p_sort_col
    when 'name' then 'first_name'
    when 'status' then 'status'
    when 'joined_on' then 'joined_on'
    when 'subscription_end_date' then 'subscription_end_date'
    when 'created_at' then 'created_at'
    else 'created_at'
  end;
  v_sort_dir := case lower(coalesce(p_sort_dir, 'desc')) when 'asc' then 'asc' else 'desc' end;

  v_sql := format($f$
    with base as (
      select
        m.id, m.first_name, m.last_name, m.email::text as email, m.phone_e164,
        m.branch_id, br.name as branch_name, m.status, m.joined_on, m.created_at,
        ms.plan_name_snapshot as plan_name,
        ms.end_date as subscription_end_date,
        case
          when ms.id is null then 'none'
          when ms.end_date < now() then 'expired'
          when ms.end_date < now() + interval '7 days' then 'expiring_soon'
          else 'active'
        end as expiry_state
      from members m
      left join branches br on br.id = m.branch_id
      left join lateral (
        select ms2.id, ms2.plan_name_snapshot, ms2.end_date
        from member_subscriptions ms2
        where ms2.member_id = m.id and ms2.deleted_at is null
        order by ms2.end_date desc
        limit 1
      ) ms on true
      where m.organization_id = $1 and m.deleted_at is null
    )
    select *, count(*) over() as total_count
    from base
    where
      ($2 is null or $2 = '' or first_name ilike '%%' || $2 || '%%' or last_name ilike '%%' || $2 || '%%' or email ilike '%%' || $2 || '%%' or phone_e164 ilike '%%' || $2 || '%%')
      and ($3 is null or status = $3)
      and ($4 is null or branch_id = $4)
      and ($5 is null or plan_name ilike '%%' || $5 || '%%')
      and ($6 is null or expiry_state = $6)
    order by %I %s nulls last, id
    limit $7 offset $8
  $f$, v_sort_col, v_sort_dir);

  return query execute v_sql
    using p_organization_id, p_search, p_status, p_branch_id, p_plan_name, p_expiry_state, p_limit, p_offset;
end;
$$;

revoke execute on function public.admin_gym_members(uuid, text, text, uuid, text, text, text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.admin_gym_members(uuid, text, text, uuid, text, text, text, text, integer, integer) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- admin_gym_configuration(...) — the Settings tab's "Configuration"
-- section (task brief §10). Connection *status* only, curated explicitly —
-- never key_id, never a token, never anything from
-- payment_gateway_secrets/whatsapp_secrets (this function doesn't touch
-- those tables at all, and they get no RLS policy of any kind here).
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.admin_gym_configuration(p_organization_id uuid)
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
    'payment', (
      select jsonb_build_object('status', status, 'last_error', last_error)
      from payment_gateway_integrations where organization_id = p_organization_id
    ),
    'whatsapp', (
      select jsonb_build_object('status', status, 'last_error', last_error)
      from whatsapp_integrations where organization_id = p_organization_id
    ),
    'notifications', (
      select jsonb_build_object(
        'default_channel', default_channel,
        'weekly_digest_enabled', weekly_digest_enabled,
        'renewal_reminders_enabled', renewal_reminders_enabled,
        'payment_reminders_enabled', payment_reminders_enabled
      )
      from notification_preferences where organization_id = p_organization_id
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke execute on function public.admin_gym_configuration(uuid) from public, anon, authenticated;
grant execute on function public.admin_gym_configuration(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- admin_gym_billing_history(...) — the Subscription & Billing tab's invoice
-- table, scoped to one organization. `provider` (razorpay etc.) stands in
-- for "payment method" — platform_payments has no separate method column
-- (unlike the tenant `payments` table's `method`), so this is labelled
-- "Provider" in the UI rather than inventing a method taxonomy that
-- doesn't exist for platform billing.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.admin_gym_billing_history(
  p_organization_id uuid,
  p_status text default null,
  p_provider text default null,
  p_date_from timestamptz default null,
  p_date_to timestamptz default null,
  p_sort_col text default 'created_at',
  p_sort_dir text default 'desc',
  p_limit integer default 25,
  p_offset integer default 0
)
returns table (
  id uuid,
  invoice_number text,
  amount_minor bigint,
  currency text,
  status text,
  provider text,
  paid_at timestamptz,
  period_start timestamptz,
  period_end timestamptz,
  package_name text,
  created_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_sort_col text;
  v_sort_dir text;
  v_sql text;
begin
  if not app.is_platform_admin() then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from organizations where id = p_organization_id) then
    raise exception 'Gym not found' using errcode = 'no_data_found';
  end if;

  v_sort_col := case p_sort_col
    when 'amount_minor' then 'amount_minor'
    when 'status' then 'status'
    when 'paid_at' then 'paid_at'
    when 'created_at' then 'created_at'
    else 'created_at'
  end;
  v_sort_dir := case lower(coalesce(p_sort_dir, 'desc')) when 'asc' then 'asc' else 'desc' end;

  v_sql := format($f$
    with base as (
      select
        pp.id, pp.invoice_number, pp.amount_minor, pp.currency, pp.status, pp.provider,
        pp.paid_at, pp.period_start, pp.period_end, pk.name as package_name, pp.created_at
      from platform_payments pp
      left join platform_packages pk on pk.id = pp.package_id
      where pp.organization_id = $1
    )
    select *, count(*) over() as total_count
    from base
    where
      ($2 is null or status = $2)
      and ($3 is null or provider = $3)
      and ($4 is null or created_at >= $4)
      and ($5 is null or created_at <= $5)
    order by %I %s nulls last, id
    limit $6 offset $7
  $f$, v_sort_col, v_sort_dir);

  return query execute v_sql
    using p_organization_id, p_status, p_provider, p_date_from, p_date_to, p_limit, p_offset;
end;
$$;

revoke execute on function public.admin_gym_billing_history(uuid, text, text, timestamptz, timestamptz, text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.admin_gym_billing_history(uuid, text, text, timestamptz, timestamptz, text, text, integer, integer) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- admin_gym_audit_log(...) — the Detail page's Activity/Audit tab, scoped
-- to admin_audit_log rows targeting this one organization. Sort is
-- timestamp-only (the brief's own §9 only asks for "sorting by timestamp"),
-- so no sort-column allowlist is needed here — just the direction.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.admin_gym_audit_log(
  p_organization_id uuid,
  p_search text default null,
  p_action text default null,
  p_actor_id uuid default null,
  p_date_from timestamptz default null,
  p_date_to timestamptz default null,
  p_sort_dir text default 'desc',
  p_limit integer default 25,
  p_offset integer default 0
)
returns table (
  id bigint,
  action text,
  admin_id uuid,
  admin_email text,
  detail jsonb,
  at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_sort_dir text;
  v_sql text;
begin
  if not app.is_platform_admin() then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from organizations where id = p_organization_id) then
    raise exception 'Gym not found' using errcode = 'no_data_found';
  end if;

  v_sort_dir := case lower(coalesce(p_sort_dir, 'desc')) when 'asc' then 'asc' else 'desc' end;

  v_sql := format($f$
    with base as (
      select
        al.id, al.action, al.admin_id, pa.email::text as admin_email, al.detail, al.at
      from admin_audit_log al
      left join platform_admins pa on pa.user_id = al.admin_id
      where al.target_organization_id = $1
    )
    select *, count(*) over() as total_count
    from base
    where
      ($2 is null or $2 = '' or action ilike '%%' || $2 || '%%')
      and ($3 is null or action = $3)
      and ($4 is null or admin_id = $4)
      and ($5 is null or at >= $5)
      and ($6 is null or at <= $6)
    order by at %s nulls last, id
    limit $7 offset $8
  $f$, v_sort_dir);

  return query execute v_sql
    using p_organization_id, p_search, p_action, p_actor_id, p_date_from, p_date_to, p_limit, p_offset;
end;
$$;

revoke execute on function public.admin_gym_audit_log(uuid, text, text, uuid, timestamptz, timestamptz, text, integer, integer) from public, anon, authenticated;
grant execute on function public.admin_gym_audit_log(uuid, text, text, uuid, timestamptz, timestamptz, text, integer, integer) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- admin_suspend_organization / admin_reactivate_organization — the hard-
-- suspend write path (see header for scope/limits). Suspending an
-- already-suspended org (or reactivating a non-suspended one) raises
-- rather than silently no-opping, same "not found" convention as every
-- other admin_* write RPC in this app.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.admin_suspend_organization(
  p_organization_id uuid,
  p_reason text default null
) returns void
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
begin
  if not app.is_platform_admin() then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;

  update organizations
  set suspended_at = now(), suspended_by = auth.uid(), suspension_reason = nullif(trim(p_reason), '')
  where id = p_organization_id and suspended_at is null;
  if not found then
    raise exception 'Gym not found or already suspended' using errcode = 'no_data_found';
  end if;

  insert into admin_audit_log (admin_id, action, target_organization_id, detail)
  values (auth.uid(), 'organization.suspend', p_organization_id, jsonb_build_object('reason', p_reason));
end;
$$;

revoke execute on function public.admin_suspend_organization(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_suspend_organization(uuid, text) to authenticated;

create or replace function public.admin_reactivate_organization(
  p_organization_id uuid
) returns void
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
begin
  if not app.is_platform_admin() then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;

  update organizations
  set suspended_at = null, suspended_by = null, suspension_reason = null
  where id = p_organization_id and suspended_at is not null;
  if not found then
    raise exception 'Gym is not suspended' using errcode = 'no_data_found';
  end if;

  insert into admin_audit_log (admin_id, action, target_organization_id, detail)
  values (auth.uid(), 'organization.reactivate', p_organization_id, '{}'::jsonb);
end;
$$;

revoke execute on function public.admin_reactivate_organization(uuid) from public, anon, authenticated;
grant execute on function public.admin_reactivate_organization(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- admin_update_organization_profile(...) — the Settings tab's "Edit gym"
-- write path (section 2/10 of the task brief). Deliberately a fixed set of
-- profile fields (name, location, contact details, timezone/currency,
-- grace period) — never logo_url (no upload pipeline exists in this app to
-- validate it), never anything from payment_gateway_secrets/
-- whatsapp_secrets (never surfaced, per the brief's own "do NOT expose
-- sensitive secrets" instruction — this RPC doesn't touch those tables at
-- all).
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.admin_update_organization_profile(
  p_organization_id uuid,
  p_name text,
  p_city text,
  p_address_line text,
  p_postal_code text,
  p_state text,
  p_country text,
  p_contact_email text,
  p_contact_phone text,
  p_default_timezone text,
  p_default_currency text,
  p_grace_period_days integer
) returns void
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_before jsonb;
begin
  if not app.is_platform_admin() then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;
  if p_grace_period_days < 0 then
    raise exception 'grace_period_days must be >= 0';
  end if;
  if p_name is null or trim(p_name) = '' then
    raise exception 'name is required';
  end if;

  select jsonb_build_object('name', name, 'city', city) into v_before
  from organizations where id = p_organization_id;
  if v_before is null then
    raise exception 'Gym not found' using errcode = 'no_data_found';
  end if;

  update organizations set
    name = p_name,
    city = nullif(trim(p_city), ''),
    address_line = nullif(trim(p_address_line), ''),
    postal_code = nullif(trim(p_postal_code), ''),
    state = nullif(trim(p_state), ''),
    country = nullif(trim(p_country), ''),
    contact_email = nullif(trim(p_contact_email), ''),
    contact_phone = nullif(trim(p_contact_phone), ''),
    default_timezone = coalesce(nullif(trim(p_default_timezone), ''), default_timezone),
    default_currency = coalesce(nullif(trim(p_default_currency), ''), default_currency),
    grace_period_days = p_grace_period_days,
    updated_at = now()
  where id = p_organization_id;

  insert into admin_audit_log (admin_id, action, target_organization_id, detail)
  values (
    auth.uid(), 'organization.update_profile', p_organization_id,
    jsonb_build_object('before', v_before, 'after', jsonb_build_object('name', p_name, 'city', p_city))
  );
end;
$$;

revoke execute on function public.admin_update_organization_profile(uuid, text, text, text, text, text, text, text, text, text, text, integer) from public, anon, authenticated;
grant execute on function public.admin_update_organization_profile(uuid, text, text, text, text, text, text, text, text, text, text, integer) to authenticated;
