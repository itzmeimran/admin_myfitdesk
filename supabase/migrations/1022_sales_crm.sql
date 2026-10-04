-- Extends 1021's shared lead store. Apply in DEV SQL Editor after 1021.
-- PROD requires explicit approval. No remote history changes.
begin;
insert into public.platform_roles(role,label,description,sort_order) values
 ('sales_manager','Sales Manager','Sales leads within their assigned team.',50),
 ('sales_rep','Sales Rep','Sales leads assigned to them.',60) on conflict do nothing;
insert into public.platform_role_permissions(role,permission)
select r,p from unnest(array['platform_owner','sales_manager','sales_rep']) r
cross join unnest(array['sales.view','sales.manage']) p on conflict do nothing;
insert into public.platform_role_permissions(role,permission) values
 ('platform_owner','sales.reassign'),('sales_manager','sales.reassign') on conflict do nothing;
alter table public.platform_admins add column if not exists sales_team text;
alter table public.platform_sales_leads
 add column area text not null default '', add column pin text not null default '',
 add column software text not null default '', add column priority text not null default 'normal' check(priority in ('normal','high')),
 add column last_contacted_at timestamptz, add column first_contacted_at timestamptz, add column trial_started_at timestamptz, add column trial_ends_at timestamptz,
 add column demo_suggested boolean not null default false,
 add column lost_reason text, add column note text, add column expected_plan text not null default '',
 add column duplicate_of uuid references public.platform_sales_leads(id),
 add column organization_id uuid references public.organizations(id), add column converted_at timestamptz,
 add column converted_by uuid references auth.users(id), add column conversion jsonb,
 add column deleted_at timestamptz;
create table public.platform_sales_follow_ups (
 id uuid primary key default gen_random_uuid(), lead_id uuid not null references public.platform_sales_leads(id),
 type text not null check(type in ('Call','WhatsApp','Email','Meeting','Demo')),
 due_at timestamptz not null, status text not null default 'open' check(status in ('open','done','stopped')),
 note text not null default '', actor_id uuid references auth.users(id), completed_at timestamptz,
 created_at timestamptz not null default now()
);
create index platform_sales_follow_ups_due_idx on public.platform_sales_follow_ups(lead_id,due_at) where status='open';
create table public.platform_sales_assignments (
 id uuid primary key default gen_random_uuid(), lead_id uuid not null references public.platform_sales_leads(id),
 from_id uuid references auth.users(id), to_id uuid references auth.users(id), actor_id uuid references auth.users(id),
 note text not null default '', created_at timestamptz not null default now()
);
create index platform_sales_assignments_lead_idx on public.platform_sales_assignments(lead_id,created_at);
alter table public.platform_sales_follow_ups enable row level security;
alter table public.platform_sales_follow_ups force row level security;
alter table public.platform_sales_assignments enable row level security;
alter table public.platform_sales_assignments force row level security;
revoke all on public.platform_sales_follow_ups,public.platform_sales_assignments from public,anon,authenticated;
grant all on public.platform_sales_follow_ups,public.platform_sales_assignments to service_role;

-- Resolve existing website duplicate flags without auto-merging records.
update public.platform_sales_leads l set duplicate_of=(select e.id from public.platform_sales_leads e
 where e.id<>l.id and e.created_at<=l.created_at and (e.phone=l.phone or e.email=l.email)
 order by e.created_at,e.id limit 1) where l.possible_existing_lead;

create function app.sales_visible(p_owner uuid) returns boolean language sql stable security definer
set search_path=public,pg_temp as $$
 select app.has_platform_permission('sales.view') and (
 app.platform_admin_role()='platform_owner' or p_owner=auth.uid() or
 (app.platform_admin_role()='sales_manager' and exists(
 select 1 from public.platform_admins me join public.platform_admins them on them.sales_team=me.sales_team
 where me.user_id=auth.uid() and them.user_id=p_owner and nullif(me.sales_team,'') is not null)))
$$;
create function app.sales_in_scope(p_owner uuid,p_scope text,p_team text) returns boolean language sql stable security definer
set search_path=public,pg_temp as $$
 select app.sales_visible(p_owner) and case p_scope when 'my' then p_owner=auth.uid()
 when 'all' then app.platform_admin_role()='platform_owner'
 when 'team' then exists(select 1 from public.platform_admins pa where pa.user_id=p_owner and
 pa.sales_team=case when app.platform_admin_role()='platform_owner' then p_team else
 (select me.sales_team from public.platform_admins me where me.user_id=auth.uid()) end)
 else false end
$$;
create function app.sales_attention(p_lead public.platform_sales_leads) returns text[] language sql stable
set search_path=public,pg_temp set timezone='Asia/Kolkata' as $$
 select case when p_lead.stage in ('converted','later','notint','lost') then '{}'::text[] else array_remove(array[
 case when exists(select 1 from public.platform_sales_follow_ups f where f.lead_id=p_lead.id and f.status='open' and f.due_at<now()) then 'overdue' end,
 case when p_lead.stage='demo_req' and p_lead.demo_status='Awaiting confirmation' then 'demo' end,
 case when p_lead.stage='trial' and p_lead.trial_ends_at::date-current_date<=3 then 'trial' end,
 case when coalesce(p_lead.last_contacted_at,p_lead.created_at)::date<=current_date-7 then 'stale' end
 ],null) end
