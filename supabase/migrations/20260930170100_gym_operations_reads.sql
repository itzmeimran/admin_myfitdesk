-- Gym Command Center — part 2 of 2: read RPCs, alert sync and data export.
--
-- Every public.admin_* function is SECURITY DEFINER with a pinned search_path
-- and starts with app.is_platform_admin(). The app.* helpers are not
-- executable by any client role; they are only reachable through those
-- wrappers (or the pg_cron alert sync). No blanket SELECT policy is added to
-- any tenant table: admins read tenant data exclusively through these
-- curated functions, which never return secrets, provider metadata or raw
-- webhook payloads.

-- ---------------------------------------------------------------------------
-- webhook events attributed to one gym
--
-- payment_provider_events has no reliable organization_id (every live row has
-- it null), so events are attributed by matching the Razorpay order/payment
-- id in the payload against the gym's own platform_payments and
-- whatsapp_credit_purchases.
-- ---------------------------------------------------------------------------

create or replace function app.org_webhook_events(p_organization_id uuid, p_since timestamptz)
returns table (
  id uuid, provider text, event_type text, received_at timestamptz, processed_at timestamptz,
  processing_error text, attempts integer, signature_verified boolean,
  order_id text, payment_id text, amount_minor bigint, entity_status text
)
language sql
stable
security definer
set search_path = public, app, pg_temp
as $$
  with refs as (
    select provider_order_id as o, provider_payment_id as p from public.platform_payments where organization_id = p_organization_id
    union all
    select provider_order_id, provider_payment_id from public.whatsapp_credit_purchases where organization_id = p_organization_id
  ), ev as (
    select e.*,
      coalesce(e.payload #>> '{payload,payment,entity,order_id}', e.payload #>> '{payload,order,entity,id}') as ent_order,
      coalesce(e.payload #>> '{payload,payment,entity,id}', e.payload #>> '{payload,refund,entity,payment_id}') as ent_pay
    from public.payment_provider_events e
    where e.received_at >= p_since
  )
  select ev.id, ev.provider, ev.event_type, ev.received_at, ev.processed_at, ev.processing_error,
         ev.attempts, ev.signature_verified, ev.ent_order, ev.ent_pay,
         case when ev.payload #>> '{payload,payment,entity,amount}' ~ '^\d+$'
              then (ev.payload #>> '{payload,payment,entity,amount}')::bigint end,
         ev.payload #>> '{payload,payment,entity,status}'
  from ev
  where ev.organization_id = p_organization_id
     or (ev.ent_order is not null and ev.ent_order in (select o from refs where o is not null))
     or (ev.ent_pay is not null and ev.ent_pay in (select p from refs where p is not null))
$$;

-- ---------------------------------------------------------------------------
-- payment reconciliation findings (all checks, including passing ones)
-- ---------------------------------------------------------------------------

create or replace function app.recon_check(p_key text, p_severity text, p_title text, p_description text, p_samples jsonb)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'key', p_key, 'severity', p_severity, 'title', p_title, 'description', p_description,
    'count', coalesce(jsonb_array_length(p_samples), 0), 'samples', coalesce(p_samples, '[]'::jsonb))
$$;

create or replace function app.org_recon_findings(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_out jsonb := '[]'::jsonb;
  v_s jsonb;
  v_first_event timestamptz;
begin
  select min(received_at) into v_first_event from public.payment_provider_events;

  -- 1. paid, but the subscription period was never extended
  select coalesce(jsonb_agg(jsonb_build_object('id', pp.id, 'label',
           coalesce(pp.invoice_number, pp.provider_payment_id, pp.id::text) || ' · ' || (pp.amount_minor / 100.0)::numeric(12,2)::text || ' ' || pp.currency,
           'at', pp.paid_at) order by pp.paid_at desc), '[]')
    into v_s
  from public.platform_payments pp
  join public.organization_subscriptions os on os.organization_id = pp.organization_id
  where pp.organization_id = p_organization_id and pp.status = 'succeeded' and pp.period_end is not null
    and os.current_period_end < pp.period_end - interval '1 minute'
    and coalesce(os.pending_period_end, os.current_period_end) < pp.period_end - interval '1 minute';
  v_out := v_out || app.recon_check('paid_not_activated', 'critical', 'Paid, but subscription not activated',
    'A successful subscription payment exists, yet the subscription period does not reach the period that payment bought.', v_s);

  -- 2. gateway says captured, local record is not succeeded
  select coalesce(jsonb_agg(distinct jsonb_build_object('id', x.ref_id, 'label',
           x.kind || ' ' || x.order_id || ' is ' || x.local_status || ' locally but Razorpay reported it captured', 'at', x.at)), '[]')
    into v_s
  from (
    select pp.id as ref_id, 'Subscription payment' as kind, pp.provider_order_id as order_id, pp.status as local_status, e.received_at as at
    from app.org_webhook_events(p_organization_id, now() - interval '90 days') e
    join public.platform_payments pp on pp.organization_id = p_organization_id and pp.provider_order_id = e.order_id
    where e.event_type = 'payment.captured' and pp.status <> 'succeeded'
    union all
    select wcp.id, 'Credit purchase', wcp.provider_order_id, wcp.status, e.received_at
    from app.org_webhook_events(p_organization_id, now() - interval '90 days') e
    join public.whatsapp_credit_purchases wcp on wcp.organization_id = p_organization_id and wcp.provider_order_id = e.order_id
    where e.event_type = 'payment.captured' and wcp.status <> 'succeeded'
  ) x;
  v_out := v_out || app.recon_check('gateway_paid_not_recorded', 'critical', 'Razorpay captured, not recorded as paid',
    'Razorpay reported the payment as captured but the local payment record is not marked succeeded.', v_s);

  -- 3. recorded as paid with no gateway event on file
  select coalesce(jsonb_agg(jsonb_build_object('id', pp.id, 'label',
           coalesce(pp.provider_payment_id, pp.id::text) || ' · ' || (pp.amount_minor / 100.0)::numeric(12,2)::text || ' ' || pp.currency, 'at', pp.paid_at)
           order by pp.paid_at desc), '[]')
    into v_s
  from public.platform_payments pp
  where pp.organization_id = p_organization_id and pp.provider = 'razorpay' and pp.status = 'succeeded'
    and v_first_event is not null and pp.paid_at >= v_first_event - interval '1 day'
    and not exists (
      select 1 from app.org_webhook_events(p_organization_id, v_first_event - interval '1 day') e
      where e.payment_id = pp.provider_payment_id or e.order_id = pp.provider_order_id);
  v_out := v_out || app.recon_check('recorded_without_gateway_event', 'warning', 'Paid locally, no Razorpay event on file',
    'A Razorpay payment is recorded as succeeded, but no webhook event for it exists. It may have been settled by the checkout callback alone.', v_s);

  -- 4. the same gateway payment id recorded more than once
  select coalesce(jsonb_agg(jsonb_build_object('id', d.ref, 'label', d.ref || ' recorded ' || d.n || ' times')), '[]')
    into v_s
  from (
    select ref, count(*) n from (
      select provider_payment_id as ref from public.platform_payments where organization_id = p_organization_id and provider_payment_id is not null
      union all
      select provider_payment_id from public.whatsapp_credit_purchases where organization_id = p_organization_id and provider_payment_id is not null
    ) r group by ref having count(*) > 1
  ) d;
  v_out := v_out || app.recon_check('duplicate_gateway_reference', 'critical', 'Duplicate gateway reference',
    'The same Razorpay payment id appears on more than one payment record.', v_s);

  -- 5. captured amount differs from the local amount
  select coalesce(jsonb_agg(distinct jsonb_build_object('id', x.ref_id, 'label',
           x.order_id || ': Razorpay ' || (x.gateway / 100.0)::numeric(12,2)::text || ' vs recorded ' || (x.local / 100.0)::numeric(12,2)::text, 'at', x.at)), '[]')
    into v_s
  from (
    select pp.id as ref_id, pp.provider_order_id as order_id, e.amount_minor as gateway, pp.amount_minor as local, e.received_at as at
    from app.org_webhook_events(p_organization_id, now() - interval '90 days') e
    join public.platform_payments pp on pp.organization_id = p_organization_id and pp.provider_order_id = e.order_id
    where e.event_type = 'payment.captured' and e.amount_minor is not null and e.amount_minor <> pp.amount_minor
    union all
    select wcp.id, wcp.provider_order_id, e.amount_minor, wcp.amount_minor, e.received_at
    from app.org_webhook_events(p_organization_id, now() - interval '90 days') e
    join public.whatsapp_credit_purchases wcp on wcp.organization_id = p_organization_id and wcp.provider_order_id = e.order_id
    where e.event_type = 'payment.captured' and e.amount_minor is not null and e.amount_minor <> wcp.amount_minor
  ) x;
  v_out := v_out || app.recon_check('amount_mismatch', 'critical', 'Amount mismatch',
    'The amount Razorpay captured differs from the amount recorded for that order.', v_s);

  -- 6. internally inconsistent payment rows
  select coalesce(jsonb_agg(jsonb_build_object('id', pp.id, 'label',
           coalesce(pp.invoice_number, pp.id::text) || ' is succeeded but has no ' ||
           case when pp.paid_at is null then 'paid date' else 'gateway payment id' end, 'at', pp.created_at)), '[]')
    into v_s
  from public.platform_payments pp
  where pp.organization_id = p_organization_id and pp.status = 'succeeded'
    and (pp.paid_at is null or (pp.provider = 'razorpay' and pp.provider_payment_id is null));
  v_out := v_out || app.recon_check('inconsistent_status', 'warning', 'Payment status looks inconsistent',
    'A payment is marked succeeded but is missing its paid date or gateway reference.', v_s);

  -- 7. credit purchase paid, credits never granted
  select coalesce(jsonb_agg(jsonb_build_object('id', wcp.id, 'label',
           wcp.credits || ' credits · ' || (wcp.amount_minor / 100.0)::numeric(12,2)::text || ' ' || wcp.currency, 'at', wcp.paid_at)), '[]')
    into v_s
  from public.whatsapp_credit_purchases wcp
  where wcp.organization_id = p_organization_id and wcp.status = 'succeeded'
    and not exists (select 1 from public.whatsapp_credit_transactions t where t.purchase_id = wcp.id);
  v_out := v_out || app.recon_check('credits_not_granted', 'critical', 'Credits purchased but not granted',
    'A WhatsApp credit purchase succeeded but no credit transaction was recorded for it.', v_s);

  return v_out;
end;
$$;

-- ---------------------------------------------------------------------------
-- data health checks (read-only; nothing here ever modifies a record)
-- ---------------------------------------------------------------------------

create or replace function app.org_data_health(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_out jsonb := '[]'::jsonb;
  v_s jsonb;
  v_total bigint;
begin
  -- helper pattern: samples capped at 10, total via a separate count
  -- no active owner
  select case when exists (select 1 from public.staff_memberships where organization_id = p_organization_id and role = 'owner' and access_status = 'active')
              then '[]'::jsonb else jsonb_build_array(jsonb_build_object('id', p_organization_id, 'label', 'This gym has no active owner account')) end into v_s;
  v_out := v_out || (app.recon_check('no_active_owner', 'critical', 'No active owner', 'Nobody can manage this gym: there is no active owner account.', v_s) || '{"total":0}'::jsonb);

  select case when exists (select 1 from public.organization_subscriptions where organization_id = p_organization_id)
              then '[]'::jsonb else jsonb_build_array(jsonb_build_object('id', p_organization_id, 'label', 'No subscription record exists')) end into v_s;
  v_out := v_out || (app.recon_check('no_subscription_row', 'critical', 'No subscription record', 'The gym has no subscription row, so access cannot be derived.', v_s) || '{"total":0}'::jsonb);

  -- duplicate phones
  select count(*) into v_total from (select phone_e164 from public.members where organization_id = p_organization_id and deleted_at is null and phone_e164 is not null group by phone_e164 having count(*) > 1) d;
  select coalesce(jsonb_agg(jsonb_build_object('id', d.phone_e164, 'label', d.phone_e164 || ' shared by ' || d.n || ' members: ' || d.names)), '[]') into v_s
  from (select phone_e164, count(*) n, string_agg(first_name || coalesce(' ' || last_name, ''), ', ' order by first_name) names
        from public.members where organization_id = p_organization_id and deleted_at is null and phone_e164 is not null
        group by phone_e164 having count(*) > 1 order by count(*) desc limit 10) d;
  v_out := v_out || (app.recon_check('duplicate_phones', 'warning', 'Duplicate phone numbers', 'Several members share one phone number.', v_s) || jsonb_build_object('total', v_total));

  -- duplicate emails
  select count(*) into v_total from (select lower(email::text) e from public.members where organization_id = p_organization_id and deleted_at is null and email is not null group by lower(email::text) having count(*) > 1) d;
  select coalesce(jsonb_agg(jsonb_build_object('id', d.e, 'label', d.e || ' shared by ' || d.n || ' members')), '[]') into v_s
  from (select lower(email::text) e, count(*) n from public.members where organization_id = p_organization_id and deleted_at is null and email is not null
        group by lower(email::text) having count(*) > 1 order by count(*) desc limit 10) d;
  v_out := v_out || (app.recon_check('duplicate_emails', 'warning', 'Duplicate email addresses', 'Several members share one email address.', v_s) || jsonb_build_object('total', v_total));

  -- members with no membership at all
  select count(*) into v_total from public.members m where m.organization_id = p_organization_id and m.deleted_at is null
    and not exists (select 1 from public.member_subscriptions s where s.member_id = m.id and s.deleted_at is null);
  select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'label', q.nm)), '[]') into v_s
  from (select m.id, m.first_name || coalesce(' ' || m.last_name, '') || ' (' || m.member_code || ')' nm from public.members m
        where m.organization_id = p_organization_id and m.deleted_at is null
          and not exists (select 1 from public.member_subscriptions s where s.member_id = m.id and s.deleted_at is null)
        order by m.created_at desc limit 10) q;
  v_out := v_out || (app.recon_check('members_without_membership', 'info', 'Members without any membership', 'These members have never been given a membership (or every membership was removed).', v_s) || jsonb_build_object('total', v_total));

  -- memberships without a plan
  select count(*) into v_total from public.member_subscriptions s where s.organization_id = p_organization_id and s.deleted_at is null and s.plan_id is null;
  select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'label', q.nm)), '[]') into v_s
  from (select s.id, s.plan_name_snapshot || ' (' || s.start_date || ' → ' || s.end_date || ')' nm from public.member_subscriptions s
        where s.organization_id = p_organization_id and s.deleted_at is null and s.plan_id is null order by s.created_at desc limit 10) q;
  v_out := v_out || (app.recon_check('subscription_without_plan', 'info', 'Memberships without a plan', 'The plan these memberships were sold under no longer exists; only its name snapshot remains.', v_s) || jsonb_build_object('total', v_total));

  -- memberships with invalid dates
  select count(*) into v_total from public.member_subscriptions s where s.organization_id = p_organization_id and s.deleted_at is null and s.end_date < s.start_date;
  select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'label', q.nm)), '[]') into v_s
  from (select s.id, s.plan_name_snapshot || ' starts ' || s.start_date || ', ends ' || s.end_date nm from public.member_subscriptions s
        where s.organization_id = p_organization_id and s.deleted_at is null and s.end_date < s.start_date limit 10) q;
  v_out := v_out || (app.recon_check('membership_dates_invalid', 'warning', 'Memberships ending before they start', 'The end date is earlier than the start date.', v_s) || jsonb_build_object('total', v_total));

  -- live memberships of deleted members
  select count(*) into v_total from public.member_subscriptions s join public.members m on m.id = s.member_id
    where s.organization_id = p_organization_id and s.deleted_at is null and m.deleted_at is not null;
  select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'label', q.nm)), '[]') into v_s
  from (select s.id, s.plan_name_snapshot || ' belongs to deleted member ' || m.first_name nm from public.member_subscriptions s join public.members m on m.id = s.member_id
        where s.organization_id = p_organization_id and s.deleted_at is null and m.deleted_at is not null limit 10) q;
  v_out := v_out || (app.recon_check('orphaned_memberships', 'warning', 'Orphaned memberships', 'An active membership record belongs to a member who has been deleted.', v_s) || jsonb_build_object('total', v_total));

  -- payments with no member / invalid amount
  select count(*) into v_total from public.payments p where p.organization_id = p_organization_id and (p.member_id is null or (p.status = 'succeeded' and p.amount_minor <= 0));
  select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'label', q.nm)), '[]') into v_s
  from (select p.id, coalesce(p.invoice_number, p.id::text) || case when p.member_id is null then ' has no member' else ' has a non-positive amount' end nm
        from public.payments p where p.organization_id = p_organization_id and (p.member_id is null or (p.status = 'succeeded' and p.amount_minor <= 0)) limit 10) q;
  v_out := v_out || (app.recon_check('invalid_payments', 'warning', 'Invalid payments', 'A payment has no member, or a succeeded payment has a zero/negative amount.', v_s) || jsonb_build_object('total', v_total));

  -- negative balances
  select count(*) into v_total from (
    select 1 from public.whatsapp_credit_balances b where b.organization_id = p_organization_id and b.balance < 0
    union all select 1 from public.inventory_products i where i.organization_id = p_organization_id and i.deleted_at is null and i.current_stock < 0) z;
  select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'label', q.nm)), '[]') into v_s
  from (select b.organization_id id, 'WhatsApp credit balance is ' || b.balance nm from public.whatsapp_credit_balances b where b.organization_id = p_organization_id and b.balance < 0
        union all select i.id, i.name || ' has stock ' || i.current_stock from public.inventory_products i where i.organization_id = p_organization_id and i.deleted_at is null and i.current_stock < 0) q;
  v_out := v_out || (app.recon_check('negative_balances', 'critical', 'Negative balances', 'A credit balance or inventory stock level is below zero.', v_s) || jsonb_build_object('total', v_total));

  -- branch / staff consistency
  select count(*) into v_total from public.staff_memberships sm
    where sm.organization_id = p_organization_id and sm.branch_id is not null
      and not exists (select 1 from public.branches b where b.id = sm.branch_id and b.organization_id = sm.organization_id);
  select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'label', q.nm)), '[]') into v_s
  from (select sm.id, coalesce(sm.email::text, sm.id::text) || ' is assigned to a branch of another gym' nm from public.staff_memberships sm
        where sm.organization_id = p_organization_id and sm.branch_id is not null
          and not exists (select 1 from public.branches b where b.id = sm.branch_id and b.organization_id = sm.organization_id) limit 10) q;
  v_out := v_out || (app.recon_check('staff_branch_mismatch', 'critical', 'Staff assigned to a foreign branch', 'A team member is tied to a branch that does not belong to this gym.', v_s) || jsonb_build_object('total', v_total));

  return v_out;
