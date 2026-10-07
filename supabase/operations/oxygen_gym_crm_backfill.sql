-- One-time, idempotent CRM data backfill authorized by the customer on 2026-10-04.
-- Production only. This is a data operation, not a schema migration.
-- Writes only platform_sales_leads / activities / assignments and the admin audit.
-- Never calls onboarding, conversion, billing, tenant mutation, or messaging RPCs.
begin isolation level repeatable read;
set local statement_timeout = '30s';
select set_config('request.jwt.claim.sub', '0cdb691b-6dfa-4614-a689-3524b9d967cb', true);

create temporary table oxygen_tenant_snapshot (
  schema_name text, table_name text, fingerprint text
) on commit drop;

do $$
declare
  org_id constant uuid := 'e339d2fe-9c85-492c-846f-353c28a1c1c3';
  o public.organizations%rowtype;
  s public.organization_subscriptions%rowtype;
  owner_contact public.staff_memberships%rowtype;
  lead public.platform_sales_leads%rowtype;
  t record;
  before_org jsonb;
  fingerprint text;
  contact_name text;
  contact_email text;
  contact_phone text;
  branch_count integer;
  member_count integer;
  matching_count integer;
begin
  if not exists (select 1 from public.disaster_recovery_config where environment = 'production')
     or not app.has_platform_permission('sales.manage')
     or app.platform_admin_role() <> 'platform_owner' then
    raise exception 'Production environment and active platform owner are required';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('oxygen-gym-crm-backfill:' || org_id, 0));
  select * into strict o from public.organizations where id = org_id;
  select * into strict s from public.organization_subscriptions where organization_id = org_id;
  if o.name <> 'The Oxygen Gym' or (o.created_at at time zone 'Asia/Kolkata')::date <> date '2026-09-28'
     or (s.current_period_start at time zone 'Asia/Kolkata')::date <> date '2026-09-28'
     or s.current_period_start is null or s.current_period_end is null
     or s.status <> 'trialing' or s.current_period_end <= now()
     or o.suspended_at is not null or o.deletion_requested_at is not null then
    raise exception 'Oxygen Gym no longer matches the verified active trial; review before importing';
  end if;
  before_org := to_jsonb(o);
  -- Fingerprint every public tenant table carrying organization_id. CRM is the
  -- only excluded table. REPEATABLE READ avoids comparing concurrent customer writes.
  for t in
    select n.nspname schema_name, c.relname table_name from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attname = 'organization_id'
      and not a.attisdropped
    where n.nspname = 'public' and c.relkind in ('r','p')
      and c.relname <> 'platform_sales_leads'
  loop
    execute format('select md5(coalesce(string_agg(row_hash, '''' order by row_hash), '''')) from (select md5(to_jsonb(r)::text) row_hash from %I.%I r where organization_id = $1) q', t.schema_name, t.table_name)
      into fingerprint using org_id;
    insert into oxygen_tenant_snapshot values (t.schema_name, t.table_name, fingerprint);
  end loop;
  select * into strict owner_contact from public.staff_memberships
    where organization_id = org_id and role = 'owner' and access_status = 'active'
    order by created_at, id limit 1;
  contact_name := btrim(owner_contact.first_name || ' ' || coalesce(owner_contact.last_name, ''));
  contact_email := lower(btrim(coalesce(nullif(o.contact_email, ''), owner_contact.email::text)));
  contact_phone := coalesce(nullif(o.contact_phone, ''), owner_contact.phone_e164);
  if nullif(contact_name, '') is null or contact_email is null or contact_phone is null then
    raise exception 'Verified owner contact details are incomplete';
  end if;
  for t in select k from unnest(array['platform-sales-phone:' || contact_phone,
    'platform-sales-email:' || contact_email]) k order by k loop
    perform pg_advisory_xact_lock(hashtextextended(t.k, 0));
  end loop;
  select count(*) into branch_count from public.branches where organization_id = org_id and status = 'active';
  select count(*) into member_count from public.members where organization_id = org_id and deleted_at is null;
  if branch_count = 0 then raise exception 'No active branches found'; end if;
  select count(*) into matching_count from public.platform_sales_leads
    where deleted_at is null and (organization_id = org_id or phone = contact_phone or email = contact_email or gym ilike '%oxygen%');
  if matching_count > 0 then
    -- A repeat of this exact import is a no-op. Other matches require review.
    if matching_count <> 1 then raise exception 'Multiple CRM matches; no records were changed'; end if;
    select * into strict lead from public.platform_sales_leads where deleted_at is null
      and organization_id = org_id and source = 'Existing customer' and stage = 'trial'
      and trial_started_at = s.current_period_start and trial_ends_at = s.current_period_end;
    perform set_config('task.oxygen_result', 'Already present; no changes', true);
  else
    insert into public.platform_sales_leads (
      gym, contact, phone, email, city, state, area, pin, branches, members, source,
      stage, owner, organization_id, trial_started_at, trial_ends_at, created_at, note
    ) values (
      o.name, contact_name, contact_phone, contact_email, o.city, o.state,
      coalesce(o.address_line, ''), coalesce(o.postal_code, ''),
      case when branch_count = 1 then '1' when branch_count <= 3 then '2–3' when branch_count <= 10 then '4–10' else '10+' end,
      case when member_count < 100 then 'Under 100' when member_count < 300 then '100–300' when member_count < 600 then '300–600' when member_count < 1000 then '600–1,000' else '1,000+' end,
      'Existing customer', 'trial', auth.uid(), org_id, s.current_period_start,
      s.current_period_end, o.created_at,
      'Existing live customer on trial since 28 September 2026. Trial dates copied from the existing subscription; CRM backfill only, with no gym, billing, access or member changes.'
    ) returning * into lead;
    insert into public.platform_sales_activities (lead_id, kind, title, detail, actor_id)
      values (lead.id, 'note', 'Existing customer trial added to CRM',
        jsonb_build_object('note', lead.note, 'organization_id', org_id,
          'trial_started_at', s.current_period_start, 'trial_ends_at', s.current_period_end,
          'member_count_at_import', member_count, 'branch_count_at_import', branch_count), auth.uid());
    insert into public.platform_sales_assignments (lead_id, to_id, actor_id, note)
      values (lead.id, auth.uid(), auth.uid(), 'Existing customer CRM backfill assigned to platform owner');
    perform app.write_admin_audit('sales.importExistingTrial', 'sales_lead', lead.id::text,
      null, to_jsonb(lead), jsonb_build_object('source', 'oxygen_gym_crm_backfill',
        'organization_id', org_id, 'tenant_writes', false));
    perform set_config('task.oxygen_result', 'Added to CRM', true);
  end if;
  if before_org is distinct from (select to_jsonb(r) from public.organizations r where id = org_id) then
    raise exception 'Organization changed; rolling back the CRM import';
  end if;
  for t in select * from oxygen_tenant_snapshot loop
    execute format('select md5(coalesce(string_agg(row_hash, '''' order by row_hash), '''')) from (select md5(to_jsonb(r)::text) row_hash from %I.%I r where organization_id = $1) q', t.schema_name, t.table_name)
      into fingerprint using org_id;
    if fingerprint is distinct from t.fingerprint then
      raise exception 'Tenant table %.% changed; rolling back the CRM import', t.schema_name, t.table_name;
    end if;
  end loop;
  perform set_config('task.oxygen_lead_id', lead.id::text, true);
  perform set_config('task.oxygen_tables_verified', (select count(*)::text from oxygen_tenant_snapshot), true);
