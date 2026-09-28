-- Admin Gym Overview redesign.
--
-- One curated, gym-scoped read replaces the Overview page's fan-out and
-- exposes only operational fields a platform admin needs. It deliberately
-- does not grant platform admins blanket SELECT access to tenant payments,
-- WhatsApp history, auth data, or automation tables. Secrets and provider
-- metadata never enter the returned JSON.

create table if not exists public.admin_gym_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  created_by uuid not null references auth.users(id) on delete restrict,
  category text,
  content text not null check (char_length(content) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists admin_gym_notes_org_created_idx
  on public.admin_gym_notes (organization_id, created_at desc);

alter table public.admin_gym_notes enable row level security;
alter table public.admin_gym_notes force row level security;

drop policy if exists admin_gym_notes_select on public.admin_gym_notes;
create policy admin_gym_notes_select on public.admin_gym_notes
  for select to authenticated
  using ((select app.is_platform_admin()));

revoke insert, update, delete on public.admin_gym_notes from public, anon, authenticated;

-- The Overview repeatedly aggregates settled gym payments by organization
-- and paid_at. The existing branch-oriented index cannot serve that date
-- range efficiently when a gym has several branches.
create index if not exists payments_org_succeeded_paid_idx
  on public.payments (organization_id, paid_at desc)
  where status = 'succeeded';

create or replace function public.admin_add_gym_note(
  p_organization_id uuid,
  p_content text,
  p_category text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_note_id uuid;
  v_content text := nullif(trim(p_content), '');
  v_category text := nullif(trim(p_category), '');
begin
  if not app.is_platform_admin() then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.organizations where id = p_organization_id) then
    raise exception 'Gym not found' using errcode = 'no_data_found';
  end if;
  if v_content is null or char_length(v_content) > 2000 then
    raise exception 'Note must be between 1 and 2000 characters.' using errcode = '22023';
  end if;
  if v_category is not null and char_length(v_category) > 60 then
    raise exception 'Category must be 60 characters or fewer.' using errcode = '22023';
  end if;

  insert into public.admin_gym_notes (organization_id, created_by, category, content)
  values (p_organization_id, (select auth.uid()), v_category, v_content)
  returning id into v_note_id;

  insert into public.admin_audit_log (admin_id, action, target_organization_id, detail)
  values ((select auth.uid()), 'admin_note.added', p_organization_id,
    jsonb_build_object('note_id', v_note_id, 'category', v_category));

  return v_note_id;
end;
$$;

revoke execute on function public.admin_add_gym_note(uuid, text, text) from public, anon, authenticated;
grant execute on function public.admin_add_gym_note(uuid, text, text) to authenticated;

create or replace function public.admin_gym_overview(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_result jsonb;
  v_timezone text;
  v_today_start timestamptz;
  v_month_start timestamptz;
  v_previous_month_start timestamptz;
begin
  if not app.is_platform_admin() then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;

  select coalesce(nullif(default_timezone, ''), 'Asia/Kolkata')
    into v_timezone
  from public.organizations
  where id = p_organization_id;

  if v_timezone is null then
    raise exception 'Gym not found' using errcode = 'no_data_found';
  end if;

  v_today_start := timezone(v_timezone, date_trunc('day', timezone(v_timezone, now())));
  v_month_start := timezone(v_timezone, date_trunc('month', timezone(v_timezone, now())));
  v_previous_month_start := timezone(v_timezone, date_trunc('month', timezone(v_timezone, now())) - interval '1 month');

  with
  latest_memberships as (
    select distinct on (ms.member_id)
      ms.member_id, ms.end_date
    from public.member_subscriptions ms
    where ms.organization_id = p_organization_id
      and ms.deleted_at is null
    order by ms.member_id, ms.end_date desc
  ),
  gym_revenue as (
    select
      coalesce(sum(p.amount_minor) filter (where p.paid_at >= v_today_start), 0)::bigint as today_minor,
      coalesce(sum(p.amount_minor) filter (where p.paid_at >= v_month_start), 0)::bigint as month_minor,
      coalesce(sum(p.amount_minor) filter (
        where p.paid_at >= v_previous_month_start and p.paid_at < v_month_start
      ), 0)::bigint as previous_month_minor,
      coalesce(sum(p.amount_minor), 0)::bigint as lifetime_minor,
      count(*) filter (where p.paid_at >= v_month_start)::bigint as payments_this_month,
      max(p.paid_at) as last_payment_at
    from public.payments p
    where p.organization_id = p_organization_id and p.status = 'succeeded'
  ),
  platform_revenue as (
    select
      coalesce(sum(x.amount_minor) filter (where x.paid_at >= v_month_start), 0)::bigint as month_minor,
      coalesce(sum(x.amount_minor), 0)::bigint as lifetime_minor,
      max(x.paid_at) as last_payment_at
    from (
      select pp.amount_minor, pp.paid_at
      from public.platform_payments pp
      where pp.organization_id = p_organization_id and pp.status = 'succeeded'
      union all
      select wcp.amount_minor, wcp.paid_at
      from public.whatsapp_credit_purchases wcp
      where wcp.organization_id = p_organization_id and wcp.status = 'succeeded'
    ) x
  ),
  subscription_revenue as (
    select
      coalesce(sum(pp.amount_minor), 0)::bigint as lifetime_minor,
      max(pp.paid_at) as last_payment_at,
      (array_agg(pp.amount_minor order by pp.paid_at desc nulls last))[1]::bigint as last_payment_minor
    from public.platform_payments pp
    where pp.organization_id = p_organization_id and pp.status = 'succeeded'
  ),
  whatsapp_stats as (
    select
      count(*) filter (where wm.created_at >= v_today_start and wm.status in ('sent','delivered','read'))::bigint as sent_today,
      count(*) filter (where wm.created_at >= v_month_start and wm.status in ('sent','delivered','read'))::bigint as sent_month,
      count(*) filter (where wm.created_at >= v_month_start and wm.status in ('delivered','read'))::bigint as delivered_month,
      count(*) filter (where wm.created_at >= v_month_start and wm.status = 'failed')::bigint as failed_month,
      count(*) filter (where wm.status in ('queued','processing'))::bigint as pending,
      count(*) filter (where wm.created_at >= v_month_start and wm.category = 'utility')::bigint as utility_month,
      count(*) filter (where wm.created_at >= v_month_start and wm.category = 'marketing')::bigint as marketing_month,
      coalesce(sum(wm.credits_used) filter (where wm.created_at >= v_month_start), 0)::bigint as credits_used_month,
      max(coalesce(wm.sent_at, wm.created_at)) as last_message_at,
      count(*) filter (
        where (wm.status = 'queued' and wm.created_at < now() - interval '15 minutes')
           or (wm.status = 'processing' and coalesce(wm.locked_at, wm.created_at) < now() - interval '15 minutes')
      )::bigint as stuck_count,
      (array_agg(wm.sender_mode order by wm.created_at desc) filter (where wm.sender_mode is not null))[1] as last_sender_mode
    from public.whatsapp_messages wm
    where wm.organization_id = p_organization_id and wm.direction = 'outbound'
  ),
  recent_messages as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', q.id,
      'recipient', q.recipient,
      'phone', q.phone_number_e164,
      'template', q.template,
      'category', q.category,
      'status', q.status,
      'sender_mode', q.sender_mode,
      'meta_message_id', q.meta_message_id,
      'error_code', q.error_code,
      'error_message', q.error_message,
      'credits_used', q.credits_used,
      'created_at', q.created_at,
      'sent_at', q.sent_at,
      'delivered_at', q.delivered_at,
      'read_at', q.read_at
    ) order by q.created_at desc), '[]'::jsonb) as rows
    from (
      select
        wm.id,
        coalesce(nullif(trim(m.first_name || ' ' || coalesce(m.last_name, '')), ''),
          case when wm.recipient_role = 'owner' then 'Gym owner' else wm.phone_number_e164 end) as recipient,
        wm.phone_number_e164,
        coalesce(wm.template_name, wm.template_key, initcap(wm.message_type)) as template,
        wm.category,
        wm.status,
        wm.sender_mode,
        wm.meta_message_id,
        wm.error_code,
        wm.error_message,
        wm.credits_used,
        wm.created_at,
        wm.sent_at,
        wm.delivered_at,
        wm.read_at
      from public.whatsapp_messages wm
      left join public.members m on m.id = wm.member_id and m.organization_id = wm.organization_id
      where wm.organization_id = p_organization_id and wm.direction = 'outbound'
      order by wm.created_at desc
      limit 8
    ) q
  ),
  latest_failure as (
    select jsonb_build_object(
      'id', wm.id,
      'error_code', wm.error_code,
      'error_message', wm.error_message,
      'at', coalesce(wm.failed_at, wm.created_at)
    ) as row
    from public.whatsapp_messages wm
    where wm.organization_id = p_organization_id and wm.status = 'failed'
    order by coalesce(wm.failed_at, wm.created_at) desc
    limit 1
  ),
  recent_activity as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'kind', e.kind, 'label', e.label, 'amount_minor', e.amount_minor,
      'currency', e.currency, 'at', e.at
    ) order by e.at desc), '[]'::jsonb) as rows
    from (
      select * from (
        select 'subscription_payment'::text as kind, 'Subscription payment received'::text as label,
          pp.amount_minor::bigint, pp.currency, pp.paid_at as at
        from public.platform_payments pp
        where pp.organization_id = p_organization_id and pp.status = 'succeeded' and pp.paid_at is not null
        union all
        select 'credit_purchase', 'WhatsApp credits purchased', wcp.amount_minor::bigint, wcp.currency, wcp.paid_at
        from public.whatsapp_credit_purchases wcp
        where wcp.organization_id = p_organization_id and wcp.status = 'succeeded' and wcp.paid_at is not null
        union all
        select 'admin_action', al.action, null::bigint, null::text, al.at
        from public.admin_audit_log al
        where al.target_organization_id = p_organization_id
        union all
        select 'gym_action', initcap(lower(al.action)) || ' · ' || initcap(replace(al.table_name, '_', ' ')), null::bigint, null::text, al.at
        from public.audit_log al
        where al.organization_id = p_organization_id
      ) events
      order by at desc
      limit 6
    ) e
    where e.at is not null
  ),
  notes as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', n.id,
      'content', n.content,
      'category', n.category,
      'created_at', n.created_at,
      'created_by_email', pa.email::text
    ) order by n.created_at desc), '[]'::jsonb) as rows
    from (
      select * from public.admin_gym_notes
      where organization_id = p_organization_id
      order by created_at desc
      limit 5
    ) n
    left join public.platform_admins pa on pa.user_id = n.created_by
  )
  select jsonb_build_object(
    'timezone', v_timezone,
    'subscription', jsonb_build_object(
      'last_payment_minor', sr.last_payment_minor,
      'last_payment_at', sr.last_payment_at,
      'lifetime_paid_minor', sr.lifetime_minor
    ),
    'gym_revenue', jsonb_build_object(
      'today_minor', gr.today_minor,
      'month_minor', gr.month_minor,
      'previous_month_minor', gr.previous_month_minor,
      'lifetime_minor', gr.lifetime_minor,
      'payments_this_month', gr.payments_this_month,
      'last_payment_at', gr.last_payment_at
    ),
    'myfitdesk_revenue', jsonb_build_object(
      'month_minor', pr.month_minor,
      'lifetime_minor', pr.lifetime_minor,
      'last_payment_at', pr.last_payment_at
    ),
    'whatsapp', jsonb_build_object(
      'balance', coalesce(wcb.balance, 0),
      'low_credit_threshold', (select max(t) from unnest(oas.low_credit_thresholds) t where t > 0),
      'sent_today', ws.sent_today,
      'sent_month', ws.sent_month,
      'delivered_month', ws.delivered_month,
      'failed_month', ws.failed_month,
      'pending', ws.pending,
      'utility_month', ws.utility_month,
      'marketing_month', ws.marketing_month,
      'credits_used_month', ws.credits_used_month,
      'last_message_at', ws.last_message_at,
      'stuck_count', ws.stuck_count,
      'last_sender_mode', ws.last_sender_mode,
      'connection_status', wi.status,
      'connection_error', wi.last_error,
      'last_webhook_at', wi.last_webhook_at,
      'last_credit_purchase_at', wcp_last.paid_at,
      'last_credit_purchase_minor', wcp_last.amount_minor,
      'latest_failure', lf.row,
      'recent_messages', rm.rows
    ),
    'activity', jsonb_build_object(
      'active_memberships', count(*) filter (where lm.end_date >= timezone(v_timezone, now())::date),
      'expiring_7d', count(*) filter (where lm.end_date >= timezone(v_timezone, now())::date and lm.end_date < timezone(v_timezone, now())::date + 7),
      'expired_memberships', count(*) filter (where lm.end_date < timezone(v_timezone, now())::date),
      'new_members_month', (select count(*) from public.members m where m.organization_id = p_organization_id and m.deleted_at is null and m.created_at >= v_month_start),
      'payments_month', gr.payments_this_month,
      'last_member_added_at', (select max(m.created_at) from public.members m where m.organization_id = p_organization_id and m.deleted_at is null),
      'last_gym_payment_at', gr.last_payment_at,
      'last_owner_activity_at', (select max(oas2.last_active_at) from public.owner_activity_state oas2 where oas2.organization_id = p_organization_id),
      'last_gym_action_at', (select al.at from public.audit_log al where al.organization_id = p_organization_id order by al.at desc limit 1),
      'last_gym_action', (select initcap(lower(al.action)) || ' · ' || initcap(replace(al.table_name, '_', ' ')) from public.audit_log al where al.organization_id = p_organization_id order by al.at desc limit 1)
    ),
    'health', jsonb_build_object(
      'scheduled_failures', (select count(*) from public.bulk_communication_runs bcr where bcr.organization_id = p_organization_id and bcr.scheduled_at is not null and bcr.status in ('failed','partially_failed') and coalesce(bcr.completed_at, bcr.created_at) >= now() - interval '24 hours'),
      'automation_failures_month', (select count(*) from public.whatsapp_messages wm where wm.organization_id = p_organization_id and wm.origin = 'owner_notification' and wm.status = 'failed' and wm.created_at >= v_month_start),
      'last_automation_at', (select max(wm.created_at) from public.whatsapp_messages wm where wm.organization_id = p_organization_id and wm.origin in ('owner_notification','cron_reminder','auto_receipt')),
      'last_queue_drain_at', wps.last_queue_drain_at
    ),
    'recent_activity', ra.rows,
    'notes', n.rows
  ) into v_result
  from public.organizations o
  cross join gym_revenue gr
  cross join platform_revenue pr
  cross join subscription_revenue sr
  cross join whatsapp_stats ws
  cross join recent_messages rm
  cross join recent_activity ra
  cross join notes n
  left join latest_memberships lm on true
  left join public.whatsapp_credit_balances wcb on wcb.organization_id = o.id
  left join public.whatsapp_integrations wi on wi.organization_id = o.id
  left join public.owner_whatsapp_automation_settings oas on oas.organization_id = o.id
  left join public.whatsapp_platform_status wps on wps.id = 'singleton'
  left join lateral (
    select p.paid_at, p.amount_minor
    from public.whatsapp_credit_purchases p
    where p.organization_id = o.id and p.status = 'succeeded'
    order by p.paid_at desc nulls last
    limit 1
  ) wcp_last on true
  left join latest_failure lf on true
  where o.id = p_organization_id
  group by o.id, wcb.balance, wi.status, wi.last_error, wi.last_webhook_at,
    oas.low_credit_thresholds, wps.last_queue_drain_at, wcp_last.paid_at,
    wcp_last.amount_minor, lf.row, gr.today_minor, gr.month_minor,
    gr.previous_month_minor, gr.lifetime_minor, gr.payments_this_month,
    gr.last_payment_at, pr.month_minor, pr.lifetime_minor, pr.last_payment_at,
    sr.last_payment_minor, sr.last_payment_at, sr.lifetime_minor, ws.sent_today,
    ws.sent_month, ws.delivered_month, ws.failed_month, ws.pending,
    ws.utility_month, ws.marketing_month, ws.credits_used_month,
    ws.last_message_at, ws.stuck_count, ws.last_sender_mode, rm.rows, ra.rows, n.rows;

  return v_result;
