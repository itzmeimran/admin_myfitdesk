-- ═══════════════════════════════════════════════════════════════════════
-- Closes the other half of FitDeskApp's migration 0074
-- (scheduled_subscription_package.sql). That migration built the entire
-- tenant-side mechanism for "a package queued to start the moment the
-- current period ends" — organization_subscriptions.pending_package_id /
-- pending_period_start / pending_period_end, a daily cron that promotes a
-- due one, a manual "Activate now" button, and an "Upcoming plan" card on
-- /dashboard/billing. Nothing on this side could ever populate it: 1004's
-- admin_change_subscription_package reassigns package_id immediately, by
-- explicit design ("this app has no billing engine to compute a fair
-- mid-cycle credit"), and never touches the pending_* columns at all.
--
-- Two RPCs, same SECURITY DEFINER / narrow-validation / admin_audit_log
-- shape as every other admin_* write in this app:
--
--   admin_schedule_subscription_package — queues a package to start
--     automatically at the gym's own current_period_end. The scheduled
--     duration is captured from the package's duration_days AT SCHEDULING
--     TIME (pending_period_end - pending_period_start on the tenant row),
--     matching 0074's own "a later price/duration change never rewrites
--     what was already promised" rule — same reasoning platform_payments
--     already follows for a real purchase. FitDeskApp's own
--     activate_due_pending_subscription_packages() re-anchors the START
--     to whatever current_period_end actually is when it fires (not the
--     pending_period_start recorded here), so extending the gym's trial
--     after scheduling still pushes the package out correctly — this RPC
--     does not need to duplicate that logic, only the initial snapshot.
--
--   admin_clear_scheduled_package — the inverse: empties all three pending
--     columns. Raises 'Nothing is scheduled' if there was nothing to
--     clear, the same no_data_found shape 1004's admin_restore_subscription
--     already uses for "nothing to undo".
--
-- Deliberately NOT folded into admin_change_subscription_package as a
-- "schedule instead of apply immediately" flag on the same function —
-- immediate and scheduled are different write targets on the row
-- (package_id vs pending_package_id) with different validation (scheduling
-- needs the CURRENT current_period_end to exist; changing doesn't touch
-- it at all), and conflating them risks exactly the kind of silent
-- misapplication 0074's own header worried about ("the assignment inert
-- rather than deferred").
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.admin_schedule_subscription_package(
  p_organization_id uuid,
  p_package_id uuid
) returns void
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_current_period_end timestamptz;
  v_duration_days integer;
  v_package_status text;
  v_pending_start timestamptz;
  v_pending_end timestamptz;
begin
  if not app.is_platform_admin() then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;

  select duration_days, status into v_duration_days, v_package_status
  from platform_packages where id = p_package_id;
  if not found then
    raise exception 'Package not found' using errcode = 'no_data_found';
  end if;
  if v_package_status <> 'active' then
    raise exception 'That package is archived and cannot be scheduled';
  end if;

  select current_period_end into v_current_period_end
  from organization_subscriptions where organization_id = p_organization_id;
  if not found then
    raise exception 'Subscription not found' using errcode = 'no_data_found';
  end if;

  -- The pending window always starts at the row's OWN current renewal
  -- date, never a date the admin picks — matching FitDeskApp's own
  -- "it shouldn't replace the trial, it should show as an upcoming
  -- package that starts when the trial ends" requirement (0074's header).
  -- An admin who wants the new package to apply from today should pair
  -- this with admin_change_subscription_package instead, same as
  -- 1004's own "change package" + "Extend" pairing note.
  v_pending_start := v_current_period_end;
  v_pending_end := v_current_period_end + make_interval(days => v_duration_days);

  update organization_subscriptions
  set
    pending_package_id = p_package_id,
    pending_period_start = v_pending_start,
    pending_period_end = v_pending_end,
    updated_at = now()
  where organization_id = p_organization_id;

  insert into admin_audit_log (admin_id, action, target_organization_id, detail)
  values (
    auth.uid(), 'subscription.schedule_package', p_organization_id,
    jsonb_build_object(
      'package_id', p_package_id,
      'starts_at', v_pending_start,
      'ends_at', v_pending_end
    )
  );
end;
$$;

revoke execute on function public.admin_schedule_subscription_package(uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_schedule_subscription_package(uuid, uuid) to authenticated;

create or replace function public.admin_clear_scheduled_package(
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
  if not found then
    raise exception 'Subscription not found' using errcode = 'no_data_found';
  end if;
  if v_before is null then
    raise exception 'Nothing is scheduled' using errcode = 'no_data_found';
  end if;

  update organization_subscriptions
  set pending_package_id = null, pending_period_start = null, pending_period_end = null, updated_at = now()
  where organization_id = p_organization_id;

  insert into admin_audit_log (admin_id, action, target_organization_id, detail)
  values (auth.uid(), 'subscription.clear_scheduled_package', p_organization_id, jsonb_build_object('package_id', v_before));
end;
$$;

revoke execute on function public.admin_clear_scheduled_package(uuid) from public, anon, authenticated;
grant execute on function public.admin_clear_scheduled_package(uuid) to authenticated;

-- Read side: what (if anything) is currently queued for this gym, plus the
-- package's own name so the sheet doesn't need a second round trip to the
-- catalogue. SECURITY DEFINER for the same reason admin_gym_directory is —
-- organization_subscriptions' only SELECT policy (1002) already covers an
-- admin reading pending_*, but this narrows to exactly the fields a "what's
-- scheduled" panel needs and stays consistent with how every other admin
-- read in this app goes through a function rather than a direct
-- .from(...).select(...).
create or replace function public.admin_get_scheduled_package(p_organization_id uuid)
returns table (
  package_id uuid,
  package_name text,
  period_start timestamptz,
  period_end timestamptz
)
language sql
stable
security definer
set search_path = public, app, pg_temp
as $$
  select os.pending_package_id, pk.name, os.pending_period_start, os.pending_period_end
  from organization_subscriptions os
  left join platform_packages pk on pk.id = os.pending_package_id
  where os.organization_id = p_organization_id
    and os.pending_package_id is not null
    and app.is_platform_admin()
$$;

revoke execute on function public.admin_get_scheduled_package(uuid) from public, anon, authenticated;
grant execute on function public.admin_get_scheduled_package(uuid) to authenticated;