end $$;

-- Verify using the same authenticated, permission-gated RPCs as the CRM.
set local role authenticated;
do $$
declare snapshot jsonb;
begin
  snapshot := public.admin_sales_snapshot('all', null, '{}'::jsonb, 'Oxygen', false, '90', 100, 0);
  if not exists (select 1 from jsonb_array_elements(snapshot->'leads') l
    where l->>'id' = current_setting('task.oxygen_lead_id') and l->>'stage' = 'trial') then
    raise exception 'CRM read verification failed; rolling back the import';
  end if;
end $$;
with detail as (
  select public.admin_sales_lead_detail(current_setting('task.oxygen_lead_id')::uuid)->'lead' l
), snapshot as (
  select public.admin_sales_snapshot('all', null, '{}'::jsonb, 'Oxygen', false, '90', 100, 0) s
)
select current_setting('task.oxygen_result') result, l->>'gym' gym, l->>'stage' crm_stage,
  to_char((l->>'trial_started_at')::timestamptz at time zone 'Asia/Kolkata', 'DD Mon YYYY') trial_start_ist,
  to_char((l->>'trial_ends_at')::timestamptz at time zone 'Asia/Kolkata', 'DD Mon YYYY') trial_end_ist,
  s->>'total' crm_search_matches, 'Unchanged' live_customer_data,
  current_setting('task.oxygen_tables_verified') tenant_tables_verified,
  l->>'id' lead_id
from detail cross join snapshot;
commit;
