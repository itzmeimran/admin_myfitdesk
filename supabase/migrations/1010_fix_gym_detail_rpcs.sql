-- ─────────────────────────────────────────────────────────────────────────
-- 1010 — fixes six functions from 1009_admin_gym_detail.sql that were
-- created successfully but raised at *call* time, so /admin/gyms crashed
-- with a 400 from PostgREST on the live deployment.
--
-- Two distinct defects, both invisible to `create function` (plpgsql only
-- parses a function body's syntax at definition time — name resolution and
-- the RETURNS TABLE row-type check happen on first execution):
--
--   1. admin_gyms_list — `coalesce(sum(pp.amount_minor), 0)` is *numeric*
--      (sum(bigint) → numeric), but the column is declared `bigint` in
--      RETURNS TABLE, so every call failed with 42804 "structure of query
--      does not match function result type ... column 22". Fixed with an
--      explicit ::bigint. (admin_gym_directory, 1002, never hit this: it
--      builds the same sum inside jsonb, where numeric is fine.)
--
--   2. admin_gym_branches / _staff / _members / _billing_history /
--      _audit_log — the "does this gym exist" guard,
--      `select 1 from organizations where id = p_organization_id`, has an
--      unqualified `id` that collides with the function's own RETURNS TABLE
--      OUT parameter also named `id`, so every call failed with 42702
--      "column reference \"id\" is ambiguous". Fixed by qualifying it as
--      `organizations.id`. The five functions here are exactly the ones
--      that both declare an `id` output column and run that guard;
--      admin_gym_detail/_configuration return jsonb (no `id` OUT param)
--      and were never affected.
--
-- Bodies are otherwise copied verbatim from 1009 — this migration changes
-- nothing else about them, and re-issues each function's revoke/grant pair
-- unchanged so the privilege set is explicit at this version too.
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
        (select coalesce(sum(pp.amount_minor), 0)::bigint from platform_payments pp where pp.organization_id = o.id and pp.status = 'succeeded') as lifetime_paid_minor,
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
  if not exists (select 1 from organizations where organizations.id = p_organization_id) then
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
  if not exists (select 1 from organizations where organizations.id = p_organization_id) then
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
  if not exists (select 1 from organizations where organizations.id = p_organization_id) then
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
  if not exists (select 1 from organizations where organizations.id = p_organization_id) then
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
  if not exists (select 1 from organizations where organizations.id = p_organization_id) then
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

