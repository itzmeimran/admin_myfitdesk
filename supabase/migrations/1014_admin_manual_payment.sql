-- ═══════════════════════════════════════════════════════════════════════
-- Two real gaps reported by the product owner while using the "Manage
-- subscription" sheet on a live gym:
--
--   1. Extend has no way to record that the extension was PAID FOR — a gym
--      owner who pays by cash/UPI/bank transfer in person leaves zero trace
--      in platform_payments today; the sheet only ever moves
--      current_period_end. admin_extend_subscription (1004) gains three
--      optional trailing args (p_payment_amount_minor/p_payment_method/
--      p_payment_note) so recording a manually-collected payment and
--      extending access happen in the same transaction, same audit-log
--      convention as every other admin_* write here. platform_payments
--      gains a `method` column for this (mirrors the tenant `payments`
--      table's own `method` column — see admin_gym_billing_history's
--      original comment on why "provider" alone wasn't enough).
--
--   2. "Change package" listed every active platform_packages row by its
--      raw price_minor — for a dynamic-plan cycle with an enabled
--      plan_offers discount (Milestone: Dynamic Plans), that's not the
--      price a gym actually pays. admin_assignable_packages() replaces the
--      plain `.from("platform_packages")` read in listAssignablePackages
--      with one that joins plan_effective_price() per row, the same
--      function FitDeskApp's own checkout uses, so the dropdown shows
--      today's real payable price (and the struck-through list price when
--      they differ) instead of silently ignoring the discount.
--
-- Neither change touches the legacy/dynamic split itself: a manual payment
-- is recorded exactly like a razorpay one (same table, same status
-- vocabulary) except provider='manual', and admin_assignable_packages still
-- returns every active package regardless of plan_id, matching
-- listAssignablePackages' existing "an admin can reassign a gym onto either
-- a legacy package or a dynamic cycle" comment.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.platform_payments
  add column if not exists method text;

alter table public.platform_payments
  drop constraint if exists platform_payments_method_check;

alter table public.platform_payments
  add constraint platform_payments_method_check
  check (method is null or method in ('cash', 'upi', 'bank_transfer', 'card', 'cheque', 'other'));

comment on column public.platform_payments.method is
  'How a MANUAL (provider=''manual'') payment was actually collected — cash/upi/bank_transfer/card/cheque/other. Always null for a razorpay row; the gateway itself is that row''s "method".';

-- ─────────────────────────────────────────────────────────────────────────
-- admin_extend_subscription — same date-math as 1004, plus an optional
-- manual-payment record. Dropped and recreated (not CREATE OR REPLACE)
-- because adding parameters changes the signature; this project's own
-- convention (see admin_gym_directory in 1004) is to drop the exact old
-- signature first so there's never a stray overload a PostgREST call could
-- ambiguously resolve to.
-- ─────────────────────────────────────────────────────────────────────────
drop function if exists public.admin_extend_subscription(uuid, integer);

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

    insert into platform_payments (
      organization_id, package_id, amount_minor, currency, provider, method, status, paid_at,
      period_start, period_end, invoice_number, provider_metadata
    ) values (
      p_organization_id, v_package_id, p_payment_amount_minor, v_currency,
      'manual', p_payment_method, 'succeeded', now(),
      v_effective_start, v_after,
      'MANUAL-' || to_char(now(), 'YYYYMMDDHH24MISS') || '-' || substr(md5(random()::text), 1, 4),
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

-- ─────────────────────────────────────────────────────────────────────────
-- admin_assignable_packages — the "Change package" dropdown's real source
-- now, in place of a bare `platform_packages` select. Joins
-- plan_effective_price() (1008) per row so a dynamic cycle's enabled
-- plan_offers discount is reflected; a legacy row (plan_id is null) simply
-- carries no lateral match and falls back to its own price_minor via the
-- coalesce. Never touches which package a gym is CURRENTLY on — this only
-- lists what could be newly assigned, same active-only scope
-- listAssignablePackages always had.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.admin_assignable_packages()
returns table (
  id uuid,
  name text,
  code text,
  billing_period text,
  price_minor bigint,
  effective_price_minor bigint,
  currency text
)
language sql
stable
security definer
set search_path = public, app, pg_temp
as $$
  select
    pk.id,
    pk.name,
    pk.code,
    pk.billing_period,
    pk.price_minor,
    coalesce(pep.effective_price_minor, pk.price_minor) as effective_price_minor,
    pk.currency
  from platform_packages pk
  left join lateral (
    select * from plan_effective_price(pk.id)
  ) pep on pk.plan_id is not null
  where app.is_platform_admin() and pk.status = 'active'
  order by pk.sort_order
$$;

revoke execute on function public.admin_assignable_packages() from public, anon, authenticated;
grant execute on function public.admin_assignable_packages() to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- admin_gym_billing_history — gains `method` (so a manually-recorded cash/
-- UPI/etc. payment shows how it was actually collected, not just
-- provider='manual') and an optional p_method filter, same shape as the
-- existing p_provider one. Body otherwise copied verbatim from 1010's fix
-- (keeps the `organizations.id` qualification that fixed the 42702
-- ambiguity bug — see that migration's own header).
-- ─────────────────────────────────────────────────────────────────────────
drop function if exists public.admin_gym_billing_history(uuid, text, text, timestamptz, timestamptz, text, text, integer, integer);

create or replace function public.admin_gym_billing_history(
  p_organization_id uuid,
  p_status text default null,
  p_provider text default null,
  p_date_from timestamptz default null,
  p_date_to timestamptz default null,
  p_sort_col text default 'created_at',
  p_sort_dir text default 'desc',
  p_limit integer default 25,
  p_offset integer default 0,
  p_method text default null
)
returns table (
  id uuid,
  invoice_number text,
  amount_minor bigint,
  currency text,
  status text,
  provider text,
  method text,
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
        pp.id, pp.invoice_number, pp.amount_minor, pp.currency, pp.status, pp.provider, pp.method,
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
      and ($8 is null or method = $8)
    order by %I %s nulls last, id
    limit $6 offset $7
  $f$, v_sort_col, v_sort_dir);

  return query execute v_sql
    using p_organization_id, p_status, p_provider, p_date_from, p_date_to, p_limit, p_offset, p_method;
end;
$$;

revoke execute on function public.admin_gym_billing_history(uuid, text, text, timestamptz, timestamptz, text, text, integer, integer, text) from public, anon, authenticated;
grant execute on function public.admin_gym_billing_history(uuid, text, text, timestamptz, timestamptz, text, text, integer, integer, text) to authenticated;
