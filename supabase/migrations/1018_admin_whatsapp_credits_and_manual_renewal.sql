-- Platform-admin controls for the WhatsApp credit catalogue and balances,
-- plus one package-aware manual subscription renewal path.
--
-- The tenant app deliberately exposes no client writes for WhatsApp package
-- pricing or balances. These SECURITY DEFINER functions keep that boundary:
-- every call verifies app.is_platform_admin(), performs the business write
-- and appends the admin audit row in the same transaction. EXECUTE is revoked
-- from PUBLIC/anon and granted only to authenticated sessions; the function's
-- own platform-admin check is the authorization decision.

create or replace function public.admin_create_whatsapp_credit_package(
  p_code text,
  p_name text,
  p_credits integer,
  p_price_minor bigint,
  p_currency text default 'INR',
  p_sort_order integer default 0
) returns uuid
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_id uuid;
begin
  if not app.is_platform_admin() then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;
  if nullif(btrim(p_code), '') is null or length(p_code) > 80 then
    raise exception 'Package code is required and must be 80 characters or fewer';
  end if;
  if nullif(btrim(p_name), '') is null or length(p_name) > 120 then
    raise exception 'Package name is required and must be 120 characters or fewer';
  end if;
  if p_credits <= 0 or p_price_minor <= 0 then
    raise exception 'Credits and price must be positive';
  end if;
  if nullif(btrim(p_currency), '') is null or length(p_currency) > 10 then
    raise exception 'Choose a valid currency';
  end if;

  insert into whatsapp_credit_packages (code, name, credits, price_minor, currency, status, sort_order)
  values (lower(btrim(p_code)), btrim(p_name), p_credits, p_price_minor, upper(btrim(p_currency)), 'active', p_sort_order)
  returning id into v_id;

  insert into admin_audit_log (admin_id, action, entity_type, entity_id, new_values, detail)
  values (
    auth.uid(), 'whatsapp_credit_package.create', 'whatsapp_credit_package', v_id::text,
    jsonb_build_object('code', lower(btrim(p_code)), 'name', btrim(p_name), 'credits', p_credits,
      'price_minor', p_price_minor, 'currency', upper(btrim(p_currency)), 'sort_order', p_sort_order),
    jsonb_build_object('package_id', v_id)
  );

  return v_id;
end;
$$;

revoke execute on function public.admin_create_whatsapp_credit_package(text, text, integer, bigint, text, integer) from public, anon, authenticated;
grant execute on function public.admin_create_whatsapp_credit_package(text, text, integer, bigint, text, integer) to authenticated;

create or replace function public.admin_update_whatsapp_credit_package(
  p_id uuid,
  p_name text,
  p_credits integer,
  p_price_minor bigint,
  p_currency text,
  p_sort_order integer
) returns integer
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
  if nullif(btrim(p_name), '') is null or length(p_name) > 120 then
    raise exception 'Package name is required and must be 120 characters or fewer';
  end if;
  if p_credits <= 0 or p_price_minor <= 0 then
    raise exception 'Credits and price must be positive';
  end if;
  if nullif(btrim(p_currency), '') is null or length(p_currency) > 10 then
    raise exception 'Choose a valid currency';
  end if;

  select jsonb_build_object(
    'name', name, 'credits', credits, 'price_minor', price_minor,
    'currency', currency, 'sort_order', sort_order
  ) into v_before
  from whatsapp_credit_packages
  where id = p_id;

  if v_before is null then
    raise exception 'WhatsApp credit package not found' using errcode = 'no_data_found';
  end if;

  update whatsapp_credit_packages
  set name = btrim(p_name), credits = p_credits, price_minor = p_price_minor,
      currency = upper(btrim(p_currency)), sort_order = p_sort_order
  where id = p_id;

  insert into admin_audit_log (admin_id, action, entity_type, entity_id, old_values, new_values, detail)
  values (
    auth.uid(), 'whatsapp_credit_package.update', 'whatsapp_credit_package', p_id::text, v_before,
    jsonb_build_object('name', btrim(p_name), 'credits', p_credits, 'price_minor', p_price_minor,
      'currency', upper(btrim(p_currency)), 'sort_order', p_sort_order),
    jsonb_build_object('package_id', p_id)
  );
end;
$$;

revoke execute on function public.admin_update_whatsapp_credit_package(uuid, text, integer, bigint, text, integer) from public, anon, authenticated;
grant execute on function public.admin_update_whatsapp_credit_package(uuid, text, integer, bigint, text, integer) to authenticated;

