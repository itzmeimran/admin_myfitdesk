-- 1029: Read-only activity API. Requires gym operations, platform settings,
-- and the tenant audit actor-role migration. No writers, triggers, RLS policies,
-- tables or historical records change. The legacy timeline RPC remains intact.
-- Deploy with the app after review; do not apply automatically to production.
-- Member histories group by their recorded UUID at the user's request. This
-- identifies one member's activities, not one confirmed workflow. Grouping and
-- pagination happen in the database; expanded histories are separately paged.

-- Redact at the read boundary before PostgREST sends any JSON. Keep the stored
-- snapshots untouched; changed_fields is calculated from their original values.
create or replace function app.activity_safe_value(p_value jsonb, p_key text default '')
returns jsonb language plpgsql immutable set search_path = pg_catalog
as $$
declare v_result jsonb; v_text text;
begin
  if p_key ~* 'password|passwd|token|secret|credential|authorization|cookie|private.?key|api.?key|otp|signature|signed.?url|provider_metadata|headers' then
    return to_jsonb('[Redacted]'::text);
  end if;
  if p_key ~* '^(avatar(_path|_url|_key)?|profile_photo(_path|_url)?|photo_url)$' then
    return case when p_value is null or p_value = 'null'::jsonb or p_value = '""'::jsonb then 'null'::jsonb else to_jsonb('Photo set'::text) end;
  end if;
  case jsonb_typeof(p_value)
    when 'object' then
      select coalesce(jsonb_object_agg(k, app.activity_safe_value(v, k)), '{}'::jsonb) into v_result from jsonb_each(p_value) e(k,v);
      return v_result;
    when 'array' then
      select coalesce(jsonb_agg(app.activity_safe_value(v) order by ord), '[]'::jsonb) into v_result from jsonb_array_elements(p_value) with ordinality e(v,ord);
      return v_result;
    when 'string' then
      v_text := p_value #>> '{}';
      v_text := regexp_replace(v_text, '(https?://|data:)[^[:space:]<>"'']+', '[URL hidden]', 'gi');
      v_text := regexp_replace(v_text, 'eyJ[[:alnum:]_-]+\.[[:alnum:]_-]+\.[[:alnum:]_-]+', '[Redacted]', 'g');
      v_text := regexp_replace(v_text, 'Bearer[[:space:]]+[^[:space:],;]+', 'Bearer [Redacted]', 'gi');
      v_text := regexp_replace(v_text, '(password|token|secret|api[_-]?key|authorization|otp)[[:space:]]*[:=][[:space:]]*[^[:space:],;]+', '\1=[Redacted]', 'gi');
      return to_jsonb(v_text);
    else return p_value;
  end case;
end;
$$;
revoke execute on function app.activity_safe_value(jsonb,text) from public, anon, authenticated;

create or replace function public.admin_gym_activity(
  p_organization_id uuid,
  p_search text default null,
  p_category text default null,
  p_actor_type text default null,
  p_status text default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_sort_dir text default 'desc',
  p_limit integer default 25,
  p_offset integer default 0,
  p_actor_search text default null,
  p_member_id uuid default null,
  p_group_by_member boolean default false
)
returns jsonb
language plpgsql stable security definer set search_path = public, app, pg_temp
as $$
declare
  v_search text := nullif(btrim(p_search), '');
  v_actor_search text := nullif(btrim(p_actor_search), '');
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 10000);
  v_result jsonb;
