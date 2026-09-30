-- Platform-admin member support/debugging reads.
--
-- All operational source data already exists in the tenant schema. This
-- migration adds no duplicate member, membership, payment, or WhatsApp
-- fields and changes no tenant RLS policy. It exposes three deliberately
-- curated, read-only RPCs guarded by app.is_platform_admin():
--   * admin_gym_members_support  - one paginated table query (no N+1 reads)
--   * admin_gym_members_summary  - compact roster/attention aggregates
--   * admin_gym_member_detail    - one lazy detail payload when a drawer opens
--
-- The public schema is required because PostgREST only exposes public in this
-- project. EXECUTE is revoked from PUBLIC/anon; authenticated callers still
-- have to pass the platform-admin predicate inside each SECURITY DEFINER
-- function. No write RPC is introduced.

create index if not exists payments_member_paid_idx
  on public.payments (organization_id, member_id, paid_at desc);

create index if not exists whatsapp_messages_member_created_idx
  on public.whatsapp_messages (organization_id, member_id, created_at desc)
  where member_id is not null;

create or replace function public.admin_gym_members_support(
  p_organization_id uuid,
  p_search text default null,
  p_member_status text default null,
  p_branch_id uuid default null,
  p_state text default null,
  p_deleted boolean default false,
  p_sort_col text default 'created_at',
  p_sort_dir text default 'desc',
  p_limit integer default 25,
  p_offset integer default 0
)
returns table (
  id uuid,
  first_name text,
  last_name text,
  email text,
  phone_e164 text,
  branch_id uuid,
  branch_name text,
  member_status text,
  joined_on date,
  created_at timestamptz,
  updated_at timestamptz,
  deleted_at timestamptz,
  plan_name text,
  subscription_id uuid,
  subscription_start_date date,
  subscription_end_date date,
  membership_state text,
  last_payment_amount_minor bigint,
  last_payment_currency text,
  last_payment_method text,
  last_payment_status text,
  last_payment_at timestamptz,
  payment_pending boolean,
  invalid_phone boolean,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_sort_col text;
  v_sort_dir text;
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_timezone text;
  v_today date;
  v_sql text;
begin
  if not app.is_platform_admin() then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;

  select coalesce(nullif(o.default_timezone, ''), 'Asia/Kolkata')
    into v_timezone
  from public.organizations o
  where o.id = p_organization_id;

  if v_timezone is null then
    raise exception 'Gym not found' using errcode = 'no_data_found';
  end if;

  v_today := timezone(v_timezone, now())::date;
  v_sort_col := case p_sort_col
    when 'name' then 'first_name'
    when 'branch_name' then 'branch_name'
    when 'plan_name' then 'plan_name'
    when 'membership_state' then 'membership_state'
    when 'subscription_end_date' then 'subscription_end_date'
    when 'last_payment_at' then 'last_payment_at'
    when 'joined_on' then 'joined_on'
    when 'created_at' then 'created_at'
    else 'created_at'
  end;
  v_sort_dir := case lower(coalesce(p_sort_dir, 'desc')) when 'asc' then 'asc' else 'desc' end;

  v_sql := format($query$
    with base as (
      select
        m.id,
        m.first_name,
        m.last_name,
        m.email::text,
        m.phone_e164,
        m.branch_id,
        br.name as branch_name,
        m.status as member_status,
        m.joined_on,
        m.created_at,
        m.updated_at,
        m.deleted_at,
        ms.plan_name_snapshot as plan_name,
        ms.id as subscription_id,
        ms.start_date as subscription_start_date,
        ms.end_date as subscription_end_date,
        case
          when ms.id is null then 'none'
          when ms.status = 'cancelled' then 'cancelled'
          when ms.status = 'frozen' and ms.start_date <= $9 and ms.end_date >= $9 then 'frozen'
          when ms.start_date > $9 and ms.status in ('active', 'frozen') then 'upcoming'
          when ms.end_date < $9 or ms.status = 'expired' then 'expired'
          when ms.end_date <= $9 + 7 then 'expiring_soon'
          else 'active'
        end as membership_state,
        lp.amount_minor as last_payment_amount_minor,
        lp.currency::text as last_payment_currency,
        lp.method as last_payment_method,
        lp.status as last_payment_status,
        coalesce(lp.paid_at, lp.created_at) as last_payment_at,
        exists (
          select 1
          from public.payments pp
          where pp.organization_id = m.organization_id
            and pp.member_id = m.id
            and pp.status = 'pending_confirmation'
        ) as payment_pending,
        (m.phone_e164 is null or m.phone_e164 !~ '^\+[1-9][0-9]{7,14}$') as invalid_phone
      from public.members m
      join public.branches br
        on br.id = m.branch_id and br.organization_id = m.organization_id
      left join lateral (
        select s.id, s.plan_name_snapshot, s.start_date, s.end_date, s.status
        from public.member_subscriptions s
        where s.organization_id = m.organization_id
          and s.member_id = m.id
          and s.deleted_at is null
        order by
          case
            when s.status in ('active', 'frozen') and s.start_date <= $9 and s.end_date >= $9 then 0
            when s.status in ('active', 'frozen') and s.start_date > $9 then 1
            else 2
          end,
          s.end_date desc,
          s.created_at desc
        limit 1
      ) ms on true
      left join lateral (
        select p.amount_minor, p.currency, p.method, p.status, p.paid_at, p.created_at
        from public.payments p
        where p.organization_id = m.organization_id and p.member_id = m.id
        order by coalesce(p.paid_at, p.created_at) desc, p.id
        limit 1
      ) lp on true
      where m.organization_id = $1
        and (($6 and m.deleted_at is not null) or (not $6 and m.deleted_at is null))
    )
    select *, count(*) over() as total_count
    from base
    where
      ($2 is null or $2 = '' or first_name ilike '%%' || $2 || '%%'
        or coalesce(last_name, '') ilike '%%' || $2 || '%%'
        or coalesce(email, '') ilike '%%' || $2 || '%%'
        or coalesce(phone_e164, '') ilike '%%' || $2 || '%%')
      and ($3 is null or member_status = $3)
      and ($4 is null or branch_id = $4)
      and (
        $5 is null
        or ($5 = 'payment_pending' and payment_pending)
        or ($5 = 'invalid_phone' and invalid_phone)
        or membership_state = $5
      )
    order by %I %s nulls last, id
    limit $7 offset $8
  $query$, v_sort_col, v_sort_dir);

  return query execute v_sql using
    p_organization_id,
    p_search,
    p_member_status,
    p_branch_id,
    p_state,
    p_deleted,
    v_limit,
    v_offset,
    v_today;
end;
$$;

revoke execute on function public.admin_gym_members_support(uuid, text, text, uuid, text, boolean, text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.admin_gym_members_support(uuid, text, text, uuid, text, boolean, text, text, integer, integer)
  to authenticated;

create or replace function public.admin_gym_members_summary(
  p_organization_id uuid,
  p_branch_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_timezone text;
  v_today date;
  v_today_start timestamptz;
  v_month_start timestamptz;
  v_result jsonb;
begin
  if not app.is_platform_admin() then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;

  select coalesce(nullif(o.default_timezone, ''), 'Asia/Kolkata')
    into v_timezone
  from public.organizations o
  where o.id = p_organization_id;

  if v_timezone is null then
    raise exception 'Gym not found' using errcode = 'no_data_found';
  end if;

  v_today := timezone(v_timezone, now())::date;
  v_today_start := timezone(v_timezone, date_trunc('day', timezone(v_timezone, now())));
  v_month_start := timezone(v_timezone, date_trunc('month', timezone(v_timezone, now())));

  with roster as (
    select
      m.id,
      m.created_at,
      m.phone_e164,
      case
        when ms.id is null then 'none'
        when ms.status = 'cancelled' then 'cancelled'
        when ms.status = 'frozen' and ms.start_date <= v_today and ms.end_date >= v_today then 'frozen'
        when ms.start_date > v_today and ms.status in ('active', 'frozen') then 'upcoming'
        when ms.end_date < v_today or ms.status = 'expired' then 'expired'
        when ms.end_date <= v_today + 7 then 'expiring_soon'
        else 'active'
      end as membership_state
    from public.members m
    left join lateral (
      select s.id, s.start_date, s.end_date, s.status
      from public.member_subscriptions s
      where s.organization_id = m.organization_id
        and s.member_id = m.id
        and s.deleted_at is null
      order by
        case
          when s.status in ('active', 'frozen') and s.start_date <= v_today and s.end_date >= v_today then 0
          when s.status in ('active', 'frozen') and s.start_date > v_today then 1
          else 2
        end,
        s.end_date desc,
        s.created_at desc
      limit 1
    ) ms on true
    where m.organization_id = p_organization_id
      and m.deleted_at is null
      and (p_branch_id is null or m.branch_id = p_branch_id)
  ),
  member_metrics as (
    select
      count(*)::bigint as total_members,
      count(*) filter (where membership_state in ('active', 'expiring_soon', 'frozen'))::bigint as active_memberships,
      count(*) filter (where membership_state = 'expiring_soon')::bigint as expiring_soon,
      count(*) filter (where membership_state = 'expired')::bigint as expired_memberships,
      count(*) filter (where membership_state = 'upcoming')::bigint as upcoming_memberships,
      count(*) filter (where membership_state = 'none')::bigint as no_active_plan,
      count(*) filter (where created_at >= v_month_start)::bigint as new_members_month,
      count(*) filter (where phone_e164 is null or phone_e164 !~ '^\+[1-9][0-9]{7,14}$')::bigint as invalid_phone
    from roster
  ),
  pending_payments as (
    select
      count(*)::bigint as pending_count,
      coalesce(sum(p.amount_minor), 0)::bigint as pending_amount_minor,
      coalesce((array_agg(p.currency::text order by p.created_at desc))[1], 'INR') as currency
    from public.payments p
    join roster r on r.id = p.member_id
    where p.organization_id = p_organization_id and p.status = 'pending_confirmation'
  ),
  failed_whatsapp as (
    select count(*)::bigint as failed_today
    from public.whatsapp_messages w
    join roster r on r.id = w.member_id
    where w.organization_id = p_organization_id
      and w.status = 'failed'
      and coalesce(w.failed_at, w.created_at) >= v_today_start
  ),
  deleted_members as (
    select count(*)::bigint as deleted_count
    from public.members m
    where m.organization_id = p_organization_id
      and m.deleted_at is not null
      and (p_branch_id is null or m.branch_id = p_branch_id)
  )
  select jsonb_build_object(
    'timezone', v_timezone,
    'total_members', mm.total_members,
    'active_memberships', mm.active_memberships,
    'expiring_soon', mm.expiring_soon,
    'expired_memberships', mm.expired_memberships,
    'upcoming_memberships', mm.upcoming_memberships,
    'new_members_month', mm.new_members_month,
    'no_active_plan', mm.no_active_plan,
    'invalid_phone', mm.invalid_phone,
    'pending_payment_count', pp.pending_count,
    'pending_payment_amount_minor', pp.pending_amount_minor,
    'currency', pp.currency,
    'failed_whatsapp_today', fw.failed_today,
    'deleted_members', dm.deleted_count
  ) into v_result
  from member_metrics mm
  cross join pending_payments pp
  cross join failed_whatsapp fw
  cross join deleted_members dm;

  return v_result;
end;
$$;

revoke execute on function public.admin_gym_members_summary(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.admin_gym_members_summary(uuid, uuid)
  to authenticated;

create or replace function public.admin_gym_member_detail(
  p_organization_id uuid,
  p_member_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_timezone text;
  v_today date;
  v_result jsonb;
begin
  if not app.is_platform_admin() then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;

  select coalesce(nullif(o.default_timezone, ''), 'Asia/Kolkata')
    into v_timezone
  from public.organizations o
  where o.id = p_organization_id;

  if v_timezone is null then
    raise exception 'Gym not found' using errcode = 'no_data_found';
  end if;

  if not exists (
    select 1 from public.members m
    where m.id = p_member_id and m.organization_id = p_organization_id
  ) then
    raise exception 'Member not found' using errcode = 'no_data_found';
  end if;

  v_today := timezone(v_timezone, now())::date;

  with member_row as (
    select
      m.*,
      br.name as branch_name,
      br.gym_id,
      br.timezone as branch_timezone
    from public.members m
    join public.branches br
      on br.id = m.branch_id and br.organization_id = m.organization_id
    where m.id = p_member_id and m.organization_id = p_organization_id
  ),
  memberships as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', s.id,
      'branch_id', s.branch_id,
      'plan_id', s.plan_id,
      'plan_name', s.plan_name_snapshot,
      'start_date', s.start_date,
      'end_date', s.end_date,
      'state', case
        when s.deleted_at is not null then 'deleted'
        when s.status = 'cancelled' then 'cancelled'
        when s.status = 'frozen' and s.start_date <= v_today and s.end_date >= v_today then 'frozen'
        when s.start_date > v_today and s.status in ('active', 'frozen') then 'upcoming'
        when s.end_date < v_today or s.status = 'expired' then 'expired'
        when s.end_date <= v_today + 7 then 'expiring_soon'
        else 'active'
      end,
      'status', s.status,
      'agreed_price_minor', s.agreed_price_minor,
      'currency', s.currency::text,
      'created_at', s.created_at,
      'updated_at', s.updated_at,
      'deleted_at', s.deleted_at
    ) order by s.start_date desc, s.created_at desc), '[]'::jsonb) as rows
    from (
      select *
      from public.member_subscriptions x
      where x.organization_id = p_organization_id and x.member_id = p_member_id
      order by x.start_date desc, x.created_at desc
      limit 100
    ) s
  ),
  payments as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id,
      'subscription_id', p.subscription_id,
      'amount_minor', p.amount_minor,
      'currency', p.currency::text,
      'method', p.method,
      'status', p.status,
      'reference', p.reference,
      'paid_at', p.paid_at,
      'created_at', p.created_at,
      'invoice_number', p.invoice_number,
      'plan_name', coalesce(s.plan_name_snapshot, p.renewal_plan_name),
      'recorded_by', p.recorded_by,
      'recorded_by_name', nullif(trim(concat_ws(' ', recorder.first_name, recorder.last_name)), ''),
      'confirmed_by_name', nullif(trim(concat_ws(' ', confirmer.first_name, confirmer.last_name)), ''),
      'confirmed_at', p.confirmed_at,
      'refunded_by_name', nullif(trim(concat_ws(' ', refunder.first_name, refunder.last_name)), ''),
      'refunded_at', p.refunded_at,
      'rejected_by_name', nullif(trim(concat_ws(' ', rejecter.first_name, rejecter.last_name)), ''),
      'rejected_at', p.rejected_at,
      'receipt_status', receipt.status,
      'receipt_created_at', receipt.created_at,
      'receipt_sent_at', receipt.sent_at,
      'receipt_delivered_at', receipt.delivered_at,
      'receipt_failed_at', receipt.failed_at
    ) order by coalesce(p.paid_at, p.created_at) desc), '[]'::jsonb) as rows
    from (
      select *
      from public.payments x
      where x.organization_id = p_organization_id and x.member_id = p_member_id
      order by coalesce(x.paid_at, x.created_at) desc
      limit 100
    ) p
    left join public.member_subscriptions s
      on s.id = p.subscription_id and s.organization_id = p.organization_id
    left join lateral (
      select sm.first_name, sm.last_name
      from public.staff_memberships sm
      where sm.organization_id = p.organization_id and sm.user_id = p.recorded_by
      limit 1
    ) recorder on true
    left join lateral (
      select sm.first_name, sm.last_name
      from public.staff_memberships sm
      where sm.organization_id = p.organization_id and sm.user_id = p.confirmed_by
      limit 1
    ) confirmer on true
    left join lateral (
      select sm.first_name, sm.last_name
      from public.staff_memberships sm
      where sm.organization_id = p.organization_id and sm.user_id = p.refunded_by
      limit 1
    ) refunder on true
    left join lateral (
      select sm.first_name, sm.last_name
      from public.staff_memberships sm
      where sm.organization_id = p.organization_id and sm.user_id = p.rejected_by
      limit 1
    ) rejecter on true
    left join lateral (
      select w.status, w.created_at, w.sent_at, w.delivered_at, w.failed_at
      from public.whatsapp_messages w
      where w.organization_id = p.organization_id
        and w.payment_id = p.id
        and w.origin = 'auto_receipt'
      order by w.created_at desc
      limit 1
    ) receipt on true
  ),
  messages as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', w.id,
      'payment_id', w.payment_id,
      'subscription_id', w.subscription_id,
      'template', coalesce(w.template_key, w.template_name, initcap(w.message_type)),
      'message_type', w.message_type,
      'origin', w.origin,
      'category', w.category,
      'status', w.status,
      'sender_mode', w.sender_mode,
      'created_at', w.created_at,
      'sent_at', w.sent_at,
      'delivered_at', w.delivered_at,
      'read_at', w.read_at,
      'failed_at', w.failed_at,
      'error_code', w.error_code
    ) order by w.created_at desc), '[]'::jsonb) as rows
    from (
      select *
      from public.whatsapp_messages x
      where x.organization_id = p_organization_id
        and x.member_id = p_member_id
        and x.direction = 'outbound'
      order by x.created_at desc
      limit 100
    ) w
  ),
  whatsapp_summary as (
    select jsonb_build_object(
      'sent', count(*) filter (where w.status in ('sent', 'delivered', 'read')),
      'delivered', count(*) filter (where w.status in ('delivered', 'read')),
      'failed', count(*) filter (where w.status = 'failed'),
      'last_message_at', max(coalesce(w.sent_at, w.created_at)),
      'last_template', (array_agg(coalesce(w.template_key, w.template_name, initcap(w.message_type)) order by w.created_at desc))[1],
      'last_status', (array_agg(w.status order by w.created_at desc))[1]
    ) as row
    from public.whatsapp_messages w
    where w.organization_id = p_organization_id
      and w.member_id = p_member_id
      and w.direction = 'outbound'
  ),
  audit_events as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', a.id,
      'record_id', a.record_id,
      'table_name', a.table_name,
      'action', a.action,
      'changed_fields', a.changed_fields,
      'at', a.at,
      'actor_name', nullif(trim(concat_ws(' ', actor.first_name, actor.last_name)), '')
    ) order by a.at desc), '[]'::jsonb) as rows
    from (
      select al.*
      from public.audit_log al
      where al.organization_id = p_organization_id
        and (
          (al.table_name = 'member_subscriptions' and al.record_id in (
            select s.id from public.member_subscriptions s
            where s.organization_id = p_organization_id and s.member_id = p_member_id
          ))
          or (al.table_name = 'payments' and al.record_id in (
            select p.id from public.payments p
            where p.organization_id = p_organization_id and p.member_id = p_member_id
          ))
        )
      order by al.at desc
      limit 200
    ) a
    left join lateral (
      select sm.first_name, sm.last_name
      from public.staff_memberships sm
      where sm.organization_id = p_organization_id and sm.user_id = a.actor_id
      limit 1
    ) actor on true
  )
  select jsonb_build_object(
    'timezone', v_timezone,
    'member', jsonb_build_object(
      'id', m.id,
      'organization_id', m.organization_id,
      'gym_id', m.gym_id,
      'branch_id', m.branch_id,
      'branch_name', m.branch_name,
      'branch_timezone', m.branch_timezone,
      'first_name', m.first_name,
      'last_name', m.last_name,
      'email', m.email::text,
      'phone', m.phone_e164,
      'status', m.status,
      'joined_on', m.joined_on,
      'created_at', m.created_at,
      'updated_at', m.updated_at,
      'deleted_at', m.deleted_at
    ),
    'memberships', ms.rows,
    'payments', p.rows,
    'whatsapp', jsonb_build_object(
      'summary', ws.row,
      'messages', wm.rows
    ),
    'audit', ae.rows
  ) into v_result
  from member_row m
  cross join memberships ms
  cross join payments p
  cross join messages wm
  cross join whatsapp_summary ws
  cross join audit_events ae;

  return v_result;
end;
$$;

revoke execute on function public.admin_gym_member_detail(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.admin_gym_member_detail(uuid, uuid)
  to authenticated;
