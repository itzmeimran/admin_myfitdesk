-- ═══════════════════════════════════════════════════════════════════════
-- CLAUDE.md's Plan, P1 item 5: subscription management on the Gyms
-- directory. organization_subscriptions has an admin-gated SELECT policy
-- (1002) but, per that migration's own comment, deliberately no write
-- policy of any kind — "extending/cancelling a tenant today = raw SQL".
-- This migration closes that gap the same way 1003 did for
-- platform_packages: narrow SECURITY DEFINER RPCs, never a blanket RLS
-- write policy, so every mutation is validated server-side and always
-- lands an admin_audit_log row in the same transaction as the write.
--
-- Four actions, matching the four things an admin can actually do to a
-- subscription without a full billing engine:
--
--   admin_extend_subscription   — push current_period_end out by N days.
--     Extends from GREATEST(current_period_end, now()), not from the raw
--     stored period_end alone — a gym that's 9 days overdue and gets a
--     7-day extension should land 7 days from TODAY, not still 2 days
--     overdue. (This is the "Extend"/"Chase renewals" action the Overview
--     and Gyms screens' risk rows already have copy for.)
--
--   admin_change_subscription_package — reassign package_id going forward.
--     Deliberately does NOT touch current_period_end or proration — this
--     app has no billing engine to compute a fair mid-cycle credit, so
--     changing tiers takes effect immediately at the *existing* renewal
--     date rather than guessing a prorated one. Flagging this as a real
--     product gap rather than silently picking a proration rule (same
--     spirit as this app's other TODO(product-decision) notes) — an admin
--     who wants the new price to apply from today should pair this with
--     Extend.
--
--   admin_cancel_subscription — status='cancelled', cancelled_at=now(),
--     auto_renew=false. derive_subscription_state() (1002) treats
--     status='cancelled' as terminal regardless of dates, matching the
--     Cancelled pill's own meaning ("the owner/admin ended this on
--     purpose", distinct from Read-only's "just lapsed").
--
--   admin_restore_subscription — the inverse: status='active',
--     cancelled_at=null. Deliberately does NOT extend current_period_end —
--     if that date is already in the past, derive_subscription_state()
--     correctly shows the gym as Grace/Read-only after restore (never
--     silently "Active" with a stale date), and the admin can Extend
--     separately if the intent was "give them access again", not just
--     "undo my own mis-click".
--
-- All four: SECURITY DEFINER, pinned search_path, explicit
-- revoke-then-grant (same as every admin_* function so far — see 1001's
-- comment on why both revokes are required).
-- ═══════════════════════════════════════════════════════════════════════

-- admin_gym_directory() gains package_id — the Gyms screen's new "change
-- package" control needs the org's *current* package id to pre-select it,
-- which the existing package_name/package_code columns can't give it.
-- Postgres won't let CREATE OR REPLACE change a function's return
-- signature, so this drops and recreates it (same body otherwise, same
-- admin gate, same revoke-then-grant).
drop function if exists public.admin_gym_directory();

create or replace function public.admin_gym_directory()
returns table (
  organization_id uuid,
  name text,
  owner_name text,
  city text,
  package_id uuid,
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
    pk.id,
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

create or replace function public.admin_extend_subscription(
  p_organization_id uuid,
  p_days integer
) returns void
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_before timestamptz;
  v_after timestamptz;
begin
  if not app.is_platform_admin() then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;
  if p_days <= 0 then
    raise exception 'days must be positive';
  end if;

  select current_period_end into v_before
  from organization_subscriptions where organization_id = p_organization_id;
  if v_before is null then
    raise exception 'Subscription not found' using errcode = 'no_data_found';
  end if;

  v_after := greatest(v_before, now()) + make_interval(days => p_days);

  update organization_subscriptions
  set current_period_end = v_after, updated_at = now()
  where organization_id = p_organization_id;

  insert into admin_audit_log (admin_id, action, target_organization_id, detail)
  values (
    auth.uid(), 'subscription.extend', p_organization_id,
    jsonb_build_object('days', p_days, 'before', v_before, 'after', v_after)
  );
end;
$$;

revoke execute on function public.admin_extend_subscription(uuid, integer) from public, anon, authenticated;
grant execute on function public.admin_extend_subscription(uuid, integer) to authenticated;

create or replace function public.admin_change_subscription_package(
  p_organization_id uuid,
  p_package_id uuid
) returns void
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_before uuid;
begin
  if not app.is_platform_admin() then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from platform_packages where id = p_package_id) then
    raise exception 'Package not found' using errcode = 'no_data_found';
  end if;

  select package_id into v_before
  from organization_subscriptions where organization_id = p_organization_id;
  if not found then
    raise exception 'Subscription not found' using errcode = 'no_data_found';
  end if;

  update organization_subscriptions
  set package_id = p_package_id, updated_at = now()
  where organization_id = p_organization_id;

  insert into admin_audit_log (admin_id, action, target_organization_id, detail)
  values (
    auth.uid(), 'subscription.change_package', p_organization_id,
    jsonb_build_object('before_package_id', v_before, 'after_package_id', p_package_id)
  );
end;
$$;

revoke execute on function public.admin_change_subscription_package(uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_change_subscription_package(uuid, uuid) to authenticated;

create or replace function public.admin_cancel_subscription(
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

  update organization_subscriptions
  set status = 'cancelled', cancelled_at = now(), auto_renew = false, updated_at = now()
  where organization_id = p_organization_id;
  if not found then
    raise exception 'Subscription not found' using errcode = 'no_data_found';
  end if;

  insert into admin_audit_log (admin_id, action, target_organization_id, detail)
  values (auth.uid(), 'subscription.cancel', p_organization_id, '{}'::jsonb);
end;
$$;

revoke execute on function public.admin_cancel_subscription(uuid) from public, anon, authenticated;
grant execute on function public.admin_cancel_subscription(uuid) to authenticated;

create or replace function public.admin_restore_subscription(
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

  update organization_subscriptions
  set status = 'active', cancelled_at = null, updated_at = now()
  where organization_id = p_organization_id and status = 'cancelled';
  if not found then
    raise exception 'Subscription is not cancelled' using errcode = 'no_data_found';
  end if;

  insert into admin_audit_log (admin_id, action, target_organization_id, detail)
  values (auth.uid(), 'subscription.restore', p_organization_id, '{}'::jsonb);
end;
$$;

revoke execute on function public.admin_restore_subscription(uuid) from public, anon, authenticated;
grant execute on function public.admin_restore_subscription(uuid) to authenticated;