$$;
create function app.sales_row(p_lead public.platform_sales_leads) returns jsonb language sql stable
set search_path=public,pg_temp as $$
 select to_jsonb(p_lead)||jsonb_build_object('next_follow_up',
 (select to_jsonb(f) from public.platform_sales_follow_ups f where f.lead_id=p_lead.id and f.status='open' order by f.due_at,f.id limit 1),
 'attention',app.sales_attention(p_lead),'duplicate_of',coalesce(p_lead.duplicate_of,
 (select e.id from public.platform_sales_leads e where p_lead.possible_existing_lead and e.id<>p_lead.id
 and e.deleted_at is null and e.created_at<=p_lead.created_at and (e.phone=p_lead.phone or e.email=p_lead.email)
 order by e.created_at,e.id limit 1)))
$$;

create function public.admin_sales_lead_detail(p_id uuid) returns jsonb language plpgsql stable security definer
set search_path=public,pg_temp as $$
declare l public.platform_sales_leads%rowtype;
begin
 select * into l from public.platform_sales_leads where id=p_id and deleted_at is null;
 if not found or not app.sales_visible(l.owner) then raise exception 'Lead not found or access denied' using errcode='42501'; end if;
 return jsonb_build_object('lead',app.sales_row(l),
 'activities',coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at desc,a.id) from public.platform_sales_activities a where a.lead_id=p_id),'[]'),
 'follow_ups',coalesce((select jsonb_agg(to_jsonb(f) order by f.due_at,f.id) from public.platform_sales_follow_ups f where f.lead_id=p_id),'[]'),
 'assignments',coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at,a.id) from public.platform_sales_assignments a where a.lead_id=p_id),'[]'));
end $$;

create function public.admin_sales_attention_count() returns integer language plpgsql stable security definer
set search_path=public,pg_temp as $$
begin
 if not app.has_platform_permission('sales.view') then raise exception 'Not authorized' using errcode='42501'; end if;
 return (select count(*)::integer from public.platform_sales_leads l where deleted_at is null and app.sales_visible(owner) and cardinality(app.sales_attention(l))>0);
end $$;

-- A single transaction per user intent: write + timeline + shared admin audit.
-- Extract the existing onboarding implementation into a PRIVATE shared helper.
-- The existing public gym RPC keeps gyms.manage; scoped CRM conversion is the
-- only new entry point for sales staff. Both create the same 1012 invitations.
do $share_onboarding$
declare v_oid oid; v_definition text; v_private text; v_args text; v_forward text; v_body integer;
begin
 select p.oid into strict v_oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='admin_create_gym_owner_invitation';
 v_definition:=pg_get_functiondef(v_oid);
 v_args:=pg_get_function_identity_arguments(v_oid);
 if strpos(v_definition,'if not app.has_platform_permission(''gyms.manage'') then')=0 then
  raise exception 'Expected role-gated onboarding RPC. Apply platform-settings before 1022.';
 end if;
 v_private:=replace(v_definition,'FUNCTION public.admin_create_gym_owner_invitation(', 'FUNCTION app.sales_create_gym_owner_invitation(');
 v_private:=replace(v_private,'if not app.has_platform_permission(''gyms.manage'') then',
  'if not app.has_platform_permission(''gyms.manage'') and not app.has_platform_permission(''sales.manage'') then');
 execute v_private;
 execute format('revoke all on function app.sales_create_gym_owner_invitation(%s) from public,anon,authenticated',v_args);
 select string_agg(format('%I => %I',a,a),', ' order by ord) into v_forward
 from pg_proc p cross join lateral unnest(p.proargnames) with ordinality as names(a,ord) where p.oid=v_oid;
 v_body:=strpos(v_definition,'AS $function$');
 if v_body=0 then raise exception 'Unexpected onboarding function definition'; end if;
 execute substr(v_definition,1,v_body-1)||'AS $function$ begin
  if not app.has_platform_permission(''gyms.manage'') then raise exception ''Not authorized'' using errcode=''42501''; end if;
  return app.sales_create_gym_owner_invitation('||v_forward||');
 end $function$;';
end $share_onboarding$;

