-- Managed-number platform inbox. Apply after 1021, 1022 and platform settings.
-- DEV: manual SQL Editor apply. PROD: explicit approval required.
-- No tenant billing writes; no member message content is retained.
begin;

-- WhatsApp-only leads can be incomplete. Keep website validation intact and
-- represent missing contact/profile fields honestly instead of inventing them.
alter table public.platform_sales_leads drop constraint platform_sales_leads_email_check,
 drop constraint platform_sales_leads_city_check, drop constraint platform_sales_leads_branches_check,
 drop constraint platform_sales_leads_members_check;
alter table public.platform_sales_leads
 add constraint platform_sales_leads_email_check check((source='WhatsApp' and email='') or (email=lower(btrim(email)) and length(email) between 3 and 254)),
 add constraint platform_sales_leads_city_check check((source='WhatsApp' and city='') or length(city) between 1 and 120),
 add constraint platform_sales_leads_branches_check check((source='WhatsApp' and branches='Unknown') or branches in ('1','2–3','4–10','10+')),
 add constraint platform_sales_leads_members_check check((source='WhatsApp' and members='Unknown') or members in ('Under 100','100–300','300–600','600–1,000','1,000+'));

create table public.platform_wa_conversations (
 id uuid primary key default gen_random_uuid(),
 phone_e164 text not null unique check(phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
 profile_name text, display_name text,
 organization_id uuid references public.organizations(id),
 lead_id uuid references public.platform_sales_leads(id),
 assignee_id uuid references public.platform_admins(user_id),
 status text not null default 'open' check(status in ('open','closed')),
 archived_at timestamptz, blocked_at timestamptz,
 last_inbound_at timestamptz, last_message_at timestamptz not null default now(),
 last_message_preview text not null default '', unread_count integer not null default 0 check(unread_count>=0),
 note text not null default '' check(length(note)<=5000), note_version integer not null default 0,
 created_at timestamptz not null default now()
);
create index platform_wa_list_idx on public.platform_wa_conversations(last_message_at desc,id desc) where archived_at is null and blocked_at is null;
create index platform_wa_assignee_idx on public.platform_wa_conversations(assignee_id);
create index platform_wa_status_idx on public.platform_wa_conversations(status);
create table public.platform_wa_messages (
 id uuid primary key default gen_random_uuid(), conversation_id uuid not null references public.platform_wa_conversations(id),
 direction text not null check(direction in ('in','out')), meta_message_id text unique,
 type text not null default 'text', body text not null check(length(body)<=4096),
 template_name text, template_language text,
 source text not null default 'manual' check(source in ('manual','auto','ai')),
 sent_by uuid references auth.users(id), status text not null check(status in ('sending','sent','delivered','read','failed')),
 error_code text, error_message text, client_ref uuid unique, attempt_id uuid,
 created_at timestamptz not null default now(), sent_at timestamptz, delivered_at timestamptz, read_at timestamptz,
 search_document tsvector generated always as (to_tsvector('simple',body)) stored
);
create index platform_wa_thread_idx on public.platform_wa_messages(conversation_id,created_at desc,id desc);
create index platform_wa_message_search_idx on public.platform_wa_messages using gin(search_document);
create table public.platform_wa_events (
 id uuid primary key default gen_random_uuid(), conversation_id uuid not null references public.platform_wa_conversations(id),
 kind text not null, actor_id uuid references auth.users(id), target_id uuid,
 created_at timestamptz not null default now()
);
create index platform_wa_events_thread_idx on public.platform_wa_events(conversation_id,created_at desc,id desc);
-- Deliberately empty. Enable only reviewed PLATFORM templates, never the gym reminder catalogue.
create table public.platform_wa_template_allowlist (
 name text not null, language text not null, enabled boolean not null default true,
 primary key(name,language)
);
do $$declare t text;begin
 foreach t in array array['platform_wa_conversations','platform_wa_messages','platform_wa_events','platform_wa_template_allowlist'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('alter table public.%I force row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant all on public.%I to service_role',t);
 end loop;
end$$;

create function app.wa_phone(p text) returns text language sql immutable set search_path='' as $$
 select case when length(v)=10 and v ~ '^[6-9]' then '+91'||v when v ~ '^[1-9][0-9]{7,14}$' then '+'||v else null end
 from (select regexp_replace(p,'[^0-9]','','g') v) s
$$;
create index platform_wa_member_reply_phone_idx on public.whatsapp_messages(app.wa_phone(phone_number_e164))
 where sender_mode='managed' and direction='outbound';
create index platform_wa_member_contact_phone_idx on public.members(app.wa_phone(phone_e164)) where deleted_at is null;
create index platform_wa_staff_contact_phone_idx on public.staff_memberships(app.wa_phone(phone_e164)) where deletion_requested_at is null;
create function app.wa_row(c public.platform_wa_conversations) returns jsonb language sql stable set search_path='' as $$
 select to_jsonb(c)||jsonb_build_object('name',coalesce(c.display_name,l.contact,o.name),
 'org',coalesce(l.gym,o.name,''),'crm',case when l.id is null then null else jsonb_build_object('id',l.id,'lead',l.gym,'stage',l.stage) end,
 'window_ends_at',c.last_inbound_at+interval '24 hours')
 from (select 1) s left join public.platform_sales_leads l on l.id=c.lead_id and l.deleted_at is null
 left join public.organizations o on o.id=c.organization_id
$$;

create function public.admin_wa_bootstrap() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not app.has_platform_permission('whatsapp.view') then raise exception 'Not authorized' using errcode='42501';end if;
 return jsonb_build_object('team',coalesce((select jsonb_agg(jsonb_build_object('id',a.user_id,'name',coalesce(nullif(u.raw_user_meta_data->>'full_name',''),u.email,'Platform admin')) order by u.email)
 from public.platform_admins a join auth.users u on u.id=a.user_id
 where a.status='active' and a.revoked_at is null and exists(select 1 from public.platform_role_permissions r where r.role=a.role and r.permission='whatsapp.manage')),'[]'::jsonb),
 'allowed_templates',coalesce((select jsonb_agg(jsonb_build_object('name',name,'language',language)) from public.platform_wa_template_allowlist where enabled),'[]'::jsonb));
end$$;
create function public.admin_wa_conversations(p_filter text default 'all',p_search text default '',p_limit integer default 50,p_before jsonb default null,p_selected uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; q text:=btrim(coalesce(p_search,'')); digits text:=regexp_replace(q,'[^0-9]','','g');begin
 if not app.has_platform_permission('whatsapp.view') then raise exception 'Not authorized' using errcode='42501';end if;
 if p_filter not in ('all','unread','open','closed','unassigned') or length(q)>160 or p_limit not between 1 and 100 then raise exception 'Invalid filters';end if;
 with matching as (
 select c.* from public.platform_wa_conversations c left join public.platform_sales_leads l on l.id=c.lead_id
 left join public.organizations o on o.id=c.organization_id
 where c.archived_at is null and c.blocked_at is null
 and (p_filter='all' or (p_filter='unread' and (c.unread_count>0 or c.id=p_selected)) or (p_filter=c.status) or (p_filter='unassigned' and c.assignee_id is null))
 and (q='' or position(lower(q) in lower(concat_ws(' ',c.display_name,c.profile_name,l.contact,l.gym,o.name)))>0
 or (digits<>'' and position(digits in c.phone_e164)>0)
 or c.id in (select m.conversation_id from public.platform_wa_messages m where m.search_document @@ plainto_tsquery('simple',q)))
 and (p_before is null or (c.last_message_at,c.id)<((p_before->>'at')::timestamptz,(p_before->>'id')::uuid))
 order by c.last_message_at desc,c.id desc limit p_limit+1), page as (select * from matching order by last_message_at desc,id desc limit p_limit)
 select jsonb_build_object('rows',coalesce((select jsonb_agg(app.wa_row(p::public.platform_wa_conversations) order by p.last_message_at desc,p.id desc) from page p),'[]'::jsonb),
 'has_more',(select count(*)>p_limit from matching),
 'counts',(select jsonb_build_object('total',count(*),'open',count(*) filter(where status='open'),'unread',count(*) filter(where unread_count>0)) from public.platform_wa_conversations where archived_at is null and blocked_at is null)) into result;
 return result;
end$$;
create function public.admin_wa_messages(p_conversation_id uuid,p_before jsonb default null,p_limit integer default 60)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c public.platform_wa_conversations; result jsonb;begin
 if not app.has_platform_permission('whatsapp.view') then raise exception 'Not authorized' using errcode='42501';end if;
 if p_limit not between 1 and 100 then raise exception 'Invalid page size';end if;
 select * into strict c from public.platform_wa_conversations where id=p_conversation_id and blocked_at is null;
 with timeline as (
 select m.id,m.created_at,to_jsonb(m)||jsonb_build_object('kind',m.direction,'by',coalesce(u.raw_user_meta_data->>'full_name',u.email,'Platform admin')) item
 from public.platform_wa_messages m left join auth.users u on u.id=m.sent_by where m.conversation_id=c.id
 union all
 select e.id,e.created_at,jsonb_build_object('id',e.id,'created_at',e.created_at,'kind','sys','event',e.kind,
 'actor',coalesce(u.raw_user_meta_data->>'full_name',u.email,'Platform admin'),'target',coalesce(t.raw_user_meta_data->>'full_name',t.email))
 from public.platform_wa_events e left join auth.users u on u.id=e.actor_id left join auth.users t on t.id=e.target_id where e.conversation_id=c.id),
 matching as (select * from timeline where p_before is null or (created_at,id)<((p_before->>'at')::timestamptz,(p_before->>'id')::uuid) order by created_at desc,id desc limit p_limit+1),
 page as (select * from matching order by created_at desc,id desc limit p_limit)
 select jsonb_build_object('conversation',app.wa_row(c),'items',coalesce((select jsonb_agg(item order by created_at,id) from page),'[]'::jsonb),
 'has_more',(select count(*)>p_limit from matching),'before',(select jsonb_build_object('at',created_at,'id',id) from page order by created_at,id limit 1)) into result;
 return result;
end$$;

create function public.admin_wa_hidden(p_limit integer default 50,p_before jsonb default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not app.has_platform_permission('whatsapp.manage') then raise exception 'Not authorized' using errcode='42501';end if;
 if p_limit not between 1 and 100 then raise exception 'Invalid page size';end if;
 return (with matching as (
 select c.id,c.phone_e164,coalesce(c.display_name,c.profile_name) name,c.blocked_at,c.archived_at,
 coalesce(c.blocked_at,c.archived_at) hidden_at from public.platform_wa_conversations c
 where (c.blocked_at is not null or c.archived_at is not null)
 and (p_before is null or (coalesce(c.blocked_at,c.archived_at),c.id)<((p_before->>'at')::timestamptz,(p_before->>'id')::uuid))
 order by hidden_at desc,c.id desc limit p_limit+1), page as (select * from matching order by hidden_at desc,id desc limit p_limit)
 select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(p) order by hidden_at desc,id desc) from page p),'[]'::jsonb),
 'has_more',(select count(*)>p_limit from matching),
 'before',(select jsonb_build_object('at',hidden_at,'id',id) from page order by hidden_at,id limit 1)));