create or replace function public.admin_set_whatsapp_credit_package_status(
  p_id uuid,
  p_status text
) returns void
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_before text;
begin
  if not app.is_platform_admin() then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;
  if p_status not in ('active', 'archived') then
    raise exception 'status must be active or archived';
  end if;

  select status into v_before from whatsapp_credit_packages where id = p_id;
  if v_before is null then
    raise exception 'WhatsApp credit package not found' using errcode = 'no_data_found';
  end if;

  update whatsapp_credit_packages set status = p_status where id = p_id;

  insert into admin_audit_log (admin_id, action, entity_type, entity_id, old_values, new_values, detail)
  values (
    auth.uid(),
    case when p_status = 'archived' then 'whatsapp_credit_package.archive' else 'whatsapp_credit_package.restore' end,
    'whatsapp_credit_package', p_id::text,
    jsonb_build_object('status', v_before), jsonb_build_object('status', p_status),
    jsonb_build_object('package_id', p_id)
  );
end;
$$;

revoke execute on function public.admin_set_whatsapp_credit_package_status(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_set_whatsapp_credit_package_status(uuid, text) to authenticated;

-- A paginated, admin-only directory for the credit-management screen. It
-- exposes only platform-operational fields (gym name, integration state and
-- aggregate credit totals), never WhatsApp secrets or message contents.
create or replace function public.admin_whatsapp_credit_gyms(
  p_search text default null,
  p_limit integer default 25,
  p_offset integer default 0
) returns table (
  organization_id uuid,
  gym_name text,
  gym_code text,
  city text,
  integration_status text,
  balance integer,
  purchased_total integer,
  used_total integer,
  total_count bigint
)
language sql
stable
security definer
set search_path = public, app, pg_temp
as $$
  select
    o.id,
    o.name,
    o.gym_code,
    o.city,
    wi.status,
    coalesce(wcb.balance, 0)::integer,
    coalesce(wcb.purchased_total, 0)::integer,
    coalesce(wcb.used_total, 0)::integer,
    count(*) over()
  from organizations o
  left join whatsapp_credit_balances wcb on wcb.organization_id = o.id
  left join whatsapp_integrations wi on wi.organization_id = o.id
  where app.is_platform_admin()
    and (
      nullif(btrim(p_search), '') is null
      or o.name ilike '%' || btrim(p_search) || '%'
      or coalesce(o.gym_code, '') ilike '%' || btrim(p_search) || '%'
      or coalesce(o.city, '') ilike '%' || btrim(p_search) || '%'
    )
  order by o.name, o.id
  limit least(greatest(coalesce(p_limit, 25), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0)
$$;

revoke execute on function public.admin_whatsapp_credit_gyms(text, integer, integer) from public, anon, authenticated;
grant execute on function public.admin_whatsapp_credit_gyms(text, integer, integer) to authenticated;

-- An admin credit grant is an adjustment, not a purchase: it does not
-- fabricate a Razorpay/manual payment or inflate purchased_total. The note
-- is retained in the immutable platform admin audit log.
create or replace function public.admin_grant_whatsapp_credits(
  p_organization_id uuid,
  p_credits integer,
  p_note text default null
) returns void
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_balance integer;
begin
  if not app.is_platform_admin() then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;
  if p_credits <= 0 or p_credits > 10000000 then
    raise exception 'Credits must be between 1 and 10,000,000';
  end if;
  if length(coalesce(p_note, '')) > 500 then
    raise exception 'Note must be 500 characters or fewer';
  end if;
  if not exists (select 1 from organizations where id = p_organization_id) then
    raise exception 'Gym not found' using errcode = 'no_data_found';
  end if;

  insert into whatsapp_credit_balances (organization_id)
  values (p_organization_id)
  on conflict (organization_id) do nothing;

  update whatsapp_credit_balances
  set balance = balance + p_credits, updated_at = now()
  where organization_id = p_organization_id
  returning balance into v_balance;

  insert into whatsapp_credit_transactions
    (organization_id, delta, reason, balance_after, created_by)
  values (p_organization_id, p_credits, 'adjustment', v_balance, auth.uid());

  insert into admin_audit_log
    (admin_id, action, target_organization_id, entity_type, entity_id, new_values, detail)
  values (
    auth.uid(), 'whatsapp_credits.grant', p_organization_id,
    'organization', p_organization_id::text,
    jsonb_build_object('credits_added', p_credits, 'balance_after', v_balance),
    jsonb_build_object('credits', p_credits, 'balance_after', v_balance, 'note', nullif(btrim(p_note), ''))
  );

  return v_balance;
end;
$$;

revoke execute on function public.admin_grant_whatsapp_credits(uuid, integer, text) from public, anon, authenticated;
grant execute on function public.admin_grant_whatsapp_credits(uuid, integer, text) to authenticated;

-- Package-aware offline renewal. Unlike the older generic Extend action,
-- this records exactly which package was paid for and uses that package's
-- database duration. A different package paid for before the current period
-- ends is queued; a same-package renewal (or an already-expired gym) takes
-- effect immediately, matching the tenant checkout settlement rules.
create or replace function public.admin_record_manual_subscription_renewal(
  p_organization_id uuid,
  p_package_id uuid,
  p_payment_amount_minor bigint,
  p_payment_method text,
  p_payment_note text default null
) returns boolean
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_sub organization_subscriptions%rowtype;
  v_duration_days integer;
  v_currency text;
  v_package_name text;
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_scheduled boolean;
  v_gym_code text;
  v_payment_seq bigint;
  v_invoice_number text;
  v_payment_id uuid;
begin
  if not app.is_platform_admin() then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;
  if p_payment_amount_minor <= 0 then
    raise exception 'Payment amount must be positive';
  end if;
  if p_payment_method not in ('cash', 'upi', 'bank_transfer', 'card', 'cheque', 'other') then
    raise exception 'Choose a valid payment method';
  end if;
  if length(coalesce(p_payment_note, '')) > 500 then
    raise exception 'Note must be 500 characters or fewer';
  end if;

  select * into v_sub
  from organization_subscriptions
  where organization_id = p_organization_id
  for update;
  if not found then
    raise exception 'Subscription not found' using errcode = 'no_data_found';
  end if;

  select duration_days, currency, name
    into v_duration_days, v_currency, v_package_name
  from platform_packages
  where id = p_package_id and status = 'active';
  if not found then
    raise exception 'Active package not found' using errcode = 'no_data_found';
  end if;

  v_period_start := greatest(v_sub.current_period_end, now());
  v_period_end := v_period_start + make_interval(days => v_duration_days);
  v_scheduled := v_sub.current_period_end > now() and v_sub.package_id is distinct from p_package_id;

  if v_scheduled then
    update organization_subscriptions
    set pending_package_id = p_package_id,
        pending_period_start = v_period_start,
        pending_period_end = v_period_end,
        updated_at = now()
    where organization_id = p_organization_id;
  else
    update organization_subscriptions
    set package_id = p_package_id,
        status = 'active',
        current_period_start = v_period_start,
        current_period_end = v_period_end,
        cancelled_at = null,
        pending_package_id = null,
        pending_period_start = null,
        pending_period_end = null,
        updated_at = now()
    where organization_id = p_organization_id;
  end if;

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
    p_organization_id, p_package_id, p_payment_amount_minor, coalesce(v_currency, 'INR'),
    'manual', p_payment_method, 'succeeded', now(), v_period_start, v_period_end,
    v_invoice_number,
    jsonb_build_object('recorded_by_admin', true, 'note', nullif(btrim(p_payment_note), ''), 'scheduled', v_scheduled)
  ) returning id into v_payment_id;

  insert into admin_audit_log (admin_id, action, target_organization_id, entity_type, entity_id, new_values, detail)
  values (
    auth.uid(), 'subscription.manual_renewal', p_organization_id,
    'organization_subscription', p_organization_id::text,
    jsonb_build_object(
      'package_id', p_package_id, 'period_start', v_period_start, 'period_end', v_period_end,
      'scheduled', v_scheduled, 'payment_id', v_payment_id
    ),
    jsonb_build_object(
      'package_id', p_package_id, 'package_name', v_package_name,
      'amount_minor', p_payment_amount_minor, 'currency', coalesce(v_currency, 'INR'),
      'method', p_payment_method, 'note', nullif(btrim(p_payment_note), ''),
      'scheduled', v_scheduled, 'payment_id', v_payment_id
    )
  );

  return v_scheduled;
end;
$$;

revoke execute on function public.admin_record_manual_subscription_renewal(uuid, uuid, bigint, text, text) from public, anon, authenticated;
grant execute on function public.admin_record_manual_subscription_renewal(uuid, uuid, bigint, text, text) to authenticated;
