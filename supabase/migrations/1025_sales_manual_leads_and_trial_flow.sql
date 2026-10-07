-- Manual CRM entry and trial gym creation. Extends the shared 1021-1023 store.
-- Additive schema/functions only: no backfill or updates to existing customers.
-- Apply after 1023. Production rollout uses the pre-migration backup procedure.
begin;

alter table public.platform_sales_leads add column created_by uuid references auth.users(id);
alter table public.platform_sales_leads drop constraint platform_sales_leads_email_check,
  drop constraint platform_sales_leads_branches_check, drop constraint platform_sales_leads_members_check;
alter table public.platform_sales_leads
  add constraint platform_sales_leads_email_check check (
    (source in ('WhatsApp','Field visit','Cold call','Referral','Instagram','Google') and email='')
    or (email=lower(btrim(email)) and length(email) between 3 and 254)),
  add constraint platform_sales_leads_branches_check check (
    (source in ('WhatsApp','Field visit','Cold call','Referral','Instagram','Google') and branches='Unknown')
    or branches in ('1','2–3','4–10','10+')),
  add constraint platform_sales_leads_members_check check (
    (source in ('WhatsApp','Field visit','Cold call','Referral','Instagram','Google') and members='Unknown')
    or members in ('Under 100','100–300','300–600','600–1,000','1,000+'));