end$$;

create function public.admin_wa_command(p_id uuid,p_command text,p_input jsonb default '{}') returns void
language plpgsql security definer set search_path='' as $$
declare c public.platform_wa_conversations; old_row jsonb; target uuid; lid uuid; matches uuid[];begin
 if not app.has_platform_permission('whatsapp.manage') then raise exception 'Not authorized' using errcode='42501';end if;
 select * into strict c from public.platform_wa_conversations where id=p_id for update;old_row:=to_jsonb(c);
 if c.blocked_at is not null and p_command<>'unblock' then raise exception 'Number is blocked';end if;
 case p_command
 when 'assign' then
  target:=(p_input->>'assigneeId')::uuid;
  if target is not null and not exists(select 1 from public.platform_admins a join public.platform_role_permissions r on r.role=a.role
   where a.user_id=target and a.status='active' and a.revoked_at is null and r.permission='whatsapp.manage') then raise exception 'Assignee is not available';end if;
  update public.platform_wa_conversations set assignee_id=target where id=p_id;
 when 'close' then update public.platform_wa_conversations set status='closed' where id=p_id;
 when 'reopen' then update public.platform_wa_conversations set status='open',archived_at=null where id=p_id;
 when 'archive' then update public.platform_wa_conversations set archived_at=now() where id=p_id;
 when 'block' then update public.platform_wa_conversations set blocked_at=now() where id=p_id;
 when 'unblock' then update public.platform_wa_conversations set blocked_at=null where id=p_id;
 when 'read' then
  -- Clear only the messages the admin actually saw, preserving arrivals during the read request.
  update public.platform_wa_conversations set unread_count=(select count(*) from public.platform_wa_messages where conversation_id=p_id and direction='in' and created_at>(p_input->>'through')::timestamptz) where id=p_id;
 when 'unread' then update public.platform_wa_conversations set unread_count=greatest(1,unread_count) where id=p_id;
 when 'note' then
  if coalesce((p_input->>'version')::integer,-1)<>c.note_version then raise exception 'A teammate changed this note. Reload before saving.' using errcode='40001';end if;
  if p_input->>'note' is null or length(p_input->>'note')>5000 then raise exception 'Invalid note';end if;
  update public.platform_wa_conversations set note=p_input->>'note',note_version=note_version+1 where id=p_id;
 when 'lead' then
  if not app.has_platform_permission('sales.manage') then raise exception 'Sales management permission required' using errcode='42501';end if;
  if c.phone_e164 !~ '^\+91[6-9][0-9]{9}$' then raise exception 'CRM currently supports Indian mobile numbers';end if;
  perform pg_advisory_xact_lock(hashtextextended('platform-sales-phone:'||c.phone_e164,0));
  if c.lead_id is null then
   select array_agg(l.id order by l.created_at,l.id) into matches from public.platform_sales_leads l where l.phone=c.phone_e164 and l.deleted_at is null and l.duplicate_of is null;
   if coalesce(cardinality(matches),0)>1 then raise exception 'Multiple CRM leads match this number. Resolve duplicates in Sales first.';end if;
   lid:=matches[1];
   if lid is not null and not app.sales_visible((select owner from public.platform_sales_leads where id=lid)) then raise exception 'Matching lead is outside your sales scope' using errcode='42501';end if;
   if lid is null then
    if length(btrim(coalesce(p_input->>'contactName',''))) not between 1 and 100 or length(btrim(coalesce(p_input->>'gymName',''))) not between 1 and 160 then raise exception 'Contact and gym names are required';end if;
    select a.user_id into target from public.platform_admins a join public.platform_role_permissions r on r.role=a.role
     where a.user_id=c.assignee_id and a.status='active' and a.revoked_at is null and r.permission='sales.manage';
    target:=coalesce(target,app.assign_website_demo_owner(),auth.uid());
    insert into public.platform_sales_leads(gym,contact,phone,email,city,state,branches,members,source,stage,owner)
    values(btrim(p_input->>'gymName'),btrim(p_input->>'contactName'),c.phone_e164,'','','','Unknown','Unknown','WhatsApp','new',target) returning id into lid;
   end if;
   update public.platform_wa_conversations set lead_id=lid,display_name=coalesce(nullif(btrim(p_input->>'contactName'),''),display_name) where id=p_id;
   insert into public.platform_sales_activities(lead_id,kind,title,actor_id) values(lid,'whatsapp','Linked WhatsApp conversation',auth.uid());
  end if;
 else raise exception 'Invalid inbox command';end case;
 if p_command not in ('note','read','unread') then insert into public.platform_wa_events(conversation_id,kind,actor_id,target_id) values(p_id,p_command,auth.uid(),target);end if;
 -- Notes and message contents stay out of the audit payload.
 perform app.write_admin_audit('whatsapp_inbox.'||p_command,'whatsapp_conversation',p_id::text,
 old_row-'note'-'profile_name'-'last_message_preview'-'phone_e164'-'display_name',
 (select to_jsonb(x)-'note'-'profile_name'-'last_message_preview'-'phone_e164'-'display_name' from public.platform_wa_conversations x where id=p_id));
