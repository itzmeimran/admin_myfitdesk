-- ═══════════════════════════════════════════════════════════════════════
-- Closes the gap 1004's own comment flagged and left open: "Change package
-- ... takes effect immediately at the existing renewal date." For a gym
-- that is still inside a live period — trialing, or already on a paid
-- package — that left the new package_id inert rather than deferred: caps
-- changed today, but nothing scheduled what happens when the existing
-- renewal date actually arrives, so the gym silently fell into grace/
-- read_only on that date exactly as if no package had ever been assigned.
-- Reported directly by the gym owner testing this against Steel Fitness
-- (still 36+ days into its trial, "Change package" set package_id to
-- MyFitDesk Plans, status stayed 'trialing', current_period_end never
-- moved).
--
-- Requires FitDeskApp's migration 0074 (organization_subscriptions gains
-- pending_package_id / pending_period_start / pending_period_end, plus
-- that repo's daily activate-pending-subscriptions cron that promotes a
-- queued package once its start date arrives) applied FIRST — this
-- migration only writes those columns, it does not create them, since
-- FitDeskApp owns this table (see 0028's own header on why the two apps'
-- migrations interleave on shared tables).
--
--   admin_change_subscription_package — now branches on whether the gym
--     is still inside its current period:
--       * current_period_end already passed (grace/read_only/no active
--         period) → applies immediately, exactly like admin_extend_
--         subscription's own "from GREATEST(current_period_end, now())"
--         reasoning: there is no live period to protect, so starting the
--         new package from today is correct, not a workaround.
--       * still inside a live period → QUEUES it instead: package_id,
--         status and current_period_end are all left untouched, and
--         pending_package_id / pending_period_start (= the existing
--         current_period_end) / pending_period_end (= that + the new
--         package's duration_days) are set. The gym owner's own
--         Subscription screen shows this as "Upcoming package — starts
--         <date>" (FitDeskApp's billing page) the moment this commits.
--
--   admin_clear_pending_subscription_package — the undo, for a mis-click
--     or a changed mind before the queued package activates. No-ops
--     (raises no_data_found) if nothing is actually queued, so a second
--     click can't silently look like it did something.
--
-- Both: SECURITY DEFINER, pinned search_path, explicit revoke-then-grant,
-- same shape as every other admin_* function (see 1001's own comment on
-- why both revokes are required), and both write admin_audit_log in the
-- same transaction as the mutation.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.admin_change_subscription_package(
  p_organization_id uuid,
  p_package_id uuid
) returns void
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_before_package_id uuid;
  v_current_period_end timestamptz;
  v_duration_days integer;
  v_now timestamptz := now();
  v_scheduled boolean;
  v_pending_start timestamptz;
  v_pending_end timestamptz;
begin
  if not app.is_platform_admin() then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;

  select duration_days into v_duration_days
  from platform_packages where id = p_package_id;
  if not found then
    raise exception 'Package not found' using errcode = 'no_data_found';
  end if;

  select package_id, current_period_end into v_before_package_id, v_current_period_end
  from organization_subscriptions where organization_id = p_organization_id;
  if not found then
    raise exception 'Subscription not found' using errcode = 'no_data_found';
  end if;

  if v_current_period_end <= v_now then
    -- No live period to protect — apply now, same "from GREATEST(..., now())"
    -- reasoning admin_extend_subscription already uses.
    v_scheduled := false;
    update organization_subscriptions
    set
      package_id = p_package_id,
      status = 'active',
      current_period_start = v_now,
      current_period_end = v_now + make_interval(days => v_duration_days),
      pending_package_id = null,
      pending_period_start = null,
      pending_period_end = null,
      cancelled_at = null,
      updated_at = v_now
    where organization_id = p_organization_id;
  else
    -- Still inside a live (trial or paid) period — queue it for when that
    -- period actually ends. Today's package_id/status/current_period_end
    -- are deliberately untouched: caps, price and access all stay exactly
    -- what they already were until the scheduled start date arrives.
    v_scheduled := true;
    v_pending_start := v_current_period_end;
    v_pending_end := v_current_period_end + make_interval(days => v_duration_days);
    update organization_subscriptions
    set
      pending_package_id = p_package_id,
      pending_period_start = v_pending_start,
      pending_period_end = v_pending_end,
      updated_at = v_now
    where organization_id = p_organization_id;
  end if;

  insert into admin_audit_log (admin_id, action, target_organization_id, detail)
  values (
    auth.uid(), 'subscription.change_package', p_organization_id,
    jsonb_build_object(
      'before_package_id', v_before_package_id,
      'after_package_id', p_package_id,
      'scheduled', v_scheduled,
      'starts_at', case when v_scheduled then v_pending_start else v_now end
    )
  );
end;
$$;

revoke execute on function public.admin_change_subscription_package(uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_change_subscription_package(uuid, uuid) to authenticated;

create or replace function public.admin_clear_pending_subscription_package(
  p_organization_id uuid
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

  select pending_package_id into v_before
  from organization_subscriptions where organization_id = p_organization_id;
  if not found or v_before is null then
    raise exception 'No package is scheduled for this gym' using errcode = 'no_data_found';
  end if;

  update organization_subscriptions
  set pending_package_id = null, pending_period_start = null, pending_period_end = null, updated_at = now()
  where organization_id = p_organization_id;

  insert into admin_audit_log (admin_id, action, target_organization_id, detail)
  values (
    auth.uid(), 'subscription.clear_pending_package', p_organization_id,
    jsonb_build_object('cleared_package_id', v_before)
  );
end;
$$;

revoke execute on function public.admin_clear_pending_subscription_package(uuid) from public, anon, authenticated;
grant execute on function public.admin_clear_pending_subscription_package(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- admin_gym_detail() gains the queued package inside its 'subscription'
-- object — the Gym Detail header, Overview and Billing tabs all read this
-- one function (see 1009's own comment), so this is the single place that
-- makes a scheduled package visible to an admin. Body otherwise copied
-- verbatim from 1009.
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
        'created_at', os.created_at,
        'pending', case when pending_pk.id is null then null else jsonb_build_object(
          'package_id', pending_pk.id,
          'package_name', pending_pk.name,
          'package_code', pending_pk.code,
          'billing_period', pending_pk.billing_period,
          'price_minor', pending_pk.price_minor,
          'currency', pending_pk.currency,
          'period_start', os.pending_period_start,
          'period_end', os.pending_period_end
        ) end
      )
      from organization_subscriptions os
      left join platform_packages pk on pk.id = os.package_id
      left join platform_packages pending_pk on pending_pk.id = os.pending_package_id
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