end;
$$;

-- ---------------------------------------------------------------------------
-- background job / automation health (derived from the tables each job writes)
-- ---------------------------------------------------------------------------

create or replace function app.org_job_stats(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_jobs jsonb := '[]'::jsonb;
  wi public.whatsapp_integrations;
  ps public.whatsapp_platform_status;
  st public.owner_whatsapp_automation_settings;
  v_last_run timestamptz; v_last_ok timestamptz; v_fail bigint; v_err text; v_next timestamptz; v_status text;
  v_stuck bigint; v_pending bigint;
begin
  select * into wi from public.whatsapp_integrations where organization_id = p_organization_id;
  select * into ps from public.whatsapp_platform_status where id = 'singleton';
  select * into st from public.owner_whatsapp_automation_settings where organization_id = p_organization_id;

  -- expiry reminders
  select max(wm.created_at) filter (where wm.status in ('sent','delivered','read')),
         count(*) filter (where wm.status = 'failed' and wm.created_at > now() - interval '7 days'),
         (array_agg(wm.error_message order by wm.created_at desc) filter (where wm.status = 'failed'))[1]
    into v_last_ok, v_fail, v_err
  from public.whatsapp_messages wm where wm.organization_id = p_organization_id and wm.origin = 'cron_reminder';
  v_last_run := greatest(wi.last_reminder_scan_at, ps.last_reminder_cron_at);
  v_status := case
    when wi.id is null and v_last_ok is null then 'not_configured'
    when v_fail > 0 then 'degraded'
    when v_last_run is null and v_last_ok is null then 'idle'
    when coalesce(v_last_run, v_last_ok) < now() - interval '36 hours' then 'degraded'
    else 'healthy' end;
  v_jobs := v_jobs || jsonb_build_object('key','expiry_reminders','label','Expiry reminders','last_run_at',v_last_run,'last_success_at',v_last_ok,
    'next_expected_at',null,'status',v_status,'failures_7d',coalesce(v_fail,0),'error_message',v_err,
    'detail', jsonb_build_object('last_queued', wi.last_reminder_queued, 'last_skipped', wi.last_reminder_skipped, 'reminders_enabled', wi.expiry_reminder_enabled));

  -- owner daily brief / alerts
  select max(wm.created_at) filter (where wm.status in ('sent','delivered','read')),
         count(*) filter (where wm.status = 'failed' and wm.created_at > now() - interval '7 days'),
         (array_agg(wm.error_message order by wm.created_at desc) filter (where wm.status = 'failed'))[1]
    into v_last_ok, v_fail, v_err
  from public.whatsapp_messages wm where wm.organization_id = p_organization_id and wm.origin = 'owner_notification';
  v_status := case
    when st.organization_id is null or not (st.daily_brief_enabled or st.inactivity_alerts_enabled or st.low_credit_alerts_enabled) then 'disabled'
    when v_fail > 0 then 'degraded'
    when ps.last_owner_notification_scan_at is null then 'idle'
    when ps.last_owner_notification_scan_at < now() - interval '36 hours' then 'degraded'
    else 'healthy' end;
  v_jobs := v_jobs || jsonb_build_object('key','owner_brief','label','Daily owner brief & alerts','last_run_at',ps.last_owner_notification_scan_at,'last_success_at',v_last_ok,
    'next_expected_at',null,'status',v_status,'failures_7d',coalesce(v_fail,0),'error_message',v_err,
    'detail', jsonb_build_object('daily_brief_enabled', st.daily_brief_enabled, 'daily_brief_time', st.daily_brief_time));

  -- scheduled broadcasts
  select max(coalesce(r.completed_at, r.created_at)) filter (where r.status in ('completed','partially_failed','failed')),
         max(r.completed_at) filter (where r.status = 'completed'),
         count(*) filter (where r.status in ('failed','partially_failed') and coalesce(r.completed_at, r.created_at) > now() - interval '7 days'),
         (array_agg(r.error_message order by coalesce(r.completed_at, r.created_at) desc) filter (where r.status in ('failed','partially_failed') and r.error_message is not null))[1],
         min(r.scheduled_at) filter (where r.status = 'scheduled' and r.scheduled_at > now())
    into v_last_run, v_last_ok, v_fail, v_err, v_next
  from public.bulk_communication_runs r where r.organization_id = p_organization_id and r.scheduled_at is not null;
  v_status := case when v_last_run is null and v_next is null then 'idle' when v_fail > 0 then 'failed' else 'healthy' end;
  v_jobs := v_jobs || jsonb_build_object('key','scheduled_broadcasts','label','Scheduled broadcasts','last_run_at',v_last_run,'last_success_at',v_last_ok,
    'next_expected_at',v_next,'status',v_status,'failures_7d',coalesce(v_fail,0),'error_message',v_err,'detail','{}'::jsonb);

  -- WhatsApp queue
  select count(*) filter (where (wm.status = 'queued' and wm.created_at < now() - interval '15 minutes')
                            or (wm.status = 'processing' and coalesce(wm.locked_at, wm.created_at) < now() - interval '15 minutes')),
         count(*) filter (where wm.status in ('queued','processing')),
         count(*) filter (where wm.status = 'failed' and wm.created_at > now() - interval '7 days'),
         (array_agg(wm.error_message order by wm.created_at desc) filter (where wm.status = 'failed'))[1]
    into v_stuck, v_pending, v_fail, v_err
  from public.whatsapp_messages wm where wm.organization_id = p_organization_id and wm.direction = 'outbound';
  v_status := case when v_stuck > 0 then 'degraded' when ps.last_queue_drain_at is null then 'idle'
                   when ps.last_queue_drain_at < now() - interval '36 hours' and v_pending > 0 then 'degraded' else 'healthy' end;
  v_jobs := v_jobs || jsonb_build_object('key','whatsapp_queue','label','WhatsApp send queue','last_run_at',ps.last_queue_drain_at,'last_success_at',ps.last_queue_drain_at,
    'next_expected_at',null,'status',v_status,'failures_7d',coalesce(v_fail,0),'error_message',v_err,
    'detail', jsonb_build_object('pending', v_pending, 'stuck', v_stuck, 'last_sent', ps.last_queue_drain_sent, 'last_failed', ps.last_queue_drain_failed));

  -- recurring expenses
  select max(d.created_at), max(d.created_at) filter (where d.status = 'generated'),
         count(*) filter (where d.status = 'failed' and d.created_at > now() - interval '7 days'),
         (array_agg(d.error_message order by d.created_at desc) filter (where d.status = 'failed'))[1]
    into v_last_run, v_last_ok, v_fail, v_err
  from public.recurring_expense_dispatches d where d.organization_id = p_organization_id;
  v_status := case when v_last_run is null then 'idle' when v_fail > 0 then 'failed' else 'healthy' end;
  v_jobs := v_jobs || jsonb_build_object('key','recurring_expenses','label','Recurring expenses','last_run_at',v_last_run,'last_success_at',v_last_ok,
    'next_expected_at',null,'status',v_status,'failures_7d',coalesce(v_fail,0),'error_message',v_err,'detail','{}'::jsonb);

  -- email
  v_jobs := v_jobs || jsonb_build_object('key','email','label','Email delivery','last_run_at',null,'last_success_at',null,'next_expected_at',null,
    'status','not_tracked','failures_7d',0,'error_message',null,'detail','{}'::jsonb);

  return v_jobs;
end;
$$;

-- ---------------------------------------------------------------------------
-- webhook health per provider
-- ---------------------------------------------------------------------------

create or replace function app.org_webhook_summary(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_out jsonb := '[]'::jsonb;
  rz record;
  wi public.whatsapp_integrations;
  v_recent_sends bigint;
begin
  select max(e.received_at) last_received, max(e.processed_at) last_processed,
         count(*) filter (where e.processing_error is not null and e.received_at > now() - interval '7 days') failed,
         count(*) filter (where e.processed_at is null and e.processing_error is null and e.received_at < now() - interval '10 minutes') stuck,
         count(*) filter (where e.signature_verified is false and e.received_at > now() - interval '7 days') bad_sig,
         (array_agg(e.processing_error order by e.received_at desc) filter (where e.processing_error is not null))[1] last_error,
         count(*) total
    into rz
  from app.org_webhook_events(p_organization_id, now() - interval '90 days') e;
  v_out := v_out || jsonb_build_object('provider','razorpay','label','Razorpay','status',
      case when rz.total = 0 then 'no_events' when rz.failed > 0 or rz.bad_sig > 0 then 'failed' when rz.stuck > 0 then 'warning' else 'healthy' end,
    'last_received_at', rz.last_received, 'last_processed_at', rz.last_processed, 'failed_count', rz.failed + rz.bad_sig,
    'unprocessed_count', rz.stuck, 'last_error', rz.last_error);

  select * into wi from public.whatsapp_integrations where organization_id = p_organization_id;
  select count(*) into v_recent_sends from public.whatsapp_messages
    where organization_id = p_organization_id and direction = 'outbound' and status = 'sent' and created_at < now() - interval '1 day' and created_at > now() - interval '7 days';
  v_out := v_out || jsonb_build_object('provider','whatsapp','label','WhatsApp (Meta)','status',
      case when wi.id is null then 'not_configured'
           when wi.last_webhook_at is null and v_recent_sends > 0 then 'warning'
           when wi.last_webhook_at is null then 'no_events'
           when v_recent_sends > 0 and wi.last_webhook_at < now() - interval '2 days' then 'warning'
           else 'healthy' end,
    'last_received_at', wi.last_webhook_at, 'last_processed_at', wi.last_webhook_at, 'failed_count', 0,
    'unprocessed_count', v_recent_sends,
    'last_error', case when v_recent_sends > 0 and (wi.last_webhook_at is null or wi.last_webhook_at < now() - interval '2 days')
                       then v_recent_sends || ' message(s) are still "sent" after a day with no recent delivery receipt' end);

  v_out := v_out || jsonb_build_object('provider','email','label','Email (Resend)','status','not_tracked',
    'last_received_at', null, 'last_processed_at', null, 'failed_count', 0, 'unprocessed_count', 0, 'last_error', null);
  return v_out;
end;
$$;

-- ---------------------------------------------------------------------------
-- alert candidates + sync (idempotent; re-running never duplicates an alert)
-- ---------------------------------------------------------------------------

create or replace function app.org_alert_candidates(p_organization_id uuid)
returns table (dedupe_key text, severity text, type text, title text, message text, metadata jsonb)
language plpgsql
stable
security definer
set search_path = public, app, pg_temp
as $$
declare
  os public.organization_subscriptions;
  wi public.whatsapp_integrations;
  v_balance integer; v_threshold integer; v_uses_wa boolean;
  v_sent bigint; v_failed bigint; v_stuck bigint; v_days integer;
  v_last_active timestamptz; v_env text := app.current_environment();
  v_backup timestamptz; v_hours numeric;
  v_recon jsonb; v_health jsonb; v_jobs jsonb; v_n integer; v_c integer; j jsonb;
  v_webhook_failed bigint;
begin
  select * into os from public.organization_subscriptions where organization_id = p_organization_id;
  if os.organization_id is not null and os.status <> 'cancelled' then
    v_days := (os.current_period_end::date - now()::date);
    if v_days < 0 then
      return query select 'subscription_expired', 'critical', 'subscription', 'Subscription expired',
        'The subscription ended ' || abs(v_days) || ' day(s) ago.', jsonb_build_object('days', v_days);
    elsif v_days <= 7 then
      return query select 'subscription_expiring', 'warning', 'subscription', 'Subscription expiring soon',
        'The subscription ends in ' || v_days || ' day(s).', jsonb_build_object('days', v_days);
    end if;
  end if;

  select * into wi from public.whatsapp_integrations where organization_id = p_organization_id;
  select balance into v_balance from public.whatsapp_credit_balances where organization_id = p_organization_id;
  select (select max(t) from unnest(low_credit_thresholds) t where t > 0) into v_threshold
    from public.owner_whatsapp_automation_settings where organization_id = p_organization_id;
  v_uses_wa := wi.id is not null or exists (select 1 from public.whatsapp_messages where organization_id = p_organization_id and direction = 'outbound' and created_at > now() - interval '60 days');
  if v_uses_wa and v_balance is not null then
    if v_balance <= 0 then
      return query select 'whatsapp_zero_balance', 'critical', 'whatsapp', 'WhatsApp credits exhausted',
        'The credit balance is zero, so no messages can be sent.', jsonb_build_object('balance', v_balance);
    elsif v_threshold is not null and v_balance <= v_threshold then
      return query select 'whatsapp_low_balance', 'warning', 'whatsapp', 'Low WhatsApp credit balance',
        'Only ' || v_balance || ' credits remain.', jsonb_build_object('balance', v_balance, 'threshold', v_threshold);
    end if;
  end if;
  if wi.status = 'error' then
    return query select 'whatsapp_connection_error', 'critical', 'whatsapp', 'WhatsApp connection error',
      coalesce(wi.last_error, 'The WhatsApp configuration reports an error.'), '{}'::jsonb;
  end if;

  select count(*) filter (where status in ('sent','delivered','read','failed')), count(*) filter (where status = 'failed'),
         count(*) filter (where (status = 'queued' and created_at < now() - interval '15 minutes')
                            or (status = 'processing' and coalesce(locked_at, created_at) < now() - interval '15 minutes'))
    into v_sent, v_failed, v_stuck
  from public.whatsapp_messages
  where organization_id = p_organization_id and direction = 'outbound' and created_at > now() - interval '24 hours';
  if v_failed >= 3 and v_sent > 0 and (v_failed::numeric / v_sent) >= 0.25 then
    return query select 'whatsapp_failure_rate',
      case when v_failed >= 10 and (v_failed::numeric / v_sent) >= 0.5 then 'critical' else 'warning' end,
      'whatsapp', 'Repeated WhatsApp failures',
      v_failed || ' of ' || v_sent || ' messages failed in the last 24 hours.',
      jsonb_build_object('failed', v_failed, 'attempted', v_sent);
  end if;
  if v_stuck > 0 then
    return query select 'whatsapp_stuck_queue', 'warning', 'whatsapp', 'WhatsApp messages stuck in the queue',
      v_stuck || ' message(s) have been waiting more than 15 minutes.', jsonb_build_object('stuck', v_stuck);
  end if;

  select count(*) into v_webhook_failed from app.org_webhook_events(p_organization_id, now() - interval '7 days') e
    where e.processing_error is not null or e.signature_verified is false;
  if v_webhook_failed > 0 then
    return query select 'payment_webhook_failed', 'critical', 'webhook', 'Payment webhook failed',
      v_webhook_failed || ' Razorpay event(s) failed to process in the last 7 days.', jsonb_build_object('failed', v_webhook_failed);
  end if;

  v_recon := app.org_recon_findings(p_organization_id);
  for j in select * from jsonb_array_elements(v_recon) loop
    if (j->>'count')::int > 0 and j->>'key' in ('paid_not_activated', 'gateway_paid_not_recorded', 'amount_mismatch', 'credits_not_granted') then
      return query select 'recon_' || (j->>'key'), 'critical', 'payment', j->>'title',
        (j->>'count') || ' record(s): ' || (j->>'description'), jsonb_build_object('count', (j->>'count')::int);
    elsif (j->>'count')::int > 0 and j->>'key' = 'duplicate_gateway_reference' then
      return query select 'duplicate_payment', 'critical', 'payment', 'Duplicate payment reference',
        (j->>'count') || ' gateway reference(s) are recorded more than once.', jsonb_build_object('count', (j->>'count')::int);
    end if;
  end loop;

  select last_active_at into v_last_active from public.owner_activity_state where organization_id = p_organization_id;
  if v_last_active is not null and v_last_active < now() - interval '14 days' then
    return query select 'owner_inactive', 'warning', 'engagement', 'No owner activity',
      'The owner has not been active for ' || (now()::date - v_last_active::date) || ' days.', jsonb_build_object('days', now()::date - v_last_active::date);
  end if;

  v_jobs := app.org_job_stats(p_organization_id);
  for j in select * from jsonb_array_elements(v_jobs) loop
    if j->>'status' in ('failed', 'degraded') then
      return query select 'job_' || (j->>'key'), case when j->>'status' = 'failed' then 'warning' else 'info' end, 'job',
        (j->>'label') || case when j->>'status' = 'failed' then ' failed' else ' is degraded' end,
        coalesce(j->>'error_message', 'See the Jobs section for details.'), jsonb_build_object('status', j->>'status');
    end if;
  end loop;

  select max(completed_at) into v_backup from public.database_backups where environment = v_env and status = 'ready';
  if v_backup is not null then
    v_hours := extract(epoch from (now() - v_backup)) / 3600;
    if v_hours > 12 then
      return query select 'backup_stale', case when v_hours > 26 then 'critical' else 'warning' end, 'backup', 'Database backup is stale',
        'The newest successful backup is ' || round(v_hours, 1) || ' hours old.', jsonb_build_object('hours', round(v_hours, 1));
    end if;
  end if;

  v_health := app.org_data_health(p_organization_id);
  select count(*) filter (where (e->>'count')::int > 0 and e->>'severity' = 'critical'),
         count(*) filter (where (e->>'count')::int > 0 and e->>'severity' = 'warning')
    into v_c, v_n from jsonb_array_elements(v_health) e;
  if v_c > 0 then
    return query select 'data_integrity', 'critical', 'data', 'Data integrity warning',
      v_c || ' critical data-health check(s) are failing.', jsonb_build_object('critical', v_c, 'warning', v_n);
  elsif v_n > 0 then
    return query select 'data_integrity', 'warning', 'data', 'Data integrity warning',
      v_n || ' data-health check(s) need review.', jsonb_build_object('critical', v_c, 'warning', v_n);
  end if;
end;
$$;

create or replace function app.sync_org_alerts(p_organization_id uuid)
returns void
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  c record;
  v_env text := app.current_environment();
  v_keys text[];
begin
  select coalesce(array_agg(k.dedupe_key), '{}') into v_keys from app.org_alert_candidates(p_organization_id) k;

  for c in select * from app.org_alert_candidates(p_organization_id) loop
    update public.system_alerts
    set severity = c.severity, title = c.title, message = c.message, metadata = c.metadata
    where organization_id = p_organization_id and dedupe_key = c.dedupe_key and resolved_at is null;
    if not found
       and not exists (select 1 from public.system_alerts
                       where organization_id = p_organization_id and dedupe_key = c.dedupe_key
                         and resolved_by is not null and resolved_at > now() - interval '24 hours') then
      insert into public.system_alerts (severity, type, environment, organization_id, title, message, metadata, dedupe_key)
      values (c.severity, c.type, v_env, p_organization_id, c.title, c.message, c.metadata, c.dedupe_key)
      on conflict do nothing;
    end if;
  end loop;

  update public.system_alerts
  set resolved_at = now(), resolution_note = 'Condition cleared automatically'
  where organization_id = p_organization_id and resolved_at is null and dedupe_key is not null
    and dedupe_key <> all (v_keys);
end;
$$;

create or replace function app.sync_all_org_alerts()
returns void
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare o record;
begin
  for o in select id from public.organizations loop
    begin
      perform app.sync_org_alerts(o.id);
    exception when others then
      raise warning 'alert sync failed for %: %', o.id, sqlerrm;
    end;
  end loop;
end;
$$;

revoke execute on function app.org_webhook_events(uuid, timestamptz) from public, anon, authenticated;
revoke execute on function app.recon_check(text, text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function app.org_recon_findings(uuid) from public, anon, authenticated;
revoke execute on function app.org_data_health(uuid) from public, anon, authenticated;
revoke execute on function app.org_job_stats(uuid) from public, anon, authenticated;
revoke execute on function app.org_webhook_summary(uuid) from public, anon, authenticated;
revoke execute on function app.org_alert_candidates(uuid) from public, anon, authenticated;
revoke execute on function app.sync_org_alerts(uuid) from public, anon, authenticated;
revoke execute on function app.sync_all_org_alerts() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- public admin reads
-- ---------------------------------------------------------------------------

create or replace function public.admin_gym_reconciliation(p_organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, app, pg_temp as $$
begin
  if not app.is_platform_admin() then raise exception 'Not authorized' using errcode = 'insufficient_privilege'; end if;
  if not exists (select 1 from public.organizations where id = p_organization_id) then raise exception 'Gym not found' using errcode = 'no_data_found'; end if;
  return app.org_recon_findings(p_organization_id);
end; $$;

create or replace function public.admin_gym_data_health(p_organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, app, pg_temp as $$
begin
  if not app.is_platform_admin() then raise exception 'Not authorized' using errcode = 'insufficient_privilege'; end if;
  if not exists (select 1 from public.organizations where id = p_organization_id) then raise exception 'Gym not found' using errcode = 'no_data_found'; end if;
  return app.org_data_health(p_organization_id);
end; $$;

create or replace function public.admin_gym_jobs(p_organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, app, pg_temp as $$
begin
  if not app.is_platform_admin() then raise exception 'Not authorized' using errcode = 'insufficient_privilege'; end if;
  if not exists (select 1 from public.organizations where id = p_organization_id) then raise exception 'Gym not found' using errcode = 'no_data_found'; end if;
  return app.org_job_stats(p_organization_id);
end; $$;

create or replace function public.admin_gym_webhooks(p_organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, app, pg_temp as $$
declare v_events jsonb;
begin
  if not app.is_platform_admin() then raise exception 'Not authorized' using errcode = 'insufficient_privilege'; end if;
  if not exists (select 1 from public.organizations where id = p_organization_id) then raise exception 'Gym not found' using errcode = 'no_data_found'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', e.id, 'provider', e.provider, 'event_type', e.event_type, 'received_at', e.received_at,
      'processed_at', e.processed_at, 'processing_error', e.processing_error, 'attempts', e.attempts,
      'signature_verified', e.signature_verified, 'order_id', e.order_id, 'payment_id', e.payment_id,
      'amount_minor', e.amount_minor, 'gateway_status', e.entity_status) order by e.received_at desc), '[]')
    into v_events
  from (select * from app.org_webhook_events(p_organization_id, now() - interval '90 days') order by received_at desc limit 25) e;
  return jsonb_build_object('providers', app.org_webhook_summary(p_organization_id), 'recent_events', v_events);
end; $$;

create or replace function public.admin_gym_whatsapp_ops(p_organization_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public, app, pg_temp
as $$
declare
  v_result jsonb;
  v_balance integer;
  v_eligible bigint;
begin
  if not app.is_platform_admin() then raise exception 'Not authorized' using errcode = 'insufficient_privilege'; end if;
  if not exists (select 1 from public.organizations where id = p_organization_id) then raise exception 'Gym not found' using errcode = 'no_data_found'; end if;
  select coalesce(balance, 0) into v_balance from public.whatsapp_credit_balances where organization_id = p_organization_id;
  v_balance := coalesce(v_balance, 0);

  select count(*) into v_eligible
  from public.whatsapp_messages m
  where m.organization_id = p_organization_id and m.direction = 'outbound' and m.origin <> 'bulk'
    and m.meta_message_id is null and m.created_at > now() - interval '7 days'
    and ((m.status = 'failed' and (m.error_code is null or m.error_code in ('1', '2', '4', '80007')))
         or (m.status = 'skipped' and v_balance > 0 and m.error_message ilike '%credit%'))
    and not exists (
      select 1 from public.whatsapp_messages n
      where n.organization_id = m.organization_id and n.id <> m.id and n.direction = 'outbound'
        and n.phone_number_e164 = m.phone_number_e164 and n.template_name is not distinct from m.template_name
        and n.payment_id is not distinct from m.payment_id and n.reminder_due_date is not distinct from m.reminder_due_date
        and n.created_at >= m.created_at and n.status in ('queued','processing','sent','delivered','read'));

  select jsonb_build_object(
    'balance', v_balance,
    'paused', app.org_lock_active(p_organization_id, 'block_whatsapp'),
    'total_sent', count(*) filter (where wm.status in ('sent','delivered','read')),
    'sent_30d', count(*) filter (where wm.status in ('sent','delivered','read') and wm.created_at > now() - interval '30 days'),
    'delivered_30d', count(*) filter (where wm.status in ('delivered','read') and wm.created_at > now() - interval '30 days'),
    'read_30d', count(*) filter (where wm.status = 'read' and wm.created_at > now() - interval '30 days'),
    'failed_30d', count(*) filter (where wm.status = 'failed' and wm.created_at > now() - interval '30 days'),
    'skipped_30d', count(*) filter (where wm.status = 'skipped' and wm.created_at > now() - interval '30 days'),
    'pending', count(*) filter (where wm.status in ('queued','processing')),
    'last_message_at', max(wm.created_at),
    'last_success_at', max(coalesce(wm.sent_at, wm.created_at)) filter (where wm.status in ('sent','delivered','read')),
    'last_failure', (select jsonb_build_object('at', coalesce(f.failed_at, f.created_at), 'code', f.error_code, 'message', f.error_message)
                     from public.whatsapp_messages f where f.organization_id = p_organization_id and f.status = 'failed'
                     order by coalesce(f.failed_at, f.created_at) desc limit 1),
    'top_failures', (select coalesce(jsonb_agg(jsonb_build_object('code', x.code, 'message', x.msg, 'count', x.n) order by x.n desc), '[]')
                     from (select coalesce(f.error_code, 'unknown') code, left(coalesce(f.error_message, 'No provider detail'), 140) msg, count(*) n
                           from public.whatsapp_messages f
                           where f.organization_id = p_organization_id and f.status = 'failed' and f.created_at > now() - interval '30 days'
                           group by 1, 2 order by n desc limit 5) x),
    'retry_eligible', v_eligible
  ) into v_result
  from public.whatsapp_messages wm
  where wm.organization_id = p_organization_id and wm.direction = 'outbound';

  return v_result;
end;
$$;

create or replace function public.admin_gym_credit_history(p_organization_id uuid, p_limit integer default 25, p_offset integer default 0)
returns table (id uuid, delta integer, reason text, balance_after integer, created_at timestamptz,
               created_by_email text, admin_reason text, total_count bigint)
language plpgsql stable security definer set search_path = public, app, pg_temp
as $$
begin
  if not app.is_platform_admin() then raise exception 'Not authorized' using errcode = 'insufficient_privilege'; end if;
  if not exists (select 1 from public.organizations where organizations.id = p_organization_id) then raise exception 'Gym not found' using errcode = 'no_data_found'; end if;
  return query
  select t.id, t.delta, t.reason, t.balance_after, t.created_at,
         pa.email::text,
         coalesce(al.detail->>'reason', al.detail->>'note'),
         count(*) over()
  from public.whatsapp_credit_transactions t
  left join public.platform_admins pa on pa.user_id = t.created_by
  left join lateral (
    select a.detail from public.admin_audit_log a
    where a.target_organization_id = p_organization_id
      and a.action in ('whatsapp_credits.add', 'whatsapp_credits.remove', 'whatsapp_credits.grant')
      and (a.detail->>'transaction_id') = t.id::text
    limit 1) al on true
  where t.organization_id = p_organization_id and t.reason in ('adjustment', 'purchase')
  order by t.created_at desc
  limit least(greatest(coalesce(p_limit, 25), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

create or replace function public.admin_gym_locks(p_organization_id uuid)
returns table (lock_type text, is_enabled boolean, is_active boolean, reason text, expires_at timestamptz,
               updated_at timestamptz, updated_by_email text)
language plpgsql stable security definer set search_path = public, app, pg_temp
as $$
begin
  if not app.is_platform_admin() then raise exception 'Not authorized' using errcode = 'insufficient_privilege'; end if;
  return query
  select l.lock_type, l.is_enabled, (l.is_enabled and (l.expires_at is null or l.expires_at > now())),
         l.reason, l.expires_at, l.updated_at, pa.email::text
  from public.organization_operation_locks l
  left join public.platform_admins pa on pa.user_id = coalesce(l.updated_by, l.created_by)
  where l.organization_id = p_organization_id
  order by l.lock_type;
end;
$$;

create or replace function public.admin_gym_feature_flags(p_organization_id uuid)
returns table (flag_key text, label text, description text, default_enabled boolean, is_enabled boolean,
               overridden boolean, updated_at timestamptz, updated_by_email text, reason text)
language plpgsql stable security definer set search_path = public, app, pg_temp
as $$
begin
  if not app.is_platform_admin() then raise exception 'Not authorized' using errcode = 'insufficient_privilege'; end if;
  return query
  select d.flag_key, d.label, d.description, d.default_enabled,
         coalesce(f.is_enabled, d.default_enabled), f.organization_id is not null,
         f.updated_at, pa.email::text, f.reason
  from public.feature_flag_definitions d
  left join public.organization_feature_flags f on f.flag_key = d.flag_key and f.organization_id = p_organization_id
  left join public.platform_admins pa on pa.user_id = f.updated_by
  order by d.label;
end;
$$;

create or replace function public.admin_gym_notes_list(p_organization_id uuid)
returns table (id uuid, content text, category text, created_at timestamptz, updated_at timestamptz,
               created_by_email text, created_by_me boolean)
language plpgsql stable security definer set search_path = public, app, pg_temp
as $$
begin
  if not app.is_platform_admin() then raise exception 'Not authorized' using errcode = 'insufficient_privilege'; end if;
  return query
  select n.id, n.content, n.category, n.created_at, n.updated_at, pa.email::text, n.created_by = (select auth.uid())
  from public.admin_gym_notes n
  left join public.platform_admins pa on pa.user_id = n.created_by
  where n.organization_id = p_organization_id and n.deleted_at is null
  order by n.created_at desc
  limit 100;
end;
$$;

create or replace function public.admin_gym_alerts(p_organization_id uuid, p_include_resolved boolean default false, p_limit integer default 50)
returns table (id uuid, severity text, type text, title text, message text, metadata jsonb, created_at timestamptz,
               status text, acknowledged_at timestamptz, acknowledged_by_email text, resolved_at timestamptz,
               resolved_by_email text, resolution_note text)
language plpgsql stable security definer set search_path = public, app, pg_temp
as $$
begin
  if not app.is_platform_admin() then raise exception 'Not authorized' using errcode = 'insufficient_privilege'; end if;
  return query
  select a.id, a.severity, a.type, coalesce(a.title, a.message), a.message, a.metadata, a.created_at,
         case when a.resolved_at is not null then 'resolved' when a.acknowledged_at is not null then 'acknowledged' else 'open' end,
         a.acknowledged_at, ack.email::text, a.resolved_at, res.email::text, a.resolution_note
  from public.system_alerts a
  left join public.platform_admins ack on ack.user_id = a.acknowledged_by
  left join public.platform_admins res on res.user_id = a.resolved_by
  where a.organization_id = p_organization_id and (p_include_resolved or a.resolved_at is null)
  order by (a.resolved_at is not null), case a.severity when 'critical' then 0 when 'warning' then 1 else 2 end, a.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
end;
$$;

create or replace function public.admin_refresh_gym_alerts(p_organization_id uuid)
returns void language plpgsql security definer set search_path = public, app, pg_temp as $$
begin
  if not app.is_platform_admin() then raise exception 'Not authorized' using errcode = 'insufficient_privilege'; end if;
  if not exists (select 1 from public.organizations where id = p_organization_id) then raise exception 'Gym not found' using errcode = 'no_data_found'; end if;
  perform app.sync_org_alerts(p_organization_id);
end; $$;

create or replace function public.admin_gym_access(p_organization_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public, app, pg_temp
as $$
declare
  o public.staff_memberships;
  u auth.users;
  v_method text;
  v_identity text;
  v_otp timestamptz;
  v_sessions jsonb := '[]'::jsonb;
  v_owner_sessions integer := 0;
  v_org_sessions integer;
  v_org_users integer;
begin
  if not app.is_platform_admin() then raise exception 'Not authorized' using errcode = 'insufficient_privilege'; end if;
  if not exists (select 1 from public.organizations where id = p_organization_id) then raise exception 'Gym not found' using errcode = 'no_data_found'; end if;

  select * into o from public.staff_memberships where organization_id = p_organization_id and role = 'owner'
    order by (access_status = 'active') desc, created_at limit 1;

  select count(*), count(distinct s.user_id) into v_org_sessions, v_org_users
  from auth.sessions s join public.staff_memberships sm on sm.user_id = s.user_id
  where sm.organization_id = p_organization_id and (s.not_after is null or s.not_after > now());

  if o.id is null then
    return jsonb_build_object('owner', null, 'org_sessions', v_org_sessions, 'org_session_users', v_org_users);
  end if;

  select * into u from auth.users where id = o.user_id;
  select provider into v_identity from auth.identities where user_id = o.user_id order by last_sign_in_at desc nulls last limit 1;
  select max(consumed_at) into v_otp from public.auth_otp_codes where user_id = o.user_id and consumed_at is not null;
  v_method := case
    when u.last_sign_in_at is null then null
    when v_otp is not null and v_otp between u.last_sign_in_at - interval '10 minutes' and u.last_sign_in_at + interval '1 minute' then 'WhatsApp OTP'
    when v_identity = 'email' then 'Email & password'
    when v_identity = 'phone' then 'Phone'
    else coalesce(v_identity, 'Unknown') end;

  select count(*), coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'started_at', x.created_at, 'last_seen_at', coalesce(x.refreshed_at::timestamptz, x.updated_at), 'device', left(x.user_agent, 120)) order by x.updated_at desc), '[]')
    into v_owner_sessions, v_sessions
  from (select s.* from auth.sessions s where s.user_id = o.user_id and (s.not_after is null or s.not_after > now()) order by s.updated_at desc limit 5) x;

  return jsonb_build_object(
    'owner', jsonb_build_object(
      'user_id', o.user_id, 'name', btrim(coalesce(o.first_name, '') || ' ' || coalesce(o.last_name, '')),
      'email', coalesce(u.email::text, o.email::text), 'phone', coalesce(u.phone, o.phone_e164),
      'email_verified', u.email_confirmed_at is not null, 'phone_verified', u.phone_confirmed_at is not null,
      'last_sign_in_at', u.last_sign_in_at, 'login_method', v_method,
      'access_status', o.access_status, 'banned', u.banned_until is not null and u.banned_until > now(),
      'last_active_at', (select last_active_at from public.owner_activity_state where organization_id = p_organization_id)),
    'owner_sessions', v_sessions,
    'owner_session_count', v_owner_sessions,
    'org_sessions', v_org_sessions,
    'org_session_users', v_org_users,
    'staff_total', (select count(*) from public.staff_memberships where organization_id = p_organization_id),
    'staff_disabled', (select count(*) from public.staff_memberships where organization_id = p_organization_id and access_status = 'disabled'));
end;
$$;

-- ---------------------------------------------------------------------------
-- command centre summary (the new signals; revenue/WhatsApp-month figures
-- continue to come from admin_gym_overview)
-- ---------------------------------------------------------------------------

create or replace function public.admin_gym_ops_summary(p_organization_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public, app, pg_temp
as $$
declare
  v_env text := app.current_environment();
  v_owner jsonb;
  v_wa jsonb;
  v_recon jsonb; v_health jsonb; v_jobs jsonb;
  v_backup timestamptz;
  v_sent bigint; v_delivered bigint; v_read bigint; v_failed bigint;
  v_last_ok timestamptz; v_last_msg timestamptz;
  v_failed_pay bigint;
begin
  if not app.is_platform_admin() then raise exception 'Not authorized' using errcode = 'insufficient_privilege'; end if;
  if not exists (select 1 from public.organizations where id = p_organization_id) then raise exception 'Gym not found' using errcode = 'no_data_found'; end if;

  select jsonb_build_object(
    'email_verified', u.email_confirmed_at is not null, 'phone_verified', u.phone_confirmed_at is not null,
    'last_sign_in_at', u.last_sign_in_at,
    'last_active_at', (select last_active_at from public.owner_activity_state where organization_id = p_organization_id))
    into v_owner
  from public.staff_memberships sm join auth.users u on u.id = sm.user_id
  where sm.organization_id = p_organization_id and sm.role = 'owner'
  order by (sm.access_status = 'active') desc, sm.created_at limit 1;

  select count(*) filter (where status in ('sent','delivered','read') and created_at > now() - interval '30 days'),
         count(*) filter (where status in ('delivered','read') and created_at > now() - interval '30 days'),
         count(*) filter (where status = 'read' and created_at > now() - interval '30 days'),
         count(*) filter (where status = 'failed' and created_at > now() - interval '30 days'),
         max(coalesce(sent_at, created_at)) filter (where status in ('sent','delivered','read')),
         max(created_at)
    into v_sent, v_delivered, v_read, v_failed, v_last_ok, v_last_msg
  from public.whatsapp_messages where organization_id = p_organization_id and direction = 'outbound';

  v_wa := jsonb_build_object(
    'balance', coalesce((select balance from public.whatsapp_credit_balances where organization_id = p_organization_id), 0),
    'sent_30d', v_sent, 'delivered_30d', v_delivered, 'read_30d', v_read, 'failed_30d', v_failed,
    'failure_rate', case when v_sent + v_failed > 0 then round(v_failed::numeric * 100 / (v_sent + v_failed), 1) end,
    'last_message_at', v_last_msg, 'last_success_at', v_last_ok,
    'paused', app.org_lock_active(p_organization_id, 'block_whatsapp'));

  select count(*) into v_failed_pay from public.platform_payments
    where organization_id = p_organization_id and status = 'failed' and created_at > now() - interval '30 days';
  v_recon := app.org_recon_findings(p_organization_id);
  v_health := app.org_data_health(p_organization_id);
  v_jobs := app.org_job_stats(p_organization_id);
  select max(completed_at) into v_backup from public.database_backups where environment = v_env and status = 'ready';

  return jsonb_build_object(
    'environment', v_env,
    'suspended_at', (select suspended_at from public.organizations where id = p_organization_id),
    'locks', (select coalesce(jsonb_agg(jsonb_build_object('lock_type', l.lock_type, 'reason', l.reason, 'expires_at', l.expires_at) order by l.lock_type), '[]')
              from public.organization_operation_locks l
              where l.organization_id = p_organization_id and l.is_enabled and (l.expires_at is null or l.expires_at > now())),
    'owner', v_owner,
    'whatsapp', v_wa,
    'payments', jsonb_build_object(
      'failed_30d', v_failed_pay,
      'reconciliation_issues', (select count(*) from jsonb_array_elements(v_recon) e where (e->>'count')::int > 0 and e->>'severity' in ('warning', 'critical')),
      'reconciliation_critical', (select count(*) from jsonb_array_elements(v_recon) e where (e->>'count')::int > 0 and e->>'severity' = 'critical')),
    'jobs', jsonb_build_object(
      'failed', (select count(*) from jsonb_array_elements(v_jobs) e where e->>'status' = 'failed'),
      'degraded', (select count(*) from jsonb_array_elements(v_jobs) e where e->>'status' = 'degraded'),
      'tracked', (select count(*) from jsonb_array_elements(v_jobs) e where e->>'status' not in ('not_tracked', 'disabled', 'not_configured'))),
    'webhooks', app.org_webhook_summary(p_organization_id),
    'backup', jsonb_build_object('last_success_at', v_backup, 'scope', 'platform'),
    'alerts', (select jsonb_build_object(
                 'open', count(*) filter (where resolved_at is null),
                 'unacknowledged', count(*) filter (where resolved_at is null and acknowledged_at is null),
                 'critical', count(*) filter (where resolved_at is null and severity = 'critical'))
               from public.system_alerts where organization_id = p_organization_id),
    'data_health', jsonb_build_object(
      'issues', (select count(*) from jsonb_array_elements(v_health) e where (e->>'count')::int > 0 and e->>'severity' in ('warning', 'critical')),
      'critical', (select count(*) from jsonb_array_elements(v_health) e where (e->>'count')::int > 0 and e->>'severity' = 'critical')));
end;
$$;

-- ---------------------------------------------------------------------------
-- unified support timeline
--
-- admin_audit_log already mirrors tenant writes on nine tables (database
-- triggers, old/new values, actor role). The remaining tenant tables only
-- appear in audit_log, so those rows are added separately and the mirrored
-- tables are excluded from that branch to avoid double entries. Trigger rows
-- written while a platform admin acted are dropped: the admin RPC's own
-- explicit audit row already describes that action.
-- ---------------------------------------------------------------------------

create or replace function app.timeline_category(p_action text, p_entity text)
returns text
language sql
immutable
as $$
  select case
    when p_action like 'whatsapp%' then 'whatsapp'
    when p_action like 'billing.%' then 'billing'
    when p_action like 'job.%' then 'jobs'
    when p_action like 'webhook.%' then 'webhooks'
    when p_action like 'alert.%' then 'system'
    when p_action like 'sessions.%' or p_action like 'operation_lock.%' or p_action like 'invitation.%' or p_action like 'admin.%' or p_entity = 'staff_memberships' then 'security'
    when p_action like 'subscription.%' or p_action like 'package.%' or p_action like 'plan.%' or p_action like 'plan_%' or p_action like 'billing_%' or p_entity = 'organization_subscriptions' then 'subscription'
    when p_action like 'payment.%' or p_entity = 'payments' then 'payments'
    when p_entity = 'members' then 'members'
    when p_entity in ('member_subscriptions', 'membership_plans', 'plan_groups') then 'memberships'
    when p_entity in ('organizations', 'gyms', 'branches') or p_action like 'organization.%' or p_action like 'gym.%' then 'gym'
    when p_entity in ('expenses', 'recurring_expenses') then 'expenses'
    when p_entity like 'inventory%' then 'inventory'
    when p_entity like 'lead%' then 'leads'
    else 'other' end
$$;

create or replace function public.admin_gym_timeline(
  p_organization_id uuid,
  p_search text default null,
  p_category text default null,
  p_actor_type text default null,
  p_status text default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_sort_dir text default 'desc',
  p_limit integer default 25,
  p_offset integer default 0
)
returns table (
  event_id text, source text, occurred_at timestamptz, action_key text, operation text,
  entity_type text, entity_id text, actor_id uuid, actor_label text, actor_role text, actor_type text,
  category text, status text, member_id uuid, member_name text, amount_minor bigint, currency text,
  old_values jsonb, new_values jsonb, changed_fields text[], detail jsonb,
  request_id text, ip_address text, origin text, total_count bigint
)
language plpgsql stable security definer set search_path = public, app, pg_temp
as $$
declare
  v_search text := nullif(btrim(p_search), '');
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 10000);
begin
  if not app.is_platform_admin() then raise exception 'Not authorized' using errcode = 'insufficient_privilege'; end if;
  if not exists (select 1 from public.organizations where organizations.id = p_organization_id) then raise exception 'Gym not found' using errcode = 'no_data_found'; end if;

  return query
  with staff as (
    select sm.user_id, btrim(coalesce(sm.first_name, '') || ' ' || coalesce(sm.last_name, '')) as nm, sm.email::text as em, sm.role
    from public.staff_memberships sm where sm.organization_id = p_organization_id
  ), base as (
    -- A. admin RPC actions + mirrored tenant writes
    select 'audit:' || a.id::text as eid, 'audit'::text as src, a.at as ts, a.action as akey,
      case when coalesce(a.metadata->>'source', '') = 'database_trigger' then a.detail->>'operation' end as op,
      a.entity_type as et, a.entity_id as eiid, a.admin_id as aid,
      case when coalesce(a.metadata->>'source', '') = 'database_trigger'
           then coalesce(nullif(s.nm, ''), s.em, 'System')
           else coalesce(pa.email::text, 'Platform admin') end as alabel,
      case when coalesce(a.metadata->>'source', '') = 'database_trigger' then coalesce(a.actor_role, 'system') else 'platform_admin' end as arole,
      case when coalesce(a.metadata->>'source', '') = 'database_trigger' then coalesce(a.actor_role, 'system') else 'platform_admin' end as atype,
      'success'::text as st, a.old_values as ov, a.new_values as nv, a.detail as dt,
      a.request_id as rid, host(a.ip_address) as ip,
      case when coalesce(a.metadata->>'source', '') = 'database_trigger' then 'Gym app' else 'Platform admin' end as org_src
    from public.admin_audit_log a
    left join staff s on s.user_id = a.admin_id
    left join public.platform_admins pa on pa.user_id = a.admin_id
    where a.target_organization_id = p_organization_id
      and (p_from is null or a.at >= p_from) and (p_to is null or a.at <= p_to)
      and not (coalesce(a.metadata->>'source', '') = 'database_trigger' and coalesce(a.actor_role, '') = 'platform_admin')
    union all
    -- B. tenant audit_log rows for tables the trigger mirror does not cover
    select 'tenant:' || t.id::text, 'tenant_audit', t.at, lower(t.table_name) || '.' || lower(t.action), t.action,
      t.table_name, t.record_id::text, t.actor_id,
      coalesce(nullif(s.nm, ''), s.em, 'System'), coalesce(t.actor_role, s.role, 'system'), coalesce(t.actor_role, s.role, 'system'),
      'success', t.before, t.after, null::jsonb, null::text, null::text, 'Gym app'
    from public.audit_log t
    left join staff s on s.user_id = t.actor_id
    where t.organization_id = p_organization_id
      and t.table_name not in ('organizations','gyms','branches','members','staff_memberships','member_subscriptions','payments','membership_plans','inventory_products')
      and (p_from is null or t.at >= p_from) and (p_to is null or t.at <= p_to)
    union all
    -- C. failed WhatsApp messages
    select 'wa:' || w.id::text, 'whatsapp', coalesce(w.failed_at, w.created_at), 'whatsapp.message_failed', null,
      'whatsapp_message', w.id::text, null::uuid, 'System', 'system', 'system', 'failed',
      null::jsonb, jsonb_build_object('status', w.status, 'member_id', w.member_id), jsonb_build_object('template', coalesce(w.template_name, w.template_key), 'error_code', w.error_code, 'error_message', w.error_message, 'attempts', w.attempts, 'origin', w.origin),
      null::text, null::text, 'Worker'
    from public.whatsapp_messages w
    where w.organization_id = p_organization_id and w.status = 'failed'
      and (p_from is null or coalesce(w.failed_at, w.created_at) >= p_from) and (p_to is null or coalesce(w.failed_at, w.created_at) <= p_to)
    union all
    -- D. webhook failures
    select 'webhook:' || e.id::text, 'webhook', e.received_at, 'webhook.failed', null,
      'webhook_event', e.id::text, null::uuid, 'Razorpay', 'system', 'system', 'failed',
      null::jsonb, jsonb_build_object('amount_minor', e.amount_minor), jsonb_build_object('event_type', e.event_type, 'error', e.processing_error, 'signature_verified', e.signature_verified, 'attempts', e.attempts),
      null::text, null::text, 'Webhook'
    from app.org_webhook_events(p_organization_id, now() - interval '365 days') e
    where (e.processing_error is not null or e.signature_verified is false)
      and (p_from is null or e.received_at >= p_from) and (p_to is null or e.received_at <= p_to)
    union all
    -- E. subscription payments made through the gateway
    select 'billing:' || pp.id::text, 'billing', coalesce(pp.paid_at, pp.created_at), 'billing.payment', null,
      'platform_payment', pp.id::text, pp.initiated_by, coalesce(nullif(s.nm, ''), s.em, 'Gym owner'), coalesce(s.role, 'owner'), coalesce(s.role, 'owner'),
      case pp.status when 'succeeded' then 'success' when 'failed' then 'failed' else 'warning' end,
      null::jsonb, jsonb_build_object('status', pp.status, 'amount_minor', pp.amount_minor, 'currency', pp.currency),
      jsonb_build_object('provider', pp.provider, 'invoice', pp.invoice_number, 'period_start', pp.period_start, 'period_end', pp.period_end),
      null::text, null::text, 'Razorpay'
    from public.platform_payments pp
    left join staff s on s.user_id = pp.initiated_by
    where pp.organization_id = p_organization_id and pp.provider <> 'manual'
      and (p_from is null or coalesce(pp.paid_at, pp.created_at) >= p_from) and (p_to is null or coalesce(pp.paid_at, pp.created_at) <= p_to)
    union all
    -- F. operational alerts
    select 'alert:' || sa.id::text, 'alert', sa.created_at, 'alert.raised', null,
      'system_alert', sa.id::text, null::uuid, 'System', 'system', 'system',
      case sa.severity when 'critical' then 'failed' when 'warning' then 'warning' else 'success' end,
      null::jsonb, null::jsonb, jsonb_build_object('title', coalesce(sa.title, sa.message), 'message', sa.message, 'severity', sa.severity),
      null::text, null::text, 'System'
    from public.system_alerts sa
    where sa.organization_id = p_organization_id
      and (p_from is null or sa.created_at >= p_from) and (p_to is null or sa.created_at <= p_to)
    union all
    -- G. failed broadcast runs
    select 'job:' || r.id::text, 'job', coalesce(r.completed_at, r.created_at), 'job.broadcast_failed', null,
      'bulk_communication_run', r.id::text, r.initiated_by, 'System', 'system', 'system', 'failed',
      null::jsonb, null::jsonb, jsonb_build_object('status', r.status, 'error_message', r.error_message, 'sent', r.sent_count, 'failed', r.failed_count, 'recipients', r.total_recipients),
      null::text, null::text, 'Worker'
    from public.bulk_communication_runs r
    where r.organization_id = p_organization_id and r.status in ('failed', 'partially_failed')
      and (p_from is null or coalesce(r.completed_at, r.created_at) >= p_from) and (p_to is null or coalesce(r.completed_at, r.created_at) <= p_to)
  ), enriched as (
    select b.*,
      app.timeline_category(b.akey, b.et) as cat,
      coalesce(
        case when b.et = 'members' then nullif(b.eiid, '') end,
        coalesce(b.nv, b.ov) ->> 'member_id') as mid_txt,
      case
        when b.akey like 'payment.%' or b.et = 'payments' or b.et = 'member_subscriptions' or b.akey = 'billing.payment'
        then case
          when coalesce(b.nv, b.ov) ->> 'amount_minor' ~ '^-?\d+$' then (coalesce(b.nv, b.ov) ->> 'amount_minor')::bigint
          when coalesce(b.nv, b.ov) ->> 'agreed_price_minor' ~ '^-?\d+$' then (coalesce(b.nv, b.ov) ->> 'agreed_price_minor')::bigint end
      end as amt,
      coalesce(b.nv, b.ov) ->> 'currency' as cur,
      case
        when b.ov is not null and b.nv is not null then
          (select array_agg(k order by k) from jsonb_object_keys(b.nv) k
            where k not in ('updated_at', 'created_at', 'edited_at') and (b.nv -> k) is distinct from (b.ov -> k))
      end as chg
    from base b
  ), named as (
    select e.*, m.id as mid, nullif(btrim(m.first_name || ' ' || coalesce(m.last_name, '')), '') as mname
    from enriched e
    left join public.members m
      on e.mid_txt ~ '^[0-9a-fA-F-]{36}$' and m.id = (case when e.mid_txt ~ '^[0-9a-fA-F-]{36}$' then e.mid_txt::uuid end) and m.organization_id = p_organization_id
  ), filtered as (
    select n.* from named n
    where (p_category is null or p_category = '' or (p_category = 'admin' and n.atype = 'platform_admin') or n.cat = p_category)
      and (p_actor_type is null or p_actor_type = '' or n.atype = p_actor_type)
      and (p_status is null or p_status = '' or n.st = p_status)
      and (v_search is null
           or n.akey ilike '%' || v_search || '%' or coalesce(n.et, '') ilike '%' || v_search || '%'
           or n.alabel ilike '%' || v_search || '%' or coalesce(n.mname, '') ilike '%' || v_search || '%'
           or coalesce(n.eiid, '') ilike '%' || v_search || '%' or coalesce(n.dt ->> 'reason', '') ilike '%' || v_search || '%')
  )
  select f.eid, f.src, f.ts, f.akey, f.op, f.et, f.eiid, f.aid, f.alabel, f.arole, f.atype, f.cat, f.st,
         f.mid, f.mname, f.amt, f.cur, f.ov, f.nv, f.chg, f.dt, f.rid, f.ip, f.org_src,
         count(*) over()
  from filtered f
  order by case when p_sort_dir = 'asc' then f.ts end asc, case when coalesce(p_sort_dir, 'desc') <> 'asc' then f.ts end desc
  limit v_limit
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- ---------------------------------------------------------------------------
-- exports (synchronous, capped — there is no background job runner yet)
-- ---------------------------------------------------------------------------

create or replace function public.admin_export_gym_dataset(p_organization_id uuid, p_dataset text, p_reason text)
returns jsonb
language plpgsql security definer set search_path = public, app, pg_temp
as $$
declare
  v_reason text;
  v_cap constant integer := 20000;
  v_count bigint;
  v_cols jsonb;
  v_rows jsonb;
begin
  if not app.is_platform_admin() then raise exception 'Not authorized' using errcode = 'insufficient_privilege'; end if;
  v_reason := app.require_reason(p_reason);
  if not exists (select 1 from public.organizations where id = p_organization_id) then raise exception 'Gym not found' using errcode = 'no_data_found'; end if;

  if p_dataset = 'members' then
    select count(*) into v_count from public.members where organization_id = p_organization_id and deleted_at is null;
    if v_count > v_cap then raise exception 'This dataset has % rows; synchronous exports are capped at %. A background export is not available yet.', v_count, v_cap using errcode = '54000'; end if;
    v_cols := '["Member code","First name","Last name","Phone","Email","Status","Gender","Joined on","Branch","Created at"]';
    select coalesce(jsonb_agg(jsonb_build_array(m.member_code, m.first_name, m.last_name, m.phone_e164, m.email::text, m.status, m.gender, m.joined_on, b.name, m.created_at) order by m.created_at), '[]')
      into v_rows from public.members m left join public.branches b on b.id = m.branch_id
      where m.organization_id = p_organization_id and m.deleted_at is null;
  elsif p_dataset = 'memberships' then
    select count(*) into v_count from public.member_subscriptions where organization_id = p_organization_id and deleted_at is null;
    if v_count > v_cap then raise exception 'This dataset has % rows; synchronous exports are capped at %. A background export is not available yet.', v_count, v_cap using errcode = '54000'; end if;
    v_cols := '["Member code","Member","Plan","Start date","End date","Status","Agreed price","List price","Currency"]';
    select coalesce(jsonb_agg(jsonb_build_array(m.member_code, btrim(m.first_name || ' ' || coalesce(m.last_name, '')), s.plan_name_snapshot, s.start_date, s.end_date, s.status,
             s.agreed_price_minor / 100.0, s.list_price_minor / 100.0, s.currency) order by s.created_at), '[]')
      into v_rows from public.member_subscriptions s join public.members m on m.id = s.member_id
      where s.organization_id = p_organization_id and s.deleted_at is null;
  elsif p_dataset = 'payments' then
    select count(*) into v_count from public.payments where organization_id = p_organization_id;
    if v_count > v_cap then raise exception 'This dataset has % rows; synchronous exports are capped at %. A background export is not available yet.', v_count, v_cap using errcode = '54000'; end if;
    v_cols := '["Invoice","Member code","Member","Amount","GST","Currency","Method","Status","Paid at","Reference","Created at"]';
    select coalesce(jsonb_agg(jsonb_build_array(p.invoice_number, m.member_code, btrim(coalesce(m.first_name, '') || ' ' || coalesce(m.last_name, '')),
             p.amount_minor / 100.0, coalesce(p.gst_amount_minor, 0) / 100.0, p.currency, p.method, p.status, p.paid_at, p.reference, p.created_at) order by p.created_at), '[]')
      into v_rows from public.payments p left join public.members m on m.id = p.member_id
      where p.organization_id = p_organization_id;
  elsif p_dataset = 'expenses' then
    select count(*) into v_count from public.expenses where organization_id = p_organization_id;
    if v_count > v_cap then raise exception 'This dataset has % rows; synchronous exports are capped at %. A background export is not available yet.', v_count, v_cap using errcode = '54000'; end if;
    v_cols := '["Date","Category","Vendor","Amount","GST","Total","Currency","Method","Description"]';
    select coalesce(jsonb_agg(jsonb_build_array(e.expense_date, e.category, e.vendor, e.amount_minor / 100.0, e.gst_amount_minor / 100.0, e.total_amount_minor / 100.0, e.currency, e.payment_method, e.description) order by e.expense_date), '[]')
      into v_rows from public.expenses e where e.organization_id = p_organization_id;
  elsif p_dataset = 'inventory' then
    select count(*) into v_count from public.inventory_products where organization_id = p_organization_id and deleted_at is null;
    if v_count > v_cap then raise exception 'This dataset has % rows; synchronous exports are capped at %. A background export is not available yet.', v_count, v_cap using errcode = '54000'; end if;
    v_cols := '["Product code","Name","Category","SKU","Stock","Purchase price","Selling price","Currency","Status"]';
    select coalesce(jsonb_agg(jsonb_build_array(i.product_code, i.name, i.category, i.sku, i.current_stock, i.purchase_price_minor / 100.0, i.selling_price_minor / 100.0, i.currency, i.status) order by i.name), '[]')
      into v_rows from public.inventory_products i where i.organization_id = p_organization_id and i.deleted_at is null;
  elsif p_dataset = 'whatsapp' then
    select count(*) into v_count from public.whatsapp_messages where organization_id = p_organization_id and direction = 'outbound';
    if v_count > v_cap then raise exception 'This dataset has % rows; synchronous exports are capped at %. A background export is not available yet.', v_count, v_cap using errcode = '54000'; end if;
    v_cols := '["Created at","Recipient","Phone","Template","Category","Status","Error code","Error message","Credits","Sent at","Delivered at","Read at"]';
    select coalesce(jsonb_agg(jsonb_build_array(w.created_at, btrim(coalesce(m.first_name, '') || ' ' || coalesce(m.last_name, '')), w.phone_number_e164,
             coalesce(w.template_name, w.template_key), w.category, w.status, w.error_code, w.error_message, w.credits_used, w.sent_at, w.delivered_at, w.read_at) order by w.created_at), '[]')
      into v_rows from public.whatsapp_messages w left join public.members m on m.id = w.member_id
      where w.organization_id = p_organization_id and w.direction = 'outbound';
  else
    raise exception 'Unknown dataset' using errcode = '22023';
  end if;

  perform app.log_admin_action('data_export.requested', p_organization_id, 'organization', p_organization_id::text, null,
    jsonb_build_object('dataset', p_dataset, 'rows', v_count), v_reason, jsonb_build_object('dataset', p_dataset, 'rows', v_count));
  return jsonb_build_object('columns', v_cols, 'rows', v_rows);
end;
$$;

create or replace function public.admin_log_activity_export(p_organization_id uuid, p_filters jsonb, p_rows integer)
returns void
language plpgsql security definer set search_path = public, app, pg_temp
as $$
begin
  if not app.is_platform_admin() then raise exception 'Not authorized' using errcode = 'insufficient_privilege'; end if;
  if not exists (select 1 from public.organizations where id = p_organization_id) then raise exception 'Gym not found' using errcode = 'no_data_found'; end if;
  perform app.log_admin_action('data_export.requested', p_organization_id, 'organization', p_organization_id::text, null,
    jsonb_build_object('dataset', 'activity', 'rows', p_rows, 'filters', coalesce(p_filters, '{}'::jsonb)),
    'Activity export', jsonb_build_object('dataset', 'activity', 'rows', p_rows));
end;
$$;

-- ---------------------------------------------------------------------------
-- grants
-- ---------------------------------------------------------------------------

do $$
declare f text;
begin
  foreach f in array array[
    'public.admin_gym_reconciliation(uuid)', 'public.admin_gym_data_health(uuid)', 'public.admin_gym_jobs(uuid)',
    'public.admin_gym_webhooks(uuid)', 'public.admin_gym_whatsapp_ops(uuid)', 'public.admin_gym_credit_history(uuid, integer, integer)',
    'public.admin_gym_locks(uuid)', 'public.admin_gym_feature_flags(uuid)', 'public.admin_gym_notes_list(uuid)',
    'public.admin_gym_alerts(uuid, boolean, integer)', 'public.admin_refresh_gym_alerts(uuid)', 'public.admin_gym_access(uuid)',
    'public.admin_gym_ops_summary(uuid)',
    'public.admin_gym_timeline(uuid, text, text, text, text, timestamptz, timestamptz, text, integer, integer)',
    'public.admin_export_gym_dataset(uuid, text, text)', 'public.admin_log_activity_export(uuid, jsonb, integer)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
revoke execute on function app.timeline_category(text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- alert sync schedule: every 15 minutes (idempotent re-schedule, like 1016)
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'sync-gym-operational-alerts';
    perform cron.schedule('sync-gym-operational-alerts', '*/15 * * * *', 'select app.sync_all_org_alerts();');
  end if;
end $$;

-- First population so the Alerts panel is not empty until the first cron tick.
select app.sync_all_org_alerts();
