-- Run after applying 1021 on DEV pgedlnxuuelmtpmbkdwm.
-- PROD clbphruocsqsmklmrloq only with explicit approval. All fixtures roll back.
-- Uses a REAL active platform owner, executes RPCs under service_role/authenticated/anon.
begin;
do $$
declare
  v_admin uuid; v_day date; v_id uuid := gen_random_uuid(); v_other uuid := gen_random_uuid();
  v_payload jsonb; v_result jsonb; v_lead uuid; v_at timestamptz; v_count integer;
  v_phone text; v_email text;
begin
  select pa.user_id into v_admin from public.platform_admins pa
    where pa.revoked_at is null and pa.status = 'active' and pa.role = 'platform_owner' order by pa.granted_at limit 1;
  if v_admin is null then raise exception 'Verification needs an active platform owner'; end if;
  select d::date into v_day from generate_series(
    (now() at time zone 'Asia/Kolkata')::date + 1,
    (now() at time zone 'Asia/Kolkata')::date + 30, interval '1 day') d
    where extract(dow from d) <> 0 order by d limit 1;
  -- Distinct fixture identity; 6-prefix Indian mobile. Never send a notification.
  v_phone := '+916' || lpad((floor(random()*1000000000)::bigint)::text,9,'0');
  v_email := 'demo-verify-' || v_id::text || '@example.invalid';
  v_payload := jsonb_build_object('gym','Verification Gym','name','Verification Contact','phone',v_phone,
    'email',v_email,'city','Hyderabad','state','Telangana','branches','1','members','Under 100','message','Test request');
  -- Ensure a predictable fixture calendar independent of operational holidays/capacity.
  insert into public.platform_demo_day_overrides(day,closed,capacity) values(v_day,false,100)
    on conflict(day) do update set closed=false,capacity=100;
  update public.platform_demo_working_hours set first_slot=0,last_slot=17,capacity=100 where weekday=extract(dow from v_day);
  execute 'set local role service_role';
  v_result := public.submit_website_demo(v_id,v_payload,v_day,0);
  if v_result <> '{"returning":false,"created":true}'::jsonb then raise exception 'First submit failed: %',v_result; end if;
  v_result := public.submit_website_demo(v_id,v_payload,v_day,0);
  if v_result <> '{"returning":false,"created":false}'::jsonb then raise exception 'Replay failed'; end if;
  begin
    perform public.submit_website_demo(v_id,v_payload || '{"gym":"Changed"}'::jsonb,v_day,0);
    raise exception 'Changed replay accepted';
  exception when invalid_parameter_value then null; end;
  select r.lead_id into v_lead from public.platform_demo_requests r where r.id=v_id;
  v_result := public.submit_website_demo(v_other,v_payload,v_day,0);
  if v_result <> '{"returning":true,"created":true}'::jsonb then raise exception 'Duplicate not matched'; end if;
  select count(*) into v_count from public.platform_sales_leads l where l.phone=v_phone;
  if v_count <> 1 then raise exception 'Duplicate lead created'; end if;
  if not exists(select 1 from public.platform_sales_leads l where l.id=v_lead and l.possible_existing_lead
    and l.source='Website Demo' and l.stage='demo_req' and l.demo_status='Awaiting confirmation' and l.owner=v_admin) then
    raise exception 'Lead defaults/flag/assignment incorrect'; end if;
  update public.platform_sales_leads set stage='trial' where id=v_lead;
  v_result := public.submit_website_demo(gen_random_uuid(),v_payload || jsonb_build_object('phone','+919999999999'),v_day,1);
  if v_result->>'returning' <> 'true' then raise exception 'Email-only match failed'; end if;
  v_result := public.submit_website_demo(gen_random_uuid(),v_payload || jsonb_build_object('email','changed-' || v_email),v_day,2);
  if v_result->>'returning' <> 'true' then raise exception 'Phone-only match failed'; end if;
  if not exists(select 1 from public.platform_sales_leads l where l.id=v_lead and l.stage='trial' and l.phone=v_phone and l.email=v_email) then
    raise exception 'Returning submit overwrote existing lead'; end if;
  update public.platform_sales_leads set stage='demo_req' where id=v_lead;
  if not (public.website_demo_availability(v_day)->'openSlots') @> '[0]'::jsonb then raise exception 'Pending request reserved slot'; end if;
  v_at := (v_day + time '10:00') at time zone 'Asia/Kolkata';
  if (select r.requested_at from public.platform_demo_requests r where r.id=v_id) <> v_at then raise exception 'IST conversion failed'; end if;
  begin
    perform public.submit_website_demo(gen_random_uuid(),v_payload,(now() at time zone 'Asia/Kolkata')::date,0);
    raise exception 'Past date accepted';
  exception when no_data_found then null; end;
  begin
    perform public.submit_website_demo(gen_random_uuid(),v_payload,v_day,18);
    raise exception 'Invalid index accepted';
  exception when invalid_parameter_value then null; end;
  execute 'reset role';
  update public.platform_demo_day_overrides set capacity=1 where day=v_day;
  -- Other fixture/live confirmed rows at this particular instant are excluded by moving them in this rolled-back transaction.
  update public.platform_demo_requests set status='Cancelled' where status in ('Scheduled','Rescheduled') and confirmed_at=v_at;
  perform set_config('request.jwt.claim.sub',v_admin::text,true);
  execute 'set local role authenticated';
  perform public.admin_set_demo_status(v_id,'Scheduled',v_at);
  v_result := public.admin_demo_requests(100,0);
  if (v_result->>'total')::integer < 2 then raise exception 'Owner read failed'; end if;
  begin
    perform public.admin_set_demo_status(v_other,'Scheduled',v_at);
    raise exception 'Capacity exceeded';
  exception when no_data_found then null; end;
  perform public.admin_set_demo_status(v_id,'Cancelled');
  perform public.admin_set_demo_status(v_other,'Rescheduled',v_at);
  perform public.admin_set_demo_status(v_id,'Cancelled');
  execute 'reset role';
  if not exists(select 1 from public.platform_sales_leads l where l.id=v_lead and l.demo_status='Rescheduled' and l.preferred_at=v_at) then
    raise exception 'Older cancellation hid confirmed demo'; end if;
  execute 'set local role authenticated';
  perform public.admin_set_demo_status(v_other,'Completed');
  perform public.admin_set_demo_status(v_other,'Cancelled');
  begin
    perform 1 from public.platform_sales_leads;
    raise exception 'Authenticated direct table read allowed';
  exception when insufficient_privilege then null; end;
  begin
    perform public.submit_website_demo(gen_random_uuid(),v_payload,v_day,0);
    raise exception 'Authenticated submit RPC allowed';
  exception when insufficient_privilege then null; end;
  execute 'reset role';
  if not exists(select 1 from public.admin_audit_log a where a.action='demo.status_changed' and a.detail->>'request_id'=v_id::text) then
    raise exception 'Missing audit'; end if;
  insert into public.platform_demo_day_overrides(day,closed) values(v_day,true) on conflict(day) do update set closed=true;
  execute 'set local role service_role';
  if public.website_demo_availability(v_day)->>'status' <> 'closed' then raise exception 'Holiday not closed'; end if;
  if jsonb_array_length(public.website_demo_availability(v_day)->'openSlots') <> 0 then raise exception 'Holiday has slots'; end if;
  v_result := public.website_demo_calendar();
  if (select count(*) from jsonb_object_keys(v_result)) <> 30 then raise exception 'Calendar window mismatch'; end if;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  execute 'set local role authenticated';
  begin
    perform public.admin_demo_requests(); raise exception 'Non-admin read allowed';
  exception when insufficient_privilege then null; end;
  begin
    perform public.admin_set_demo_status(v_id,'Cancelled'); raise exception 'Non-admin mutation allowed';
  exception when insufficient_privilege then null; end;
  execute 'reset role';
  execute 'set local role anon';
  begin
    perform 1 from public.platform_demo_requests; raise exception 'Anon table read allowed';
  exception when insufficient_privilege then null; end;
  begin
    perform public.submit_website_demo(gen_random_uuid(),v_payload,v_day,0); raise exception 'Anon submit RPC allowed';
  exception when insufficient_privilege then null; end;
  begin
    perform public.website_demo_availability(v_day); raise exception 'Anon availability RPC allowed';
  exception when insufficient_privilege then null; end;
  execute 'reset role';
  raise notice '1021 verified: submit, replay, duplicate, assignment, IST, capacity, holiday, admin read/write, audit and access denial';
end;
$$;
rollback;