create function public.admin_sales_command(p_id uuid,p_command text,p_input jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=public,pg_temp set timezone='Asia/Kolkata' as $$
declare l public.platform_sales_leads%rowtype; e public.platform_sales_leads%rowtype;
 v_stage text; v_title text; v_kind text:='note'; v_to uuid; v_at timestamptz; v_req uuid;
 v_day date; v_local timestamp; v_slot integer; v_status text; v_org uuid; v_invite jsonb;
 v_lock bigint; v_result uuid:=p_id; v_note text:=btrim(coalesce(p_input->>'note','')); v_plan text;
begin
 if not app.has_platform_permission('sales.manage') then raise exception 'Not authorized' using errcode='42501'; end if;
 if p_input is null or jsonb_typeof(p_input)<>'object' or length(p_input::text)>12000 then raise exception 'Invalid input'; end if;
 -- Serialize cross-lead operations (merges / invitations) to avoid duplicate gyms and lock inversions.
 if p_command in ('convert','resolveDuplicate') then perform pg_advisory_xact_lock(hashtextextended('sales-cross-lead',0)); end if;
 select * into l from public.platform_sales_leads where id=p_id and deleted_at is null for update;
 if not found or not app.sales_visible(l.owner) then raise exception 'Lead not found or access denied' using errcode='42501'; end if;
 if length(v_note)>5000 then raise exception 'Note is too long'; end if;
 if p_command not in ('togglePriority','resolveDuplicate','logActivity','reassign','setDemoStatus') and l.stage='converted' then raise exception 'Converted leads cannot be changed'; end if;
 case p_command
 when 'moveLead' then
  v_stage:=p_input->>'stage';
  if l.stage in ('later','notint','lost') then raise exception 'Reopen the lead first'; end if;
  if v_stage is null or v_stage not in ('new','contacted','interested','demo_req','trial','followup') then raise exception 'Use the demo, conversion or close flow for this stage'; end if;
  if v_stage='demo_req' and l.demo_status is distinct from 'Awaiting confirmation' then raise exception 'Schedule a demo through the demo flow'; end if;
  update public.platform_sales_leads set stage=v_stage,
   trial_started_at=case when v_stage='trial' then coalesce(trial_started_at,now()) else trial_started_at end,
   trial_ends_at=case when v_stage='trial' then coalesce(trial_ends_at,now()+interval '14 days') else trial_ends_at end where id=p_id;
  v_title:='Moved to '||v_stage; v_kind:=case when v_stage='trial' then 'trial' else 'swap' end;
 when 'logActivity' then
  if p_input->>'type' is null or p_input->>'type' not in ('Call','WhatsApp','Email','Meeting','Note') then raise exception 'Invalid activity type'; end if;
  if p_input->>'type'='Note' and v_note='' then raise exception 'Write a note'; end if;
  update public.platform_sales_leads set first_contacted_at=coalesce(first_contacted_at,now()),last_contacted_at=now() where id=p_id;
  v_kind:=lower(p_input->>'type'); v_title:=p_input->>'type'||' logged';
 when 'scheduleFollowUp' then
  if l.stage in ('later','notint','lost') then raise exception 'Reopen the lead first'; end if;
  v_at:=(p_input->>'dueAt')::timestamptz;
  if v_at is null or v_at<=now() then raise exception 'Choose a future follow-up time'; end if;
  insert into public.platform_sales_follow_ups(lead_id,type,due_at,note,actor_id) values(p_id,p_input->>'type',v_at,v_note,auth.uid());
  v_title:='Follow-up scheduled'; v_kind:='clock';
 when 'completeFollowUp' then
  update public.platform_sales_follow_ups set status='done',completed_at=now() where id=(p_input->>'followUpId')::uuid and lead_id=p_id and status='open';
  if not found then raise exception 'Open follow-up not found'; end if;
  update public.platform_sales_leads set first_contacted_at=coalesce(first_contacted_at,now()),last_contacted_at=now(),stage=case when stage='later' then 'followup' else stage end where id=p_id;
  v_title:='Follow-up completed'; v_kind:='check';
 when 'saveDemo' then
  if l.stage in ('later','notint','lost') then raise exception 'Reopen the lead first'; end if;
  if p_input->>'variant' is null or p_input->>'variant' not in ('confirm','suggest','schedule','reschedule') or p_input->>'mode' is null or p_input->>'mode' not in ('requested','other') then raise exception 'Invalid demo operation'; end if;
  if p_input->>'variant'='reschedule' and l.demo_status not in ('Scheduled','Rescheduled') then raise exception 'Confirm the demo first'; end if;
  v_at:=case when p_input->>'variant'='confirm' and p_input->>'mode'='requested' then l.preferred_at else (p_input->>'scheduledAt')::timestamptz end;
  if v_at is null or v_at<=now() then raise exception 'Choose a future demo time'; end if;
  v_local:=v_at at time zone 'Asia/Kolkata'; v_day:=v_local::date;
  v_slot:=(extract(hour from v_local)::integer*60+extract(minute from v_local)::integer-600)/30;
  if extract(second from v_local)<>0 or extract(minute from v_local)::integer%30<>0 or v_slot not between 0 and 17 then raise exception 'Choose a half-hour demo slot from 10:00–18:30 IST'; end if;
  select id into v_req from public.platform_demo_requests where lead_id=p_id order by
   case when status in ('Scheduled','Rescheduled') then 0 when status='Awaiting confirmation' then 1 else 2 end,created_at desc,id desc limit 1 for update;
  perform pg_advisory_xact_lock(hashtextextended('website-demo-day:'||v_day::text,0));
  if not(v_slot=any(app.website_demo_open_slots(v_day,v_req))) then raise exception 'Time unavailable. Choose another slot'; end if;
  v_status:=case when p_input->>'variant'='suggest' or (p_input->>'variant'='confirm' and p_input->>'mode'='other') then 'Awaiting confirmation'
   when p_input->>'variant'='reschedule' then 'Rescheduled' else 'Scheduled' end;
  if v_req is null then
   v_req:=gen_random_uuid();
   insert into public.platform_demo_requests(id,lead_id,payload,requested_date,time_index,requested_at,status,confirmed_at)
   values(v_req,p_id,'{}',v_day,v_slot,v_at,v_status,case when v_status<>'Awaiting confirmation' then v_at end);
  else
   update public.platform_demo_requests set status=v_status,requested_date=v_day,time_index=v_slot,requested_at=v_at,
    confirmed_at=case when v_status<>'Awaiting confirmation' then v_at else null end,updated_at=now() where id=v_req;
  end if;
  -- One current appointment per lead; release any obsolete reservations.
  update public.platform_demo_requests set status='Cancelled',updated_at=now() where lead_id=p_id and id<>v_req and status in ('Scheduled','Rescheduled','Awaiting confirmation');
  update public.platform_sales_leads set demo_status=v_status,preferred_at=v_at,demo_suggested=(v_status='Awaiting confirmation'),
   stage=case when v_status='Awaiting confirmation' then stage else 'demo_sched' end where id=p_id;
  v_kind:='demo'; v_title:=case when v_status='Awaiting confirmation' then 'Demo time suggested' else 'Demo '||lower(v_status) end;
 when 'setDemoStatus' then
  v_status:=p_input->>'status';
  if v_status is null or v_status not in ('Completed','No show','Cancelled') or l.demo_status is null then raise exception 'Invalid demo status'; end if;
  if v_status<>'Cancelled' and l.demo_status not in ('Scheduled','Rescheduled') then raise exception 'Confirm the demo first'; end if;
  update public.platform_demo_requests set status=v_status,updated_at=now() where lead_id=p_id and status in ('Awaiting confirmation','Scheduled','Rescheduled');
  update public.platform_sales_leads set demo_status=v_status,stage=case when stage='demo_sched' then 'followup' else stage end where id=p_id;
  v_title:='Demo '||lower(v_status); v_kind:=case when v_status='Completed' then 'check' else 'x' end;
 when 'reassign' then
  if not app.has_platform_permission('sales.reassign') then raise exception 'Not authorized to reassign' using errcode='42501'; end if;
  v_to:=(p_input->>'to')::uuid;
  if not exists(select 1 from public.platform_admins pa where pa.user_id=v_to and pa.status='active' and pa.revoked_at is null
   and pa.role in ('platform_owner','sales_manager','sales_rep') and (app.platform_admin_role()='platform_owner' or
   (pa.sales_team=(select me.sales_team from public.platform_admins me where me.user_id=auth.uid()) and nullif(pa.sales_team,'') is not null))) then
   raise exception 'Choose an active salesperson within your team' using errcode='42501'; end if;
  insert into public.platform_sales_assignments(lead_id,from_id,to_id,actor_id,note) values(p_id,l.owner,v_to,auth.uid(),v_note);
  update public.platform_sales_leads set owner=v_to where id=p_id;
  v_title:='Lead reassigned'; v_kind:='assign';
 when 'convert' then
  v_plan:=coalesce(p_input->>'plan','');
  if p_input->>'how'='link' then
   v_org:=(p_input->>'organizationId')::uuid;
   if not exists(select 1 from public.organizations where id=v_org) then raise exception 'Select an existing gym'; end if;
  elsif p_input->>'how'='invite' then
   if exists(select 1 from public.organizations o where regexp_replace(coalesce(o.contact_phone,''),'[^0-9]','','g') in
    (regexp_replace(l.phone,'[^0-9]','','g'),right(regexp_replace(l.phone,'[^0-9]','','g'),10)) or lower(o.contact_email::text)=lower(p_input->>'email')) then raise exception 'This owner already has a gym. Link the existing gym instead'; end if;
   v_invite:=app.sales_create_gym_owner_invitation(p_gym_name=>l.gym,p_owner_first_name=>coalesce(nullif(btrim(p_input->>'ownerName'),''),l.contact),
    p_owner_last_name=>'',p_email=>p_input->>'email',p_phone=>l.phone,p_city=>l.city,p_state=>l.state,p_postal_code=>l.pin,
    p_billing_mode=>'trial',p_trial_days=>14,p_notes=>'Sales conversion; expected plan: '||v_plan);
   v_org:=(v_invite->>'organization_id')::uuid;
  else raise exception 'Choose link or invite'; end if;
  if exists(select 1 from public.platform_sales_leads where organization_id=v_org and id<>p_id and deleted_at is null) then raise exception 'This gym is already linked to another lead'; end if;
  update public.platform_sales_leads set stage='converted',organization_id=v_org,converted_at=now(),converted_by=auth.uid(),expected_plan=v_plan,
   duplicate_of=null,possible_existing_lead=false,conversion=jsonb_build_object('plan',v_plan,'organizationId',v_org,'invitationId',v_invite->>'invitation_id',
    'org',(select name from public.organizations where id=v_org),'account',case when v_invite is not null then 'Invite pending' else
      coalesce((select case when s.status='cancelled' or s.current_period_end<=now() then 'Expired' when s.status='trialing' then 'Trial' else 'Active' end
       from public.organization_subscriptions s where s.organization_id=v_org),'No subscription') end) where id=p_id;
  update public.platform_sales_follow_ups set status='stopped' where lead_id=p_id and status='open';
  v_title:='Converted'; v_kind:='check';
 when 'closeLead' then
  v_stage:=case p_input->>'outcome' when 'Lost' then 'lost' when 'Not interested' then 'notint' when 'Follow up later' then 'later' end;
  if v_stage is null then raise exception 'Invalid outcome'; end if;
  if v_stage<>'later' and (p_input->>'reason' is null or p_input->>'reason' not in ('Pricing','Using competitor','Not ready','No response','Missing feature','Business closed','Other')) then raise exception 'Choose a reason'; end if;
  if v_stage<>'later' and p_input->>'reason'='Other' and v_note='' then raise exception 'Add a note for Other'; end if;
  update public.platform_sales_follow_ups set status='stopped' where lead_id=p_id and status='open';
  if v_stage='later' then
   v_at:=case p_input->>'revisit' when '2 weeks' then (current_date+14+time '10:00') at time zone 'Asia/Kolkata'
    when '1 month' then (current_date+time '10:00'+interval '1 month') at time zone 'Asia/Kolkata'
    when '3 months' then (current_date+time '10:00'+interval '3 months') at time zone 'Asia/Kolkata' end;
   if v_at is null then raise exception 'Choose a revisit date'; end if;
   insert into public.platform_sales_follow_ups(lead_id,type,due_at,note,actor_id) values(p_id,'Call',v_at,v_note,auth.uid());
  end if;
  update public.platform_sales_leads set stage=v_stage,lost_reason=case when v_stage<>'later' then p_input->>'reason' end,note=v_note where id=p_id;
  update public.platform_demo_requests set status='Cancelled',updated_at=now() where lead_id=p_id and status in ('Scheduled','Rescheduled','Awaiting confirmation');
  update public.platform_sales_leads set demo_status=case when demo_status in ('Scheduled','Rescheduled','Awaiting confirmation') then 'Cancelled' else demo_status end where id=p_id;
  v_title:=p_input->>'outcome'; v_kind:='x';
 when 'resolveDuplicate' then
  if p_input->>'mode'='separate' then
   if nullif(btrim(p_input->>'why'),'') is null then raise exception 'A reason is required'; end if;
   update public.platform_sales_leads set duplicate_of=null,possible_existing_lead=false where id=p_id;
   v_note:=p_input->>'why'; v_title:='Kept as a separate lead';
  elsif p_input->>'mode'='merge' then
   select * into e from public.platform_sales_leads where id=coalesce(l.duplicate_of,(app.sales_row(l)->>'duplicate_of')::uuid) and deleted_at is null for update;
   if not found or not app.sales_visible(e.owner) then raise exception 'Matching lead not found or access denied' using errcode='42501'; end if;
   if e.stage='converted' or l.stage='converted' then raise exception 'Converted leads cannot be merged'; end if;
   for v_lock in select distinct hashtextextended(k,0) from unnest(array[
    'platform-sales-phone:'||l.phone,'platform-sales-email:'||l.email,
    'platform-sales-phone:'||e.phone,'platform-sales-email:'||e.email]) k order by 1 loop
    perform pg_advisory_xact_lock(v_lock);
   end loop;
   update public.platform_sales_activities set lead_id=e.id where lead_id=p_id;
   update public.platform_sales_follow_ups set lead_id=e.id where lead_id=p_id;
   update public.platform_sales_assignments set lead_id=e.id where lead_id=p_id;
   update public.platform_demo_requests set status='Cancelled',updated_at=now() where lead_id=e.id and status in ('Scheduled','Rescheduled','Awaiting confirmation');
   update public.platform_demo_requests set lead_id=e.id where lead_id=p_id;
   update public.platform_sales_leads set
    gym=case when p_input#>>'{picks,gym}'='new' then l.gym else e.gym end,
    contact=case when p_input#>>'{picks,contact}'='new' then l.contact else e.contact end,
    email=case when p_input#>>'{picks,email}'='new' then l.email else e.email end,
    stage='demo_req',demo_status=l.demo_status,preferred_at=l.preferred_at,demo_suggested=l.demo_suggested,
    lost_reason=null,note=null,duplicate_of=null,possible_existing_lead=false,updated_at=now() where id=e.id;
   update public.platform_sales_leads set deleted_at=now(),duplicate_of=null,possible_existing_lead=false where id=p_id;
   update public.platform_sales_leads set duplicate_of=e.id where duplicate_of=p_id;
   v_result:=e.id; v_title:='Website demo request merged'; v_kind:='merge';
  else raise exception 'Choose merge or keep separate'; end if;
 when 'togglePriority' then
  update public.platform_sales_leads set priority=case priority when 'high' then 'normal' else 'high' end where id=p_id;
  v_title:='Priority changed';
 when 'reopen' then
  if l.stage not in ('later','notint','lost') then raise exception 'Only closed leads can be reopened'; end if;
  update public.platform_sales_leads set stage='followup',lost_reason=null where id=p_id;
  v_title:='Lead reopened'; v_kind:='swap';
 else raise exception 'Unknown sales command';
 end case;
 update public.platform_sales_leads set updated_at=now() where id=v_result;
 insert into public.platform_sales_activities(lead_id,kind,title,detail,actor_id)
 values(v_result,v_kind,v_title,p_input||jsonb_build_object('note',v_note,'original_lead_id',p_id),auth.uid());
 perform app.write_admin_audit('sales.'||p_command,'sales_lead',p_id::text,to_jsonb(l),
  (select to_jsonb(n) from public.platform_sales_leads n where n.id=v_result),jsonb_build_object('result_lead_id',v_result));
 return jsonb_build_object('leadId',v_result,'invitation',v_invite);
end $$;

create function public.admin_sales_organizations(p_lead_id uuid,p_search text default '') returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare l public.platform_sales_leads%rowtype;
begin
 select * into l from public.platform_sales_leads where id=p_lead_id and deleted_at is null;
 if not found or not app.sales_visible(l.owner) then raise exception 'Lead not found or access denied' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(to_jsonb(x)) from (select o.id,o.name,o.city,o.created_at,
  case when s.organization_id is null or s.status='cancelled' or s.current_period_end<=now() then 'Expired' when s.status='trialing' then 'Trial' else 'Active' end status,
  right(regexp_replace(coalesce(o.contact_phone,''),'[^0-9]','','g'),10)=right(regexp_replace(l.phone,'[^0-9]','','g'),10) phone_match
 from public.organizations o left join public.organization_subscriptions s on s.organization_id=o.id
 where o.name ilike '%'||left(p_search,160)||'%' or regexp_replace(coalesce(o.contact_phone,''),'[^0-9]','','g') like '%'||nullif(regexp_replace(p_search,'[^0-9]','','g'),'')||'%'
 order by phone_match desc,o.name limit 30) x),'[]');