end$$;

create function public.admin_wa_prepare_send(p_conversation_id uuid,p_client_ref uuid,p_body text,p_template_name text default null,p_template_language text default null,p_retry boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.platform_wa_conversations; m public.platform_wa_messages; attempt uuid:=gen_random_uuid();begin
 if not app.has_platform_permission('whatsapp.manage') then raise exception 'Not authorized' using errcode='42501';end if;
 if p_client_ref is null then raise exception 'Missing send reference';end if;
 select * into strict c from public.platform_wa_conversations where id=p_conversation_id for update;
 select * into m from public.platform_wa_messages where client_ref=p_client_ref for update;
 if found then
  if m.conversation_id<>c.id or (not p_retry and m.sent_by<>auth.uid()) then raise exception 'Send reference is already used';end if;
  if not p_retry or m.meta_message_id is not null or m.status<>'failed' or m.error_code='uncertain' then
   return jsonb_build_object('dispatch',false,'id',m.id,'status',m.status,'error',m.error_message);
  end if;
  p_body:=m.body;p_template_name:=m.template_name;p_template_language:=m.template_language;
 end if;
 if c.status<>'open' or c.blocked_at is not null or c.archived_at is not null then raise exception 'Conversation is not open';end if;
 if p_body is null or length(btrim(p_body)) not between 1 and 4096 then raise exception 'Message must be 1–4096 characters';end if;
 if p_template_name is null then
  if c.last_inbound_at is null or c.last_inbound_at+interval '24 hours'<=now() then raise exception 'Reply window expired. Send an approved template.';end if;
 elsif not exists(select 1 from public.platform_wa_template_allowlist where name=p_template_name and language=p_template_language and enabled) then raise exception 'Template is not allowed in the platform inbox';end if;
 if m.id is null then
  insert into public.platform_wa_messages(conversation_id,direction,body,type,template_name,template_language,sent_by,status,client_ref,attempt_id)
   values(c.id,'out',btrim(p_body),case when p_template_name is null then 'text' else 'template' end,p_template_name,p_template_language,auth.uid(),'sending',p_client_ref,attempt) returning * into m;
 else
  update public.platform_wa_messages set status='sending',error_code=null,error_message=null,attempt_id=attempt where id=m.id returning * into m;
 end if;
 update public.platform_wa_conversations set last_message_at=greatest(now(),last_message_at),last_message_preview=m.body where id=c.id;
 perform app.write_admin_audit(case when p_template_name is null then 'whatsapp_inbox.message_sent' else 'whatsapp_inbox.template_sent' end,'whatsapp_message',m.id::text,null,jsonb_build_object('conversation_id',c.id,'template',p_template_name,'status','sending'));
 if c.lead_id is not null then
  insert into public.platform_sales_activities(lead_id,kind,title,actor_id,detail) values(c.lead_id,'whatsapp','WhatsApp send requested',auth.uid(),jsonb_build_object('message_id',m.id));
 end if;
 return jsonb_build_object('dispatch',true,'id',m.id,'attempt',attempt,'phone',c.phone_e164,'name',coalesce(c.display_name,c.profile_name,''),'body',m.body,'template',m.template_name,'language',m.template_language);
end$$;

-- Signed callbacks can correlate a response-loss send via wa-inbox:<row UUID>.
create function public.platform_wa_record_status(p_meta_id text,p_status text,p_at timestamptz,p_callback text default null,p_error_code text default null)
returns boolean language plpgsql security definer set search_path='' as $$
declare m public.platform_wa_messages; cb uuid; next_status text;begin
 if p_status not in ('sent','delivered','read','failed') or p_meta_id is null then raise exception 'Invalid status';end if;
 if p_callback ~ '^wa-inbox:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then cb:=substring(p_callback from 10)::uuid;end if;
 select * into m from public.platform_wa_messages where direction='out' and (meta_message_id=p_meta_id or (id=cb and (meta_message_id is null or meta_message_id=p_meta_id))) order by meta_message_id nulls last limit 1 for update;
 if not found then return false;end if;
 next_status:=case when m.status='read' then 'read' when m.status='delivered' and p_status<>'read' then 'delivered'
 when m.status='sent' and p_status='sent' then 'sent' when m.status='failed' and p_status='sent' then 'failed' else p_status end;
 update public.platform_wa_messages set meta_message_id=p_meta_id,status=next_status,
 sent_at=case when p_status='sent' then coalesce(sent_at,p_at) else sent_at end,
 delivered_at=case when p_status='delivered' then coalesce(delivered_at,p_at) else delivered_at end,
 read_at=case when p_status='read' then coalesce(read_at,p_at) else read_at end,
 error_code=case when next_status='failed' then p_error_code else null end,
 error_message=case when next_status='failed' then case when p_error_code='131047' then 'Reply window expired. Send an approved template.' else 'WhatsApp could not deliver this message.' end else null end
 where id=m.id;
 if p_status<>'failed' and m.status in ('sending','failed') then
  update public.platform_sales_leads set last_contacted_at=greatest(last_contacted_at,coalesce(m.sent_at,m.created_at)),
   first_contacted_at=coalesce(first_contacted_at,coalesce(m.sent_at,m.created_at))
   where id=(select lead_id from public.platform_wa_conversations where id=m.conversation_id);
 end if;
 return true;
end$$;
create function public.platform_wa_finish_send(p_id uuid,p_attempt uuid,p_meta_id text default null,p_error_code text default null)
returns void language plpgsql security definer set search_path='' as $$
declare m public.platform_wa_messages;begin
 select * into strict m from public.platform_wa_messages where id=p_id for update;
 if m.attempt_id<>p_attempt or m.meta_message_id is not null or m.status<>'sending' then return;end if;
 if p_meta_id is not null then perform public.platform_wa_record_status(p_meta_id,'sent',now(),'wa-inbox:'||m.id);
 else update public.platform_wa_messages set status=case when p_error_code='uncertain' then 'sending' else 'failed' end,error_code=p_error_code,
  error_message=case when p_error_code='uncertain' then 'Waiting for delivery confirmation. This message will not be sent again automatically.'
   when p_error_code='131047' then 'Reply window expired. Send an approved template.' else 'WhatsApp could not send this message. You can retry.' end where id=m.id;end if;
end$$;

create function public.platform_wa_ingest(p_phone text,p_meta_id text,p_at timestamptz,p_type text,p_body text,p_profile text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_phone text:=app.wa_phone(p_phone); c public.platform_wa_conversations; mid uuid; lid uuid; org uuid; staff_name text;begin
 if v_phone is null or p_meta_id is null or p_at is null or p_at>now()+interval '5 minutes' then raise exception 'Invalid inbound message';end if;
 -- Privacy takes precedence over CRM matching: any gym-attributed managed outbound
 -- identifies a possible member reply. Never persist that sender's inbound content.
 if exists(select 1 from public.whatsapp_messages w where w.sender_mode='managed' and w.direction='outbound' and app.wa_phone(w.phone_number_e164)=v_phone)
 or exists(select 1 from public.members m where m.deleted_at is null and app.wa_phone(m.phone_e164)=v_phone) then
  return jsonb_build_object('classification','gym_member','stored',false);
 end if;
 select l.id into lid from public.platform_sales_leads l where l.phone=v_phone and l.deleted_at is null and l.duplicate_of is null order by l.created_at,l.id limit 1;
 select o.id into org from public.organizations o where app.wa_phone(o.contact_phone)=v_phone order by o.created_at,o.id limit 1;
 select coalesce(org,s.organization_id),nullif(btrim(concat_ws(' ',s.first_name,s.last_name)),'') into org,staff_name
 from public.staff_memberships s where s.deletion_requested_at is null and app.wa_phone(s.phone_e164)=v_phone order by s.created_at,s.id limit 1;
 -- SELECT INTO with no staff row clears its targets, so fall back to the gym contact.
 if org is null then select o.id into org from public.organizations o where app.wa_phone(o.contact_phone)=v_phone order by o.created_at,o.id limit 1;end if;
 insert into public.platform_wa_conversations(phone_e164,profile_name,display_name,lead_id,organization_id)
 values(v_phone,left(p_profile,100),staff_name,lid,org) on conflict(phone_e164) do nothing;
 select * into strict c from public.platform_wa_conversations where phone_e164=v_phone for update;
 if c.blocked_at is not null then return jsonb_build_object('classification','blocked','stored',false);end if;
 insert into public.platform_wa_messages(conversation_id,direction,meta_message_id,type,body,status,source,created_at,delivered_at)
 values(c.id,'in',p_meta_id,left(coalesce(p_type,'unknown'),40),left(coalesce(nullif(p_body,''),'['||coalesce(p_type,'Unsupported message')||']'),4096),'delivered','manual',now(),p_at)
 on conflict(meta_message_id) do nothing returning id into mid;
 if mid is null then return jsonb_build_object('classification','platform','stored',false);end if;
 update public.platform_wa_conversations set profile_name=coalesce(left(p_profile,100),profile_name),lead_id=coalesce(lead_id,lid),organization_id=coalesce(organization_id,org),
 status='open',archived_at=null,last_inbound_at=greatest(last_inbound_at,p_at),last_message_at=greatest(last_message_at,p_at),
 last_message_preview=case when last_message_preview='' or p_at>=last_message_at then left(coalesce(p_body,'['||p_type||']'),4096) else last_message_preview end,unread_count=unread_count+1 where id=c.id;
 if c.status='closed' then insert into public.platform_wa_events(conversation_id,kind) values(c.id,'inbound_reopened');end if;
 if coalesce(c.lead_id,lid) is not null then insert into public.platform_sales_activities(lead_id,kind,title,detail) values(coalesce(c.lead_id,lid),'whatsapp','WhatsApp reply received',jsonb_build_object('message_id',mid));end if;
 return jsonb_build_object('classification','platform','stored',true);
end$$;

-- Statement-level broadcasts carry no PII. A realtime outage cannot fail a write.
-- The Settings permission helper is private; RLS must call a narrow public
-- wrapper rather than invoke that helper as the authenticated subscriber.
create function public.admin_wa_can_receive() returns boolean language sql stable security definer set search_path='' as $$
 select app.has_platform_permission('whatsapp.view')
$$;
create function app.emit_wa_change() returns trigger language plpgsql security definer set search_path='' as $$
declare n bigint;begin
 begin
  select count(*) into n from changed_rows;
  if n>0 then perform realtime.send(jsonb_build_object('t',TG_TABLE_NAME,'op',TG_OP,'n',n),'change','admin:whatsapp-inbox',true);end if;
 exception when others then null;end;
 return null;
end$$;
do $$declare t text;begin
 foreach t in array array['platform_wa_conversations','platform_wa_messages','platform_wa_events'] loop
  execute format('create trigger zz_wa_insert after insert on public.%I referencing new table as changed_rows for each statement execute function app.emit_wa_change()',t);
  execute format('create trigger zz_wa_update after update on public.%I referencing new table as changed_rows for each statement execute function app.emit_wa_change()',t);
  execute format('create trigger zz_wa_delete after delete on public.%I referencing old table as changed_rows for each statement execute function app.emit_wa_change()',t);
 end loop;
end$$;
create policy admin_wa_broadcast_read on realtime.messages for select to authenticated using
 (realtime.topic()='admin:whatsapp-inbox' and public.admin_wa_can_receive());

revoke all on function app.wa_phone(text),app.wa_row(public.platform_wa_conversations),app.emit_wa_change() from public,anon,authenticated;
-- Expression indexes on tenant tables must remain evaluable by tenant writers.
grant execute on function app.wa_phone(text) to authenticated,service_role;
revoke all on function public.admin_wa_bootstrap(),public.admin_wa_conversations(text,text,integer,jsonb,uuid),public.admin_wa_messages(uuid,jsonb,integer),public.admin_wa_command(uuid,text,jsonb),public.admin_wa_prepare_send(uuid,uuid,text,text,text,boolean) from public,anon,authenticated;
grant execute on function public.admin_wa_bootstrap(),public.admin_wa_conversations(text,text,integer,jsonb,uuid),public.admin_wa_messages(uuid,jsonb,integer),public.admin_wa_command(uuid,text,jsonb),public.admin_wa_prepare_send(uuid,uuid,text,text,text,boolean) to authenticated;
revoke all on function public.admin_wa_hidden(integer,jsonb) from public,anon,authenticated;
grant execute on function public.admin_wa_hidden(integer,jsonb) to authenticated;
revoke all on function public.admin_wa_can_receive() from public,anon,authenticated;
grant execute on function public.admin_wa_can_receive() to authenticated;
revoke all on function public.platform_wa_ingest(text,text,timestamptz,text,text,text),public.platform_wa_record_status(text,text,timestamptz,text,text),public.platform_wa_finish_send(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.platform_wa_ingest(text,text,timestamptz,text,text,text),public.platform_wa_record_status(text,text,timestamptz,text,text),public.platform_wa_finish_send(uuid,uuid,text,text) to service_role;
notify pgrst,'reload schema';
commit;
