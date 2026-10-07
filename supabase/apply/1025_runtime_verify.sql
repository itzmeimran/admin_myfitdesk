-- DEV only, after 1025. No emails, HTTP or paid transactions are invoked.
-- Exercises the installed onboarding helper; all fixture rows roll back.
begin isolation level repeatable read;
set local statement_timeout='60s';
do $$ begin
 if not exists(select 1 from public.disaster_recovery_config where environment in ('development','dev'))
  or exists(select 1 from public.disaster_recovery_config where environment='production') then
  raise exception 'This verification is DEV only';
 end if;
end $$;
create temporary table crm_1025_existing_orgs on commit drop as select id from public.organizations;
create temporary table crm_1025_tenant_snapshot(table_name text,fingerprint text) on commit drop;
do $$
declare t record; hash text;
begin
 for t in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
  join pg_attribute a on a.attrelid=c.oid and a.attname='organization_id' and not a.attisdropped
  where n.nspname='public' and c.relkind in ('r','p') and c.relname<>'platform_sales_leads'
 loop
  execute format('select md5(coalesce(string_agg(md5(to_jsonb(r)::text),'''' order by md5(to_jsonb(r)::text)),'''')) from public.%I r where organization_id in (select id from crm_1025_existing_orgs)',t.relname) into hash;
  insert into crm_1025_tenant_snapshot values(t.relname,hash);
 end loop;
 insert into crm_1025_tenant_snapshot select 'organizations',md5(coalesce(string_agg(md5(to_jsonb(o)::text),'' order by md5(to_jsonb(o)::text)),'')) from public.organizations o;
end $$;
do $$
declare a uuid; lead uuid:=gen_random_uuid(); second_request uuid:=gen_random_uuid(); v_phone text;
 email text:='crm-1025-'||gen_random_uuid()||'@fixture.invalid'; input jsonb; v jsonb; d jsonb; org uuid;
begin
 select user_id into strict a from public.platform_admins where role='platform_owner' and status='active' and revoked_at is null order by granted_at limit 1;
 loop
  v_phone:='+916'||lpad(floor(random()*1000000000)::bigint::text,9,'0');
  exit when not exists(select 1 from public.platform_sales_leads where platform_sales_leads.phone=v_phone)
   and not exists(select 1 from public.organizations where right(regexp_replace(coalesce(contact_phone,''),'[^0-9]','','g'),10)=right(v_phone,10));
 end loop;
 input:=jsonb_build_object('gym','CRM 1025 verification gym','contact','Verification Owner','phone',v_phone,'email','',
  'city','Kadapa','state','Andhra Pradesh','source','Field visit','branches','Unknown','members','Unknown');
 perform set_config('request.jwt.claim.sub',a::text,true);
 execute 'set local role authenticated';
 v:=public.admin_sales_create_lead(lead,input);
 if (v->>'leadId')::uuid<>lead then raise exception 'Manual lead was not created'; end if;
 perform public.admin_sales_create_lead(lead,input);
 v:=public.admin_sales_create_lead(second_request,input);
 if (v->>'leadId')::uuid<>lead or v->>'existing'<>'true' then raise exception 'Duplicate manual contact was not reused'; end if;
 perform public.admin_sales_command(lead,'scheduleFollowUp',jsonb_build_object('type','Call','dueAt',now()+interval '1 day'));
 v:=public.admin_sales_command(lead,'convert',jsonb_build_object('how','invite','ownerName','Verification Owner','email',email,'plan','Monthly'));
 org:=(v#>>'{invitation,organization_id}')::uuid;
 if org is null then raise exception 'Real onboarding helper returned no gym'; end if;
 d:=public.admin_sales_lead_detail(lead);
 if d#>>'{lead,stage}'<>'trial' or d#>>'{lead,converted_at}' is not null or d#>>'{lead,email}'<>email then raise exception 'Trial state or owner email incorrect'; end if;
 if d#>>'{follow_ups,0,status}'<>'open' then raise exception 'Trial creation stopped the sales follow-up'; end if;
 begin
  perform public.admin_sales_command(lead,'convert','{"how":"paid","plan":"Monthly"}');
  raise exception 'Trial was accepted as paid';
 exception when raise_exception then
  if sqlerrm not like 'This gym is still on trial%' then raise; end if;
 end;
 execute 'reset role';
 if not exists(select 1 from public.organization_subscriptions where organization_id=org and status='trialing'
  and current_period_start=(d#>>'{lead,trial_started_at}')::timestamptz and current_period_end=(d#>>'{lead,trial_ends_at}')::timestamptz) then
  raise exception 'CRM trial dates differ from the real subscription';
 end if;
 if (select count(*) from public.platform_sales_activities where lead_id=lead and kind='created')<>1 then raise exception 'Creation was not idempotent'; end if;
end $$;
do $$
declare t record; hash text;
begin
 for t in select * from crm_1025_tenant_snapshot loop
  if t.table_name='organizations' then
   select md5(coalesce(string_agg(md5(to_jsonb(o)::text),'' order by md5(to_jsonb(o)::text)),'')) into hash
    from public.organizations o where id in (select id from crm_1025_existing_orgs);
  else
   execute format('select md5(coalesce(string_agg(md5(to_jsonb(r)::text),'''' order by md5(to_jsonb(r)::text)),'''')) from public.%I r where organization_id in (select id from crm_1025_existing_orgs)',t.table_name) into hash;
  end if;
  if hash is distinct from t.fingerprint then raise exception 'Existing customer data changed in %',t.table_name; end if;
 end loop;
 raise notice '1025 DEV runtime checks passed. Existing customer fingerprints unchanged. All fixtures roll back.';
end $$;
rollback;
