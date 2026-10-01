-- Platform-admin read: who added a member, who recorded their last payment,
-- and who assigned each of their memberships.
--
-- Nothing new is stored. The tenant schema has no `created_by` on members, but
-- every relevant write is already attributed somewhere:
--   * payments.recorded_by            - who recorded the payment (null for a
--                                       gateway/online payment with no staff user)
--   * audit_log (INSERT, actor_id)    - who created a member / a membership.
--     The members audit trigger only started on 2026-09-30, so older members
--     have no direct row. For those, the actor of the member's FIRST membership
--     is used instead (the add-member flow creates both in one request) and the
--     result is flagged `first_membership` so the UI can say it is inferred.
--
-- Names come from staff_memberships (owners are staff rows too). A user id that
-- no longer resolves to a staff row returns a null name with the id present, so
-- the UI can say "former staff member" rather than "unknown".
--
-- Two read-only SECURITY DEFINER functions, admin-gated, same grants as the other
-- admin_gym_member_* reads. No RLS change, no new column, no write path.

create or replace function public.admin_gym_member_actors(
  p_organization_id uuid,
  p_member_ids uuid[]
)
returns table (
  member_id uuid,
  added_by_name text,
  added_by_role text,
  added_by_source text,
  added_by_known boolean,
  payment_recorded_by_name text,
  payment_recorded_by_role text,
  payment_has_recorder boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.is_platform_admin() then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;

  if p_member_ids is null or cardinality(p_member_ids) = 0 then
    return;
  end if;
  if cardinality(p_member_ids) > 200 then
    raise exception 'Too many members requested' using errcode = 'invalid_parameter_value';
  end if;

  return query
  with src as (
    select
      m.id as mid,
      m.organization_id as oid,
      (
        select a.actor_id
        from public.audit_log a
        where a.organization_id = m.organization_id
          and a.table_name = 'members'
          and a.action = 'INSERT'
          and a.record_id = m.id
          and a.actor_id is not null
        order by a.at asc
        limit 1
      ) as direct_actor,
      (
        select a.actor_id
        from public.member_subscriptions s
        join public.audit_log a
          on a.organization_id = s.organization_id
         and a.table_name = 'member_subscriptions'
         and a.action = 'INSERT'
         and a.record_id = s.id
        where s.organization_id = m.organization_id
          and s.member_id = m.id
          and a.actor_id is not null
        order by s.created_at asc, a.at asc
        limit 1
      ) as sub_actor,
      (
        select p.recorded_by
        from public.payments p
        where p.organization_id = m.organization_id
          and p.member_id = m.id
        order by coalesce(p.paid_at, p.created_at) desc, p.id
        limit 1
      ) as pay_actor
    from public.members m
    where m.organization_id = p_organization_id
      and m.id = any (p_member_ids)
  )
  select
    s.mid,
    case when s.direct_actor is not null then da.nm else sa.nm end,
    case when s.direct_actor is not null then da.rl else sa.rl end,
    case
      when s.direct_actor is not null then 'record'
      when s.sub_actor is not null then 'first_membership'
      else null
    end,
    (s.direct_actor is not null or s.sub_actor is not null),
    pa.nm,
    pa.rl,
    (s.pay_actor is not null)
  from src s
  left join lateral (
    select nullif(trim(concat_ws(' ', sm.first_name, sm.last_name)), '') as nm, sm.role::text as rl
    from public.staff_memberships sm
    where sm.organization_id = s.oid and sm.user_id = s.direct_actor
    limit 1
  ) da on true
  left join lateral (
    select nullif(trim(concat_ws(' ', sm.first_name, sm.last_name)), '') as nm, sm.role::text as rl
    from public.staff_memberships sm
    where sm.organization_id = s.oid and sm.user_id = s.sub_actor
    limit 1
  ) sa on true
  left join lateral (
    select nullif(trim(concat_ws(' ', sm.first_name, sm.last_name)), '') as nm, sm.role::text as rl
    from public.staff_memberships sm
    where sm.organization_id = s.oid and sm.user_id = s.pay_actor
    limit 1
  ) pa on true;
end;
$$;

revoke execute on function public.admin_gym_member_actors(uuid, uuid[])
  from public, anon, authenticated;
grant execute on function public.admin_gym_member_actors(uuid, uuid[])
  to authenticated;

create or replace function public.admin_gym_member_subscription_actors(
  p_organization_id uuid,
  p_member_id uuid
)
returns table (
  subscription_id uuid,
  assigned_by_name text,
  assigned_by_role text,
  assigned_by_known boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.is_platform_admin() then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;

  return query
  select
    s.id,
    st.nm,
    st.rl,
    (ins.actor is not null)
  from public.member_subscriptions s
  left join lateral (
    select a.actor_id as actor
    from public.audit_log a
    where a.organization_id = s.organization_id
      and a.table_name = 'member_subscriptions'
      and a.action = 'INSERT'
      and a.record_id = s.id
      and a.actor_id is not null
    order by a.at asc
    limit 1
  ) ins on true
  left join lateral (
    select nullif(trim(concat_ws(' ', sm.first_name, sm.last_name)), '') as nm, sm.role::text as rl
    from public.staff_memberships sm
    where sm.organization_id = s.organization_id and sm.user_id = ins.actor
    limit 1
  ) st on true
  where s.organization_id = p_organization_id
    and s.member_id = p_member_id
  order by s.start_date desc, s.created_at desc
  limit 100;
end;
$$;

revoke execute on function public.admin_gym_member_subscription_actors(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.admin_gym_member_subscription_actors(uuid, uuid)
  to authenticated;
