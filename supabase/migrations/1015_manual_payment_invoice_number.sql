-- ═══════════════════════════════════════════════════════════════════════
-- 1014's manual-payment invoice_number was a placeholder
-- (MANUAL-<timestamp>-<random>) invented because this repo has no
-- visibility into FitDeskApp's real invoice-numbering sequence. User's
-- explicit direction: CASH-<gymcode>, where <gymcode> is the gym's own
-- human-readable id (organizations.gym_code, e.g. "GG-0926A") rather than
-- its raw UUID — matches this project's existing rule against ever
-- surfacing a Supabase UUID as a user-facing id (see the Gym Owner
-- Onboarding milestone's own note on gym_code).
--
-- A gym can be extended with cash more than once, and CASH-<gymcode> alone
-- would repeat verbatim across every one of that gym's manual payments —
-- confirmed with the user this should NOT collide, so this appends a
-- running per-gym sequence number: CASH-<gymcode>-<n>, n = how many manual
-- payments this gym has had before this one, plus one. The sequence is
-- scoped to (organization_id, provider = 'manual') — a gym's razorpay
-- invoices are numbered by FitDeskApp's own sequence and never counted
-- here, so gap-free numbering isn't promised or needed across the two.
--
-- Same signature as 1014's admin_extend_subscription (only the body's
-- invoice_number expression changes), so this is a plain CREATE OR REPLACE
-- — no DROP needed, same as 1010's body-only RPC fixes. Re-issues the
-- revoke/grant pair anyway, matching that same precedent.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.admin_extend_subscription(
  p_organization_id uuid,
  p_days integer,
  p_payment_amount_minor bigint default null,
  p_payment_method text default null,
  p_payment_note text default null
) returns void
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_before timestamptz;
  v_package_id uuid;
  v_effective_start timestamptz;
  v_after timestamptz;
  v_currency text;
  v_gym_code text;
  v_payment_seq bigint;
  v_invoice_number text;
  v_payment_id uuid;
begin
  if not app.is_platform_admin() then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;
  if p_days <= 0 then
    raise exception 'days must be positive';
  end if;
  if p_payment_amount_minor is not null then
    if p_payment_amount_minor <= 0 then
      raise exception 'Payment amount must be positive';
    end if;
    if p_payment_method is null or p_payment_method not in ('cash', 'upi', 'bank_transfer', 'card', 'cheque', 'other') then
      raise exception 'Choose a valid payment method';
    end if;
  end if;

  select current_period_end, package_id into v_before, v_package_id
  from organization_subscriptions where organization_id = p_organization_id;
  if v_before is null then
    raise exception 'Subscription not found' using errcode = 'no_data_found';
  end if;

  -- Same "extend from whichever is later" rule as before, pulled into its
  -- own variable so a recorded payment's period_start reflects when
  -- coverage actually starts (today, for an overdue gym) rather than the
  -- stale stored date.
  v_effective_start := greatest(v_before, now());
  v_after := v_effective_start + make_interval(days => p_days);

  update organization_subscriptions
  set current_period_end = v_after, updated_at = now()
  where organization_id = p_organization_id;

  insert into admin_audit_log (admin_id, action, target_organization_id, detail)
  values (
    auth.uid(), 'subscription.extend', p_organization_id,
    jsonb_build_object('days', p_days, 'before', v_before, 'after', v_after)
  );

  if p_payment_amount_minor is not null then
    v_currency := null;
    if v_package_id is not null then
      select currency into v_currency from platform_packages where id = v_package_id;
    end if;
    if v_currency is null then
      select default_currency into v_currency from organizations where id = p_organization_id;
    end if;
    v_currency := coalesce(v_currency, 'INR');

    select coalesce(gym_code, id::text) into v_gym_code
    from organizations where id = p_organization_id;

    select count(*) + 1 into v_payment_seq
    from platform_payments
    where organization_id = p_organization_id and provider = 'manual';

    v_invoice_number := 'CASH-' || v_gym_code || '-' || v_payment_seq;

    insert into platform_payments (
      organization_id, package_id, amount_minor, currency, provider, method, status, paid_at,
      period_start, period_end, invoice_number, provider_metadata
    ) values (
      p_organization_id, v_package_id, p_payment_amount_minor, v_currency,
      'manual', p_payment_method, 'succeeded', now(),
      v_effective_start, v_after,
      v_invoice_number,
      jsonb_build_object('recorded_by_admin', true, 'note', p_payment_note)
    )
    returning id into v_payment_id;

    insert into admin_audit_log (admin_id, action, target_organization_id, detail)
    values (
      auth.uid(), 'payment.manual_record', p_organization_id,
      jsonb_build_object(
        'payment_id', v_payment_id,
        'amount_minor', p_payment_amount_minor,
        'currency', v_currency,
        'method', p_payment_method,
        'note', p_payment_note
      )
    );
  end if;
end;
$$;

revoke execute on function public.admin_extend_subscription(uuid, integer, bigint, text, text) from public, anon, authenticated;
grant execute on function public.admin_extend_subscription(uuid, integer, bigint, text, text) to authenticated;