end $$;

-- Narrow team-management entry point. Existing admin role/lifecycle UI remains authoritative.
create function public.admin_sales_snapshot(p_scope text default 'my',p_team text default null,
 p_filters jsonb default '{}',p_search text default '',p_attention boolean default false,
 p_period text default '90',p_limit integer default 100,p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp set timezone='Asia/Kolkata' as $$
declare v jsonb; v_since timestamptz;
begin
 if not app.has_platform_permission('sales.view') then raise exception 'Not authorized' using errcode='42501'; end if;
 if p_scope is null or p_scope not in ('my','team','all') or
  (p_scope='all' and app.platform_admin_role()<>'platform_owner') or
  (p_scope='team' and app.platform_admin_role() not in ('platform_owner','sales_manager')) then raise exception 'Invalid sales scope' using errcode='42501'; end if;
 if p_period is null or p_period not in ('30','90','year') then raise exception 'Invalid period'; end if;
 v_since:=case p_period when 'year' then date_trunc('year',now()) when '30' then now()-interval '30 days' else now()-interval '90 days' end;
 with scoped as materialized (select l.*,app.sales_row(l) row from public.platform_sales_leads l
  where l.deleted_at is null and app.sales_in_scope(l.owner,p_scope,p_team)),
 filtered as (select s.* from scoped s where
  (not coalesce(p_attention,false) or jsonb_array_length(s.row->'attention')>0)
  and (coalesce(p_search,'')='' or concat_ws(' ',s.gym,s.contact,s.email) ilike '%'||left(p_search,160)||'%'
   or regexp_replace(s.phone,'[^0-9]','','g') like '%'||nullif(regexp_replace(p_search,'[^0-9]','','g'),'')||'%')
  and (coalesce(p_filters->>'owner','')='' or s.owner::text=p_filters->>'owner')
  and (coalesce(p_filters->>'stage','')='' or s.stage=p_filters->>'stage')
  and (coalesce(p_filters->>'source','')='' or s.source=p_filters->>'source')
  and (coalesce(p_filters->>'state','')='' or coalesce(nullif(s.state,''),'Unspecified')=p_filters->>'state')
  and (coalesce(p_filters->>'city','')='' or coalesce(nullif(s.city,''),'Unspecified')=p_filters->>'city')
  and (coalesce(p_filters->>'area','')='' or coalesce(nullif(s.area,''),'Unspecified') ilike '%'||(p_filters->>'area')||'%')
  and (coalesce(p_filters->>'pin','')='' or coalesce(nullif(s.pin,''),'Unspecified') like (p_filters->>'pin')||'%')
  and (coalesce(p_filters->>'priority','')='' or s.priority=p_filters->>'priority')
  and (coalesce(p_filters->>'range','')='' or s.created_at::date>=current_date-(p_filters->>'range')::integer)
  and (coalesce(p_filters->>'trial','')='' or s.stage='trial' and s.trial_ends_at is not null and
    (p_filters->>'trial'='active' or s.trial_ends_at::date-current_date<=3))
  and (coalesce(p_filters->>'demo','')='' or case when p_filters->>'demo'='requested' then s.stage='demo_req' else lower(s.demo_status)=p_filters->>'demo' end)
  and (coalesce(p_filters->>'followUp','')='' or case p_filters->>'followUp'
    when 'none' then s.row->>'next_follow_up' is null
    when 'overdue' then (s.row#>>'{next_follow_up,due_at}')::timestamptz<now()
    when 'today' then (s.row#>>'{next_follow_up,due_at}')::timestamptz>=now() and (s.row#>>'{next_follow_up,due_at}')::timestamptz::date=current_date
    when 'upcoming' then (s.row#>>'{next_follow_up,due_at}')::timestamptz::date>current_date else false end)),
 report as materialized(select * from scoped where created_at>=v_since),
 page as (select row from filtered order by created_at desc,id limit greatest(1,least(coalesce(p_limit,100),200)) offset greatest(coalesce(p_offset,0),0)),
 roster as (select pa.user_id id,coalesce(nullif(u.raw_user_meta_data->>'full_name',''),u.email,pa.user_id::text) name,
  pa.role,pa.sales_team team,(pa.status='active' and pa.revoked_at is null and pa.role in ('platform_owner','sales_manager','sales_rep')) assignable
  from public.platform_admins pa join auth.users u on u.id=pa.user_id
  where pa.user_id=auth.uid() or (app.platform_admin_role()='platform_owner' and pa.role in ('platform_owner','sales_manager','sales_rep'))
  or (app.platform_admin_role()='sales_manager' and pa.sales_team=(select me.sales_team from public.platform_admins me where me.user_id=auth.uid()))
  or pa.user_id in(select owner from scoped) or pa.user_id in(select a.actor_id from public.platform_sales_activities a join scoped s on s.id=a.lead_id))
 select jsonb_build_object(
  'me',auth.uid(),'role',app.platform_admin_role(),'users',coalesce((select jsonb_agg(to_jsonb(u)) from roster u),'[]'),
  'leads',coalesce((select jsonb_agg(row) from page),'[]'),'total',(select count(*) from filtered),
  'summary',jsonb_build_object('total',(select count(*) from scoped),'new',(select count(*) from scoped where stage='new'),
    'due',(select count(*) from scoped where stage not in ('converted','later','notint','lost') and (row#>>'{next_follow_up,due_at}')::timestamptz::date<=current_date),
    'overdue',(select count(*) from scoped where scoped.row->'attention' ? 'overdue'),
    'demos',(select count(*) from scoped where stage='demo_sched'),'trials',(select count(*) from scoped where stage='trial' and trial_ends_at>now()),
    'converted',(select count(*) from scoped where stage='converted')),
  'attentionCount',(select count(*) from scoped where jsonb_array_length(scoped.row->'attention')>0),
  'coverage',coalesce((select jsonb_agg(to_jsonb(c)) from (select state,city,area,pin,count(*) identified,
    count(*) filter(where last_contacted_at is not null) contacted,count(*) filter(where stage='trial' and trial_ends_at>now()) trials,
    count(*) filter(where stage='converted') customers from scoped group by state,city,area,pin) c),'[]'),
  'report',jsonb_build_object('total',(select count(*) from report),'converted',(select count(*) from report where stage='converted'),
    'demoCompleted',(select count(*) from report where demo_status='Completed'),
    'demoTrials',(select count(*) from report where demo_status='Completed' and trial_started_at is not null),
    'trials',(select count(*) from report where trial_started_at is not null),
    'trialPaid',(select count(*) from report r join public.organization_subscriptions s on s.organization_id=r.organization_id
      where r.trial_started_at is not null and r.stage='converted' and s.status='active' and s.current_period_end>now()),
    'avgDays',(select round(avg(extract(epoch from converted_at-coalesce(first_contacted_at,created_at))/86400)::numeric,1) from report where converted_at is not null),
    'stages',coalesce((select jsonb_agg(to_jsonb(x)) from (select stage,count(*) n from report group by stage) x),'[]'),
    'lostReasons',coalesce((select jsonb_agg(to_jsonb(x)) from (select lost_reason reason,count(*) n from report where stage in ('notint','lost') group by lost_reason) x),'[]'),
    'followUps',jsonb_build_object('done',(select count(*) from public.platform_sales_follow_ups f join scoped s on s.id=f.lead_id where f.status='done' and f.completed_at>=date_trunc('month',now())),
      'overdue',(select count(*) from public.platform_sales_follow_ups f join scoped s on s.id=f.lead_id where f.status='open' and f.due_at<now() and f.due_at>=date_trunc('month',now()))),
    'sources',coalesce((select jsonb_agg(to_jsonb(x)) from (select source,count(*) leads,count(*) filter(where demo_status is not null) demos,count(*) filter(where stage='converted') converted from report group by source) x),'[]'),
    'people',coalesce((select jsonb_agg(to_jsonb(x)) from (select r.owner,count(*) leads,count(*) filter(where stage='converted') converted,
      (select count(*) from public.platform_sales_follow_ups f join report s on s.id=f.lead_id where s.owner=r.owner and f.status='done' and f.completed_at>=v_since) done,
      (select count(*) from public.platform_sales_follow_ups f join report s on s.id=f.lead_id where s.owner=r.owner and f.status='open' and f.due_at<now()) overdue
      from report r group by r.owner) x),'[]'))
 ) into v;
 return v;
end $$;

create function public.admin_sales_get_team(p_user_id uuid) returns text language plpgsql stable security definer
set search_path=public,pg_temp as $$
begin
 if not app.has_platform_permission('admins.view') then raise exception 'Not authorized' using errcode='42501'; end if;
 return (select sales_team from public.platform_admins where user_id=p_user_id);
end $$;
create function public.admin_sales_set_team(p_user_id uuid,p_team text) returns void language plpgsql security definer
set search_path=public,pg_temp as $$
begin
 if not app.has_platform_permission('admins.manage') then raise exception 'Not authorized' using errcode='42501'; end if;
 if length(coalesce(p_team,''))>80 then raise exception 'Team name is too long'; end if;
 update public.platform_admins set sales_team=nullif(btrim(p_team),'') where user_id=p_user_id;
 if not found then raise exception 'Admin not found'; end if;
 perform app.write_admin_audit('sales.team_changed','platform_admin',p_user_id::text,null,jsonb_build_object('team',p_team));
end $$;

revoke all on function app.sales_visible(uuid),app.sales_in_scope(uuid,text,text),app.sales_attention(public.platform_sales_leads),app.sales_row(public.platform_sales_leads) from public,anon,authenticated;
revoke all on function public.admin_sales_command(uuid,text,jsonb),public.admin_sales_lead_detail(uuid),public.admin_sales_attention_count(),public.admin_sales_organizations(uuid,text),public.admin_sales_set_team(uuid,text) from public,anon,authenticated;
grant execute on function public.admin_sales_command(uuid,text,jsonb),public.admin_sales_lead_detail(uuid),public.admin_sales_attention_count(),public.admin_sales_organizations(uuid,text),public.admin_sales_set_team(uuid,text) to authenticated;
revoke all on function public.admin_sales_snapshot(text,text,jsonb,text,boolean,text,integer,integer) from public,anon,authenticated;
grant execute on function public.admin_sales_snapshot(text,text,jsonb,text,boolean,text,integer,integer) to authenticated;
revoke all on function public.admin_sales_get_team(uuid) from public,anon,authenticated;
grant execute on function public.admin_sales_get_team(uuid) to authenticated;
-- Preserve 1021 idempotency and capacity; returning requests get manual CRM review.
create or replace function public.submit_website_demo(p_id uuid, p_payload jsonb, p_date date, p_time_index integer)
returns jsonb language plpgsql security invoker
set search_path = public, pg_temp set timezone = 'Asia/Kolkata' as $$
declare
  v_lead uuid; v_matches uuid[]; v_returning boolean; v_at timestamptz;
  v_existing public.platform_demo_requests%rowtype; v_lock bigint;
begin
  if p_id is null or p_payload is null or p_date is null or p_time_index is null
    or p_time_index not between 0 and 17
    or (p_payload->>'phone') is null or (p_payload->>'phone') !~ '^\+91[6-9][0-9]{9}$'
    or (p_payload->>'email') is null or (p_payload->>'email') <> lower(btrim(p_payload->>'email'))
    or length(coalesce(p_payload->>'message','')) > 1000 then
    raise exception 'Invalid request' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('website-demo-request:' || p_id::text, 0));
  select r.* into v_existing from public.platform_demo_requests r where r.id = p_id;
  if found then
    if v_existing.payload <> p_payload or v_existing.requested_date <> p_date or v_existing.time_index <> p_time_index then
      raise exception 'Invalid request' using errcode = '22023';
    end if;
    return jsonb_build_object('returning', v_existing.is_returning, 'created', false);
  end if;
  -- Same day lock as staff confirmation. Requests don't consume capacity.
  perform pg_advisory_xact_lock(hashtextextended('website-demo-day:' || p_date::text, 0));
  if p_date <= (now() at time zone 'Asia/Kolkata')::date or p_date > (now() at time zone 'Asia/Kolkata')::date + 30
    or not (p_time_index = any(app.website_demo_open_slots(p_date))) then
    raise exception 'Time unavailable' using errcode = 'P0002';
  end if;
  for v_lock in select distinct hashtextextended(k, 0) from unnest(array[
    'platform-sales-phone:' || (p_payload->>'phone'), 'platform-sales-email:' || (p_payload->>'email')]) k order by 1 loop
    perform pg_advisory_xact_lock(v_lock);
  end loop;
  select array_agg(l.id order by (l.phone = p_payload->>'phone') desc, l.created_at, l.id)
    into v_matches from public.platform_sales_leads l
    where l.deleted_at is null and (l.phone = p_payload->>'phone' or l.email = p_payload->>'email');
  v_returning := coalesce(cardinality(v_matches),0) > 0;
  v_at := (p_date + time '10:00' + p_time_index * interval '30 minutes') at time zone 'Asia/Kolkata';
  -- Keep each returning request reviewable until staff resolve its match.
  insert into public.platform_sales_leads(gym,contact,phone,email,city,state,branches,members,owner,demo_status,preferred_at,duplicate_of,possible_existing_lead)
  values (p_payload->>'gym',p_payload->>'name',p_payload->>'phone',p_payload->>'email',p_payload->>'city',
    p_payload->>'state',p_payload->>'branches',p_payload->>'members',app.assign_website_demo_owner(),'Awaiting confirmation',v_at,
    case when v_returning then v_matches[1] end,v_returning)
  returning id into v_lead;
  insert into public.platform_sales_assignments(lead_id,to_id,note)
  select v_lead,owner,'Website demo auto-assignment' from public.platform_sales_leads where id=v_lead;
  insert into public.platform_demo_requests(id,lead_id,payload,requested_date,time_index,requested_at,is_returning)
    values(p_id,v_lead,p_payload,p_date,p_time_index,v_at,v_returning);
  insert into public.platform_sales_activities(lead_id,kind,title,detail)
    values(v_lead,'demo',case when v_returning then 'Demo requested · Possible existing lead' else 'Website demo requested' end,
      jsonb_build_object('request_id',p_id,'requested_at',v_at,'message',p_payload->>'message','matching_lead_ids',v_matches));
  return jsonb_build_object('returning',v_returning,'created',true);
end;
$$;
revoke all on function public.submit_website_demo(uuid,jsonb,date,integer) from public, anon, authenticated;
grant execute on function public.submit_website_demo(uuid,jsonb,date,integer) to service_role;


commit;