end;
$$;

revoke execute on function public.admin_gym_overview(uuid) from public, anon, authenticated;
grant execute on function public.admin_gym_overview(uuid) to authenticated;

create or replace function public.admin_gym_whatsapp_messages(
  p_organization_id uuid,
  p_status text default null,
  p_limit integer default 25,
  p_offset integer default 0
)
returns table (
  id uuid,
  recipient text,
  phone_number_e164 text,
  template text,
  category text,
  status text,
  sender_mode text,
  meta_message_id text,
  error_code text,
  error_message text,
  credits_used integer,
  created_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  total_count bigint
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
  if not exists (select 1 from public.organizations where organizations.id = p_organization_id) then
    raise exception 'Gym not found' using errcode = 'no_data_found';
  end if;

  return query
  select
    wm.id,
    coalesce(nullif(trim(m.first_name || ' ' || coalesce(m.last_name, '')), ''),
      case when wm.recipient_role = 'owner' then 'Gym owner' else wm.phone_number_e164 end),
    wm.phone_number_e164,
    coalesce(wm.template_name, wm.template_key, initcap(wm.message_type)),
    wm.category,
    wm.status,
    wm.sender_mode,
    wm.meta_message_id,
    wm.error_code,
    wm.error_message,
    wm.credits_used,
    wm.created_at,
    wm.sent_at,
    wm.delivered_at,
    wm.read_at,
    count(*) over()
  from public.whatsapp_messages wm
  left join public.members m on m.id = wm.member_id and m.organization_id = wm.organization_id
  where wm.organization_id = p_organization_id
    and wm.direction = 'outbound'
    and (p_status is null or wm.status = p_status)
  order by wm.created_at desc
  limit least(greatest(coalesce(p_limit, 25), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke execute on function public.admin_gym_whatsapp_messages(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.admin_gym_whatsapp_messages(uuid, text, integer, integer) to authenticated;
