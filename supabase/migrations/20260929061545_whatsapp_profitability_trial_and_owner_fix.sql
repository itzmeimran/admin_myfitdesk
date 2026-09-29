-- WhatsApp unit economics for platform admins, plus a one-off owner-name
-- correction reported during the admin UX audit.
--
-- Meta does not store an invoice amount on whatsapp_messages. The best
-- operational estimate available inside MyFitDesk is therefore an
-- effective-dated cost rate per category, applied only to messages sent by
-- the MyFitDesk-managed sender. A gym's own WABA is counted separately and
-- never included in the platform's estimated Meta payable.

create table if not exists public.whatsapp_meta_cost_rates (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('utility', 'marketing', 'authentication')),
  cost_minor numeric(14,4) not null check (cost_minor > 0),
  currency char(3) not null default 'INR',
  effective_from timestamptz not null default now(),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (category, currency, effective_from)
);

create index if not exists whatsapp_meta_cost_rates_lookup_idx
  on public.whatsapp_meta_cost_rates (category, currency, effective_from desc);

alter table public.whatsapp_meta_cost_rates enable row level security;
alter table public.whatsapp_meta_cost_rates force row level security;

-- This is platform finance data. It is reachable only through the
-- admin-gated RPCs below, not as a generally readable Data API table.
revoke all on table public.whatsapp_meta_cost_rates from public, anon, authenticated;