create function public.admin_sales_create_lead(p_id uuid,p_input jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare l public.platform_sales_leads%rowtype; v_matches uuid[]; v_key text;
  v_phone text:=btrim(coalesce(p_input->>'phone',''));
  v_email text:=lower(btrim(coalesce(p_input->>'email','')));
  v_source text:=p_input->>'source';
begin
  if auth.uid() is null or not app.has_platform_permission('sales.manage') then
    raise exception 'Not authorized' using errcode='42501';
  end if;
  if p_id is null or p_input is null or jsonb_typeof(p_input)<>'object' or length(p_input::text)>12000 then
    raise exception 'Invalid lead details';
  end if;
  if v_source is null or v_source not in ('Field visit','Cold call','Referral','Instagram','Google','WhatsApp')
    or v_phone !~ '^\+91[6-9][0-9]{9}$'
    or (v_email<>'' and (length(v_email)>254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'))
    or length(btrim(coalesce(p_input->>'gym',''))) not between 1 and 160
    or length(btrim(coalesce(p_input->>'contact',''))) not between 1 and 100
    or length(btrim(coalesce(p_input->>'city',''))) not between 1 and 120
    or length(btrim(coalesce(p_input->>'state',''))) not between 1 and 120
    or length(coalesce(p_input->>'area',''))>160 or coalesce(p_input->>'pin','') !~ '^(\d{6})?$'
    or length(coalesce(p_input->>'note',''))>5000 then raise exception 'Check the lead contact and location details'; end if;
  perform pg_advisory_xact_lock(hashtextextended('sales-manual-request:'||p_id,0));
  select * into l from public.platform_sales_leads where id=p_id;
  if found then
    if l.created_by is distinct from auth.uid() or l.deleted_at is not null or not app.sales_visible(l.owner) then
      raise exception 'Request unavailable; refresh and try again' using errcode='42501';
    end if;
    return jsonb_build_object('leadId',l.id,'existing',false);
  end if;
  for v_key in select k from unnest(array['platform-sales-phone:'||v_phone,
    case when v_email<>'' then 'platform-sales-email:'||v_email end]) k where k is not null order by k loop
    perform pg_advisory_xact_lock(hashtextextended(v_key,0));
  end loop;
  select array_agg(id order by created_at,id) into v_matches from public.platform_sales_leads
    where deleted_at is null and duplicate_of is null and (phone=v_phone or (v_email<>'' and email=v_email));
  if cardinality(v_matches)>1 then raise exception 'Multiple contact matches exist. Ask a manager to resolve them before adding this lead'; end if;
  if cardinality(v_matches)=1 then
    select * into l from public.platform_sales_leads where id=v_matches[1];
    if not app.sales_visible(l.owner) then raise exception 'This contact already has a lead outside your scope. Ask your manager to review it' using errcode='42501'; end if;
    return jsonb_build_object('leadId',l.id,'existing',true);
  end if;
  insert into public.platform_sales_leads(id,gym,contact,phone,email,city,state,area,pin,branches,members,source,stage,owner,created_by,note)
  values(p_id,btrim(p_input->>'gym'),btrim(p_input->>'contact'),v_phone,v_email,btrim(p_input->>'city'),btrim(p_input->>'state'),
    btrim(coalesce(p_input->>'area','')),btrim(coalesce(p_input->>'pin','')),coalesce(p_input->>'branches','Unknown'),
    coalesce(p_input->>'members','Unknown'),v_source,'new',auth.uid(),auth.uid(),nullif(btrim(coalesce(p_input->>'note','')),'')) returning * into l;
  insert into public.platform_sales_activities(lead_id,kind,title,detail,actor_id)
    values(l.id,'created','Lead added manually',jsonb_build_object('source',v_source,'note',l.note),auth.uid());
  insert into public.platform_sales_assignments(lead_id,to_id,actor_id,note)
    values(l.id,auth.uid(),auth.uid(),'Assigned to the person adding the lead');
  perform app.write_admin_audit('sales.createLead','sales_lead',l.id::text,null,to_jsonb(l),jsonb_build_object('source',v_source));
  return jsonb_build_object('leadId',l.id,'existing',false);
end $$;
revoke all on function public.admin_sales_create_lead(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.admin_sales_create_lead(uuid,jsonb) to authenticated;

-- The complete replacement of admin_sales_command follows. Other commands
-- retain their existing permission, validation, transaction and audit behavior.

create or replace function public.admin_sales_command(p_id uuid,p_command text,p_input jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=public,pg_temp set timezone='Asia/Kolkata' as $$
declare l public.platform_sales_leads%rowtype; e public.platform_sales_leads%rowtype;
 v_stage text; v_title text; v_kind text:='note'; v_to uuid; v_at timestamptz; v_req uuid;
 v_day date; v_local timestamp; v_slot integer; v_status text; v_org uuid; v_invite jsonb;
 v_subscription public.organization_subscriptions%rowtype; v_lock bigint; v_result uuid:=p_id; v_note text:=btrim(coalesce(p_input->>'note','')); v_plan text;
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
  if v_stage='trial' then raise exception 'Create or link a gym account through the trial flow'; end if;
  update public.platform_sales_leads set stage=v_stage where id=p_id;
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
  if l.stage in ('later','notint','lost') then raise exception 'Reopen the lead first'; end if;
  if l.duplicate_of is not null or l.possible_existing_lead then raise exception 'Resolve the duplicate lead before creating or linking a gym'; end if;
  v_plan:=coalesce(p_input->>'plan','');
  if length(v_plan)>160 then raise exception 'Expected plan is too long'; end if;
  if p_input->>'how'='paid' then
   v_org:=l.organization_id;
   if v_org is null then raise exception 'Create or link the gym first'; end if;
  elsif p_input->>'how'='link' then
   v_org:=(p_input->>'organizationId')::uuid;
   if v_org is null or not exists(select 1 from public.organizations where id=v_org) then raise exception 'Select an existing gym'; end if;
   if l.organization_id is not null and l.organization_id<>v_org then raise exception 'This lead is already linked to another gym'; end if;
  elsif p_input->>'how'='invite' then
   if l.organization_id is not null then raise exception 'This lead already has a gym account. Use its linked account'; end if;
   if exists(select 1 from public.organizations o where regexp_replace(coalesce(o.contact_phone,''),'[^0-9]','','g') in
    (regexp_replace(l.phone,'[^0-9]','','g'),right(regexp_replace(l.phone,'[^0-9]','','g'),10)) or lower(o.contact_email::text)=lower(p_input->>'email')) then raise exception 'This owner already has a gym. Link the existing gym instead'; end if;
   if nullif(btrim(p_input->>'email'),'') is null or p_input->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Enter a valid owner email before creating a gym'; end if;
   v_invite:=app.sales_create_gym_owner_invitation(p_gym_name=>l.gym,p_owner_first_name=>coalesce(nullif(btrim(p_input->>'ownerName'),''),l.contact),
    p_owner_last_name=>'',p_email=>lower(btrim(p_input->>'email')),p_phone=>l.phone,p_city=>l.city,p_state=>l.state,p_postal_code=>l.pin,
    p_billing_mode=>'trial',p_trial_days=>14,p_notes=>'CRM trial account; expected plan: '||v_plan);
   v_org:=(v_invite->>'organization_id')::uuid;
  else raise exception 'Choose create, link or paid conversion'; end if;
  if exists(select 1 from public.platform_sales_leads where organization_id=v_org and id<>p_id and deleted_at is null) then raise exception 'This gym is already linked to another lead'; end if;
  select * into v_subscription from public.organization_subscriptions where organization_id=v_org;
  if not found or v_subscription.current_period_end is null or v_subscription.current_period_end<=now() or v_subscription.status not in ('trialing','active') then raise exception 'The gym needs an active trial or paid subscription'; end if;
  if exists(select 1 from public.organizations where id=v_org and (suspended_at is not null or deletion_requested_at is not null)) then raise exception 'The gym is suspended or pending deletion'; end if;
  if v_subscription.status='trialing' then
   if p_input->>'how'='paid' then raise exception 'This gym is still on trial. An active paid subscription is required to convert'; end if;
   if v_subscription.current_period_start is null then raise exception 'The gym trial start date is missing'; end if;
   v_stage:='trial'; v_title:=case when v_invite is not null then 'Trial gym created; owner invited' else 'Existing trial gym linked' end; v_kind:='trial';
  else
   if v_subscription.package_id is null then raise exception 'An active paid plan is required to record a paid conversion'; end if;
   v_stage:='converted'; v_title:='Converted to paid customer'; v_kind:='check';
  end if;
  update public.platform_sales_leads set stage=v_stage,organization_id=v_org,expected_plan=v_plan,
   email=case when email='' and v_invite is not null then lower(btrim(p_input->>'email')) else email end,
   trial_started_at=case when v_stage='trial' then v_subscription.current_period_start else trial_started_at end,
   trial_ends_at=case when v_stage='trial' then v_subscription.current_period_end else trial_ends_at end,
   converted_at=case when v_stage='converted' then now() end,converted_by=case when v_stage='converted' then auth.uid() end,
   conversion=jsonb_build_object('plan',v_plan,'organizationId',v_org,'invitationId',coalesce(v_invite->>'invitation_id',l.conversion->>'invitationId'),
    'org',(select name from public.organizations where id=v_org),'account',case when v_stage='trial' then 'Trial' else 'Active paid' end)
   where id=p_id;
  if v_stage='converted' then update public.platform_sales_follow_ups set status='stopped' where lead_id=p_id and status='open'; end if;
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

revoke all on function public.admin_sales_command(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.admin_sales_command(uuid,text,jsonb) to authenticated;
commit;
