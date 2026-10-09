-- ═══════════════════════════════════════════════════════════════════════
-- A gym paid for a package while its trial was still running, the payment
-- settled ('succeeded'), but the subscription row never received the
-- package: package_id stayed null and nothing was queued in
-- pending_package_id. When the trial ended the gym fell into Grace with
-- "No package", and nothing in this admin showed the paid-for plan.
--
--   admin_unapplied_payments(org)  — succeeded payments whose package is
--     neither the subscription's package nor its queued one, and whose
--     coverage extends past what the subscription currently covers.
--   admin_apply_paid_payment(payment) — applies one of them correctly:
--       * paid before current_period_end (e.g. during a trial) → the
--         package starts AT current_period_end (queued while that is still
--         in the future, applied immediately once it has passed — dates
--         are never shifted to "now" for a customer who paid early);
--       * paid after the period had already ended → starts now.
--     Stamps the payment's provider_metadata so it can never be applied
--     twice, and writes admin_audit_log in the same transaction.
--
-- SECURITY DEFINER, pinned search_path, admin-gated, explicit revoke then
-- grant — same shape as 1004/1014.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.admin_unapplied_payments(p_organization_id uuid)
returns table (
  payment_id uuid,
  invoice_number text,
  package_id uuid,
  package_name text,
  billing_period text,
  duration_days integer,
  amount_minor bigint,
  currency text,
  paid_at timestamptz,
  period_start timestamptz,
  period_end timestamptz
)
language plpgsql
stable
security definer
set search_path = public, app, pg_temp
as $$
begin
  if not app.is_platform_admin() then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;

  return query
  select
    pay.id,
    pay.invoice_number,
    pay.package_id,
    pk.name,
    pk.billing_period::text,
    pk.duration_days,
    pay.amount_minor::bigint,
    pay.currency::text,
    pay.paid_at,
    pay.period_start,
    coalesce(pay.period_end, pay.paid_at + make_interval(days => pk.duration_days))
  from platform_payments pay
  join platform_packages pk on pk.id = pay.package_id
  join organization_subscriptions os on os.organization_id = pay.organization_id
  where pay.organization_id = p_organization_id
    and pay.status = 'succeeded'
    and pay.package_id is not null
    and coalesce((pay.provider_metadata ->> 'applied_by_admin')::boolean, false) = false
    and os.pending_package_id is distinct from pay.package_id
    and (
      os.package_id is distinct from pay.package_id
      or coalesce(pay.period_end, pay.paid_at + make_interval(days => pk.duration_days)) > os.current_period_end
    )
    and coalesce(pay.period_end, pay.paid_at + make_interval(days => pk.duration_days)) > now()
  order by pay.paid_at desc nulls last;
end;
$$;

revoke execute on function public.admin_unapplied_payments(uuid) from public, anon, authenticated;
grant execute on function public.admin_unapplied_payments(uuid) to authenticated;

create or replace function public.admin_apply_paid_payment(p_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_pay platform_payments%rowtype;
  v_sub organization_subscriptions%rowtype;
  v_duration integer;
  v_start timestamptz;
  v_end timestamptz;
  v_queued boolean;
  v_now timestamptz := now();
begin
  if not app.is_platform_admin() then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;

  select * into v_pay from platform_payments where id = p_payment_id for update;
  if not found then
    raise exception 'Payment not found' using errcode = 'no_data_found';
  end if;
  if v_pay.status <> 'succeeded' or v_pay.package_id is null then
    raise exception 'Only a succeeded payment for a package can be applied';
  end if;
  if coalesce((v_pay.provider_metadata ->> 'applied_by_admin')::boolean, false) then
    raise exception 'This payment was already applied';
  end if;

  select * into v_sub from organization_subscriptions
  where organization_id = v_pay.organization_id for update;
  if not found then
    raise exception 'Subscription not found' using errcode = 'no_data_found';
  end if;
  if v_sub.pending_package_id is not distinct from v_pay.package_id then
    raise exception 'This package is already queued for the gym';
  end if;

  select duration_days into v_duration from platform_packages where id = v_pay.package_id;
  if not found then
    raise exception 'Package not found' using errcode = 'no_data_found';
  end if;

  -- Paid before the current period ended (a trial, typically) → starts where
  -- that period ends. Paid after it had lapsed → starts now.
  if coalesce(v_pay.paid_at, v_now) <= v_sub.current_period_end then
    v_start := v_sub.current_period_end;
  else
    v_start := v_now;
  end if;
  v_end := v_start + make_interval(days => v_duration);
  v_queued := v_start > v_now;

  if v_queued then
    update organization_subscriptions
    set pending_package_id = v_pay.package_id,
        pending_period_start = v_start,
        pending_period_end = v_end,
        updated_at = v_now
    where organization_id = v_pay.organization_id;
  else
    update organization_subscriptions
    set package_id = v_pay.package_id,
        status = 'active',
        current_period_start = v_start,
        current_period_end = v_end,
        cancelled_at = null,
        pending_package_id = null,
        pending_period_start = null,
        pending_period_end = null,
        updated_at = v_now
    where organization_id = v_pay.organization_id;
  end if;

  update platform_payments
  set period_start = v_start,
      period_end = v_end,
      provider_metadata = coalesce(provider_metadata, '{}'::jsonb)
        || jsonb_build_object('applied_by_admin', true, 'applied_at', v_now)
  where id = v_pay.id;

  insert into admin_audit_log (admin_id, action, target_organization_id, detail)
  values (
    auth.uid(), 'subscription.apply_paid_payment', v_pay.organization_id,
    jsonb_build_object(
      'payment_id', v_pay.id,
      'package_id', v_pay.package_id,
      'before_package_id', v_sub.package_id,
      'queued', v_queued,
      'starts_at', v_start,
      'ends_at', v_end
    )
  );
end;
$$;

revoke execute on function public.admin_apply_paid_payment(uuid) from public, anon, authenticated;
grant execute on function public.admin_apply_paid_payment(uuid) to authenticated;
