-- ─────────────────────────────────────────────────────────────────────────
-- 1011 — two more RETURNS TABLE row-type mismatches from 1009, of the same
-- family as 1010's admin_gyms_list fix but hidden behind it: those two
-- functions raised 42702 on the existence guard before ever reaching the
-- row-type check, so their real return-shape bugs only surfaced once 1010
-- let execution get that far.
--
--   * admin_gym_branches — `branches.currency` is `character(3)` (bpchar),
--     not text, so returning it into a `currency text` output column failed
--     with 42804 "Returned type character(3) does not match expected type
--     text in column 5". Cast to ::text (the value is exactly 3 chars, so
--     there is no trailing-space semantics to preserve).
--
--   * admin_gym_members — `member_subscriptions.end_date` is a `date`, but
--     the output column is declared `subscription_end_date timestamptz`.
--     Cast to ::timestamptz rather than redeclaring the column as date, so
--     the function's published signature (and the generated TypeScript
--     type the app already compiles against) stays unchanged.
--
-- Everything else in both bodies is byte-identical to 1010.
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
        b.id, b.name, b.status, b.timezone, b.currency::text as currency,
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
        ms.end_date::timestamptz as subscription_end_date,
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