begin
  if not app.is_platform_admin() or not app.has_platform_permission('gyms.view') then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.organizations where id = p_organization_id) then
    raise exception 'Gym not found' using errcode = 'no_data_found';
  end if;

  with staff as (
    -- One actor row per user; multiple branch memberships must not duplicate logs.
    select distinct on (sm.user_id) sm.user_id,
      btrim(coalesce(sm.first_name, '') || ' ' || coalesce(sm.last_name, '')) as nm,
      sm.email::text as em, sm.role::text as role
    from public.staff_memberships sm where sm.organization_id = p_organization_id
    order by sm.user_id, (sm.access_status = 'active') desc, sm.created_at, sm.id
  ), base as (
    -- Same sources and trigger-mirror exclusions as the existing timeline.
    select 'audit:' || a.id::text as eid, 'audit'::text as src, a.at as ts, a.action as akey,
      case when a.metadata->>'source' = 'database_trigger' then a.detail->>'operation' end as op,
      a.entity_type as et, a.entity_id as eiid, a.admin_id as aid,
      coalesce(nullif(s.nm, ''), pa.email::text, s.em,
        case when a.admin_id is null and a.actor_role = 'system' then 'System'
             when a.admin_id is not null then 'Former or unavailable user' else 'Actor not recorded' end) as alabel,
      case when a.admin_id is not null and a.actor_role = 'system'
           then coalesce(s.role, case when pa.user_id is not null then 'platform_admin' end, 'unknown')
           else coalesce(a.actor_role, case when pa.user_id is not null then 'platform_admin' end, s.role, 'unknown') end as arole,
      case when pa.user_id is not null or a.actor_role = 'platform_admin' then 'platform_admin'
           when a.admin_id is null and a.actor_role = 'system' then 'system'
           else coalesce(nullif(a.actor_role, 'system'), s.role, 'unknown') end as atype,
      'success'::text as st, a.old_values as ov, a.new_values as nv, a.detail as dt,
      a.request_id as rid, host(a.ip_address) as ip,
      case when a.admin_id is null and a.actor_role = 'system' then 'System'
           when a.metadata->>'source' = 'database_trigger' and a.admin_id is not null then 'Gym app'
           when pa.user_id is not null or a.metadata->>'source' = 'platform_admin' or a.actor_role = 'platform_admin' then 'Admin panel'
           when s.user_id is not null then 'Gym app'
           when a.admin_id is null and a.actor_role = 'system' then 'System' else 'Source not recorded' end as org_src
    from public.admin_audit_log a
    left join staff s on s.user_id = a.admin_id
    left join public.platform_admins pa on pa.user_id = a.admin_id
    where a.target_organization_id = p_organization_id
      and (p_from is null or a.at >= p_from) and (p_to is null or a.at <= p_to)
      and not (coalesce(a.metadata->>'source', '') = 'database_trigger' and coalesce(a.actor_role, '') = 'platform_admin')
    union all
    select 'tenant:' || t.id::text, 'tenant_audit', t.at, lower(t.table_name) || '.' || lower(t.action), t.action,
      t.table_name, t.record_id::text, t.actor_id,
      coalesce(nullif(s.nm, ''), s.em,
        case when t.actor_id is null and t.actor_role = 'system' then 'System'
             when t.actor_id is not null then 'Former or unavailable user' else 'Actor not recorded' end),
      coalesce(nullif(t.actor_role, 'system'), s.role, case when t.actor_id is null and t.actor_role = 'system' then 'system' else 'unknown' end),
      coalesce(nullif(t.actor_role, 'system'), s.role, case when t.actor_id is null and t.actor_role = 'system' then 'system' else 'unknown' end),
      'success', t.before, t.after, null::jsonb, null::text, null::text,
      case when t.actor_id is null and t.actor_role = 'system' then 'System'
           when t.actor_id is not null then 'Gym app' else 'Source not recorded' end
    from public.audit_log t left join staff s on s.user_id = t.actor_id
    where t.organization_id = p_organization_id
      and t.table_name not in ('organizations','gyms','branches','members','staff_memberships','member_subscriptions','payments','membership_plans','inventory_products')
      and (p_from is null or t.at >= p_from) and (p_to is null or t.at <= p_to)
    union all
    select 'wa:' || w.id::text, 'whatsapp', coalesce(w.failed_at, w.created_at), 'whatsapp.message_failed', null,
      'whatsapp_message', w.id::text, null::uuid, 'System', 'system', 'system', 'failed',
      null::jsonb, jsonb_build_object('status', w.status, 'member_id', w.member_id),
      jsonb_build_object('template', coalesce(w.template_name, w.template_key), 'error_code', w.error_code, 'error_message', w.error_message, 'attempts', w.attempts, 'origin', w.origin),
      null::text, null::text, 'Worker'
    from public.whatsapp_messages w
    where w.organization_id = p_organization_id and w.status = 'failed'
      and (p_from is null or coalesce(w.failed_at, w.created_at) >= p_from) and (p_to is null or coalesce(w.failed_at, w.created_at) <= p_to)
    union all
    select 'webhook:' || e.id::text, 'webhook', e.received_at, 'webhook.failed', null,
      'webhook_event', e.id::text, null::uuid, 'Razorpay', 'system', 'system', 'failed',
      null::jsonb, jsonb_build_object('amount_minor', e.amount_minor),
      jsonb_build_object('event_type', e.event_type, 'error', e.processing_error, 'signature_verified', e.signature_verified, 'attempts', e.attempts),
      null::text, null::text, 'Webhook'
    from app.org_webhook_events(p_organization_id, now() - interval '365 days') e
    where (e.processing_error is not null or e.signature_verified is false)
      and (p_from is null or e.received_at >= p_from) and (p_to is null or e.received_at <= p_to)
    union all
    select 'billing:' || pp.id::text, 'billing', coalesce(pp.paid_at, pp.created_at), 'billing.payment', null,
      'platform_payment', pp.id::text, pp.initiated_by,
      coalesce(nullif(s.nm, ''), s.em, 'Actor not recorded'), coalesce(s.role, 'unknown'), coalesce(s.role, 'unknown'),
      case pp.status when 'succeeded' then 'success' when 'failed' then 'failed' else 'warning' end,
      null::jsonb, jsonb_build_object('status', pp.status, 'amount_minor', pp.amount_minor, 'currency', pp.currency),
      jsonb_build_object('provider', pp.provider, 'invoice', pp.invoice_number, 'period_start', pp.period_start, 'period_end', pp.period_end),
      null::text, null::text, 'Razorpay'
    from public.platform_payments pp left join staff s on s.user_id = pp.initiated_by
    where pp.organization_id = p_organization_id and pp.provider <> 'manual'
      and (p_from is null or coalesce(pp.paid_at, pp.created_at) >= p_from) and (p_to is null or coalesce(pp.paid_at, pp.created_at) <= p_to)
    union all
    select 'alert:' || sa.id::text, 'alert', sa.created_at, 'alert.raised', null,
      'system_alert', sa.id::text, null::uuid, 'System', 'system', 'system',
      case sa.severity when 'critical' then 'failed' when 'warning' then 'warning' else 'success' end,
      null::jsonb, null::jsonb, jsonb_build_object('title', coalesce(sa.title, sa.message), 'message', sa.message, 'severity', sa.severity),
      null::text, null::text, 'System'
    from public.system_alerts sa
    where sa.organization_id = p_organization_id
      and (p_from is null or sa.created_at >= p_from) and (p_to is null or sa.created_at <= p_to)
    union all
    select 'job:' || r.id::text, 'job', coalesce(r.completed_at, r.created_at), 'job.broadcast_failed', null,
      'bulk_communication_run', r.id::text, r.initiated_by,
      coalesce(nullif(s.nm, ''), s.em, case when r.initiated_by is null then 'System' else 'Actor not recorded' end),
      coalesce(s.role, case when r.initiated_by is null then 'system' else 'unknown' end),
      coalesce(s.role, case when r.initiated_by is null then 'system' else 'unknown' end), 'failed',
      null::jsonb, null::jsonb, jsonb_build_object('status', r.status, 'error_message', r.error_message, 'sent', r.sent_count, 'failed', r.failed_count, 'recipients', r.total_recipients),
      null::text, null::text, 'Worker'
    from public.bulk_communication_runs r left join staff s on s.user_id = r.initiated_by
    where r.organization_id = p_organization_id and r.status in ('failed', 'partially_failed')
      and (p_from is null or coalesce(r.completed_at, r.created_at) >= p_from) and (p_to is null or coalesce(r.completed_at, r.created_at) <= p_to)
  ), enriched as (
    select b.*, app.timeline_category(b.akey, b.et) as cat,
      coalesce(case when b.et = 'members' then nullif(b.eiid, '') end,
        (coalesce(b.ov, '{}'::jsonb) || coalesce(b.nv, '{}'::jsonb))->>'member_id') as mid_txt,
      case when b.akey like 'payment.%' or b.et in ('payments', 'member_subscriptions', 'platform_payment') then
        case when coalesce(b.nv->>'amount_minor', b.ov->>'amount_minor') ~ '^-?\d+$' then coalesce(b.nv->>'amount_minor', b.ov->>'amount_minor')::bigint
             when coalesce(b.nv->>'agreed_price_minor', b.ov->>'agreed_price_minor') ~ '^-?\d+$' then coalesce(b.nv->>'agreed_price_minor', b.ov->>'agreed_price_minor')::bigint end end as amt,
      coalesce(b.nv->>'currency', b.ov->>'currency') as cur,
      case when b.ov is not null and b.nv is not null then
        (select array_agg(k order by k) from jsonb_object_keys(b.ov || b.nv) k
         where k not in ('updated_at','created_at','edited_at') and b.nv->k is distinct from b.ov->k) end as chg
    from base b
  ), named as (
    select e.*,
      case when e.mid_txt ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then e.mid_txt::uuid end as mid,
      coalesce(nullif(btrim(concat_ws(' ', m.first_name, m.last_name)), ''),
        case when e.et = 'members' then nullif(btrim(concat_ws(' ', coalesce(e.nv->>'first_name', e.ov->>'first_name'), coalesce(e.nv->>'last_name', e.ov->>'last_name'))), '') end) as mname,
      m.id is not null as member_exists, m.deleted_at is not null as member_deleted,
      coalesce(e.nv->>'name', e.ov->>'name',
        case when e.et = 'staff_memberships' then nullif(btrim(concat_ws(' ', coalesce(e.nv->>'first_name', e.ov->>'first_name'), coalesce(e.nv->>'last_name', e.ov->>'last_name'))), '') end,
        e.nv->>'plan_name_snapshot', e.ov->>'plan_name_snapshot', e.nv->>'invoice_number', e.ov->>'invoice_number', e.dt->>'gym_name') as record_name,
      (e.et in ('organization','organizations') and e.eiid = p_organization_id::text and e.op is distinct from 'DELETE') as record_exists
    from enriched e left join public.members m
      on m.organization_id = p_organization_id and m.id =
        case when e.mid_txt ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then e.mid_txt::uuid end
  ), filtered as materialized (
    select n.* from named n
    where (p_category is null or p_category = '' or (p_category = 'admin' and n.atype = 'platform_admin') or n.cat = p_category)
      and (p_actor_type is null or p_actor_type = '' or n.atype = p_actor_type)
      and (v_actor_search is null or n.alabel ilike '%' || v_actor_search || '%'
        or exists (select 1 from staff s where s.user_id = n.aid and s.em ilike '%' || v_actor_search || '%')
        or exists (select 1 from public.platform_admins pa where pa.user_id = n.aid and pa.email::text ilike '%' || v_actor_search || '%'))
      and (p_member_id is null or n.mid = p_member_id)
      and (p_status is null or p_status = '' or n.st = p_status)
      and (v_search is null or n.akey ilike '%' || v_search || '%' or coalesce(n.et, '') ilike '%' || v_search || '%'
        or n.alabel ilike '%' || v_search || '%' or coalesce(n.mname, '') ilike '%' || v_search || '%'
        or coalesce(n.record_name, '') ilike '%' || v_search || '%' or coalesce(n.eiid, '') ilike '%' || v_search || '%'
        or coalesce(n.dt->>'reason', '') ilike '%' || v_search || '%')
  ), groups as (
    select case when p_group_by_member and f.mid is not null then 'member:' || f.mid::text else f.eid end as group_key,
      count(*) as group_count,
      (array_agg(f.eid order by case when p_sort_dir = 'asc' then f.ts end asc,
        case when coalesce(p_sort_dir, 'desc') <> 'asc' then f.ts end desc, f.eid desc))[1] as representative,
      (array_agg(f.mname order by f.ts desc, f.eid desc) filter (where f.mname is not null))[1] as group_member_name,
      (array_agg(coalesce(f.nv->>'plan_name_snapshot', f.ov->>'plan_name_snapshot') order by f.ts desc, f.eid desc)
        filter (where coalesce(f.nv->>'plan_name_snapshot', f.ov->>'plan_name_snapshot') is not null))[1] as group_plan,
      (array_agg(f.amt order by f.ts desc, f.eid desc) filter (where f.cat = 'payments' and f.amt is not null))[1] as group_amount_minor,
      bool_or(f.st = 'failed' or f.cat = 'security' or
        (f.et = 'payments' and (f.nv->>'status' = 'voided' or (f.nv->>'voided_at' is not null and f.ov->>'voided_at' is null))) or
        (f.et = 'members' and (f.op = 'DELETE' or (f.nv->>'deleted_at' is not null and f.ov->>'deleted_at' is null)))) as group_has_important
    from filtered f
    group by case when p_group_by_member and f.mid is not null then 'member:' || f.mid::text else f.eid end
  ), paged as (
    select f.eid as event_id, f.src as source, f.ts as occurred_at, f.akey as action_key, f.op as operation,
      f.et as entity_type, f.eiid as entity_id, f.aid as actor_id, f.alabel as actor_label, f.arole as actor_role, f.atype as actor_type,
      f.cat as category, f.st as status, f.mid as member_id, coalesce(g.group_member_name, f.mname) as member_name, f.amt as amount_minor, f.cur as currency,
      f.ov as old_values, f.nv as new_values, f.chg as changed_fields, f.dt as detail, f.rid as request_id, f.ip as ip_address, f.org_src as origin,
      f.record_name, f.record_exists, f.member_exists, f.member_deleted,
      g.group_count, g.group_plan, g.group_amount_minor, coalesce(g.group_has_important, false) as group_has_important
    from groups g join filtered f on f.eid = g.representative
    order by case when p_sort_dir = 'asc' then f.ts end asc,
      case when coalesce(p_sort_dir, 'desc') <> 'asc' then f.ts end desc, f.eid desc
    limit v_limit offset greatest(coalesce(p_offset, 0), 0)
  )
  select jsonb_build_object('total', (select count(*) from groups), 'event_total', (select count(*) from filtered), 'rows',
    coalesce((select jsonb_agg(app.activity_safe_value(to_jsonb(p)) order by
      case when p_sort_dir = 'asc' then p.occurred_at end asc,
      case when coalesce(p_sort_dir, 'desc') <> 'asc' then p.occurred_at end desc, p.event_id desc) from paged p), '[]'::jsonb))
  into v_result;
  return v_result;
end;
$$;

revoke execute on function public.admin_gym_activity(uuid,text,text,text,text,timestamptz,timestamptz,text,integer,integer,text,uuid,boolean) from public, anon, authenticated;
grant execute on function public.admin_gym_activity(uuid,text,text,text,text,timestamptz,timestamptz,text,integer,integer,text,uuid,boolean) to authenticated;