create or replace function public.admin_set_whatsapp_meta_cost_rate(
  p_category text,
  p_cost_minor numeric,
  p_currency text default 'INR',
  p_effective_from timestamptz default now()
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not app.is_platform_admin() then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;
  if p_category not in ('utility', 'marketing', 'authentication') then
    raise exception 'Choose a valid WhatsApp category' using errcode = 'invalid_parameter_value';
  end if;
  if p_cost_minor is null or p_cost_minor <= 0 then
    raise exception 'Meta unit cost must be positive' using errcode = 'invalid_parameter_value';
  end if;
  if upper(btrim(coalesce(p_currency, ''))) !~ '^[A-Z]{3}$' then
    raise exception 'Currency must be a three-letter ISO code' using errcode = 'invalid_parameter_value';
  end if;

  insert into public.whatsapp_meta_cost_rates
    (category, cost_minor, currency, effective_from, created_by)
  values
    (p_category, p_cost_minor, upper(btrim(p_currency))::char(3), coalesce(p_effective_from, now()), auth.uid())
  on conflict (category, currency, effective_from) do update
    set cost_minor = excluded.cost_minor,
        created_by = excluded.created_by,
        created_at = now()
  returning id into v_id;

  insert into public.admin_audit_log
    (admin_id, action, entity_type, entity_id, new_values, detail)
  values (
    auth.uid(), 'whatsapp_meta_rate.set', 'whatsapp_meta_cost_rate', v_id::text,
    jsonb_build_object(
      'category', p_category,
      'cost_minor', p_cost_minor,
      'currency', upper(btrim(p_currency)),
      'effective_from', coalesce(p_effective_from, now())
    ),
    jsonb_build_object('rate_id', v_id)
  );

  return v_id;
end;
$$;

revoke execute on function public.admin_set_whatsapp_meta_cost_rate(text, numeric, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.admin_set_whatsapp_meta_cost_rate(text, numeric, text, timestamptz)
  to authenticated;

create or replace function public.admin_whatsapp_profitability(
  p_from timestamptz,
  p_to timestamptz,
  p_currency text default 'INR'
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_currency text := upper(btrim(coalesce(p_currency, 'INR')));
  v_result jsonb;
begin
  if not app.is_platform_admin() then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;
  if p_from is null or p_to is null or p_to <= p_from then
    raise exception 'Choose a valid reporting range' using errcode = 'invalid_parameter_value';
  end if;

  with
  categories(category) as (
    values ('utility'::text), ('marketing'::text), ('authentication'::text)
  ),
  recharge as (
    select
      coalesce(sum(p.amount_minor), 0)::numeric as income_minor,
      coalesce(sum(p.credits), 0)::bigint as credits_sold,
      count(*)::bigint as recharge_count
    from public.whatsapp_credit_purchases p
    where p.status = 'succeeded'
      and upper(p.currency) = v_currency
      and coalesce(p.paid_at, p.created_at) >= p_from
      and coalesce(p.paid_at, p.created_at) < p_to
  ),
  consumption as (
    select
      coalesce(sum(-t.delta), 0)::bigint as credits_used,
      count(*)::bigint as charge_events
    from public.whatsapp_credit_transactions t
    where t.reason = 'consumption'
      and t.created_at >= p_from
      and t.created_at < p_to
  ),
  message_events as (
    select
      m.id,
      m.category,
      m.sender_mode,
      m.status,
      coalesce(m.sent_at, m.created_at) as event_at,
      rate.cost_minor
    from public.whatsapp_messages m
    left join lateral (
      select r.cost_minor
      from public.whatsapp_meta_cost_rates r
      where r.category = m.category
        and r.currency = v_currency
        and r.effective_from <= coalesce(m.sent_at, m.created_at)
      order by r.effective_from desc
      limit 1
    ) rate on true
    where m.direction = 'outbound'
      and m.meta_message_id is not null
      and m.status in ('sent', 'delivered', 'read')
      and coalesce(m.sent_at, m.created_at) >= p_from
      and coalesce(m.sent_at, m.created_at) < p_to
  ),
  managed as (
    select
      count(*) filter (where sender_mode = 'managed')::bigint as messages,
      count(*) filter (where sender_mode = 'managed' and status in ('delivered', 'read'))::bigint as delivered,
      count(*) filter (where sender_mode = 'managed' and cost_minor is null)::bigint as unpriced,
      coalesce(sum(cost_minor) filter (where sender_mode = 'managed'), 0)::numeric as estimated_cost_minor,
      count(*) filter (where sender_mode = 'own_waba')::bigint as own_waba_messages
    from message_events
  ),
  category_totals as (
    select
      c.category,
      count(e.id) filter (where e.sender_mode = 'managed')::bigint as messages,
      count(e.id) filter (where e.sender_mode = 'managed' and e.status in ('delivered', 'read'))::bigint as delivered,
      count(e.id) filter (where e.sender_mode = 'managed' and e.cost_minor is null)::bigint as unpriced,
      coalesce(sum(e.cost_minor) filter (where e.sender_mode = 'managed'), 0)::numeric as estimated_cost_minor,
      (
        select r.cost_minor
        from public.whatsapp_meta_cost_rates r
        where r.category = c.category and r.currency = v_currency and r.effective_from <= now()
        order by r.effective_from desc
        limit 1
      ) as current_rate_minor,
      (
        select r.effective_from
        from public.whatsapp_meta_cost_rates r
        where r.category = c.category and r.currency = v_currency and r.effective_from <= now()
        order by r.effective_from desc
        limit 1
      ) as rate_effective_from
    from categories c
    left join message_events e on e.category = c.category
    group by c.category
  )
  select jsonb_build_object(
    'from', p_from,
    'to', p_to,
    'currency', v_currency,
    'recharge_income_minor', r.income_minor,
    'credits_sold', r.credits_sold,
    'recharge_count', r.recharge_count,
    'credits_used', c.credits_used,
    'credit_charge_events', c.charge_events,
    'managed_messages', m.messages,
    'delivered_messages', m.delivered,
    'own_waba_messages', m.own_waba_messages,
    'estimated_meta_cost_minor', m.estimated_cost_minor,
    'gross_margin_minor', r.income_minor - m.estimated_cost_minor,
    'margin_percent', case
      when r.income_minor > 0 then round(((r.income_minor - m.estimated_cost_minor) / r.income_minor) * 100, 2)
      else null
    end,
    'unpriced_messages', m.unpriced,
    'categories', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'category', ct.category,
        'messages', ct.messages,
        'delivered', ct.delivered,
        'unpriced', ct.unpriced,
        'estimated_cost_minor', ct.estimated_cost_minor,
        'current_rate_minor', ct.current_rate_minor,
        'rate_effective_from', ct.rate_effective_from
      ) order by case ct.category when 'utility' then 1 when 'marketing' then 2 else 3 end), '[]'::jsonb)
      from category_totals ct
    )
  ) into v_result
  from recharge r cross join consumption c cross join managed m;

  return v_result;
end;
$$;

revoke execute on function public.admin_whatsapp_profitability(timestamptz, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.admin_whatsapp_profitability(timestamptz, timestamptz, text)
  to authenticated;

-- The owner-facing app displays this account as “Shaik Riyaz”; the admin
-- directory was reading the stale staff_memberships surname “Riyaz Gym”.
-- Correct the shared operational record instead of hiding the suffix in UI
-- code (where a legitimate surname could be damaged by a heuristic).
update public.staff_memberships
set first_name = 'Shaik', last_name = 'Riyaz'
where lower(email::text) = 'ogoxygengym@gmail.com'
  and role = 'owner'
  and lower(trim(coalesce(first_name, '') || ' ' || coalesce(last_name, ''))) <> 'shaik riyaz';
