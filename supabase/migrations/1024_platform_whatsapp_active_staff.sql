-- User-approved 2026-10-04: active gym owners/staff may enter the platform inbox.
-- Requires 1023. Keep ordinary member messages excluded and existing grants private.
begin;
create or replace function public.platform_wa_ingest(p_phone text,p_meta_id text,p_at timestamptz,p_type text,p_body text,p_profile text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_phone text:=app.wa_phone(p_phone); c public.platform_wa_conversations; mid uuid; lid uuid; org uuid; staff_name text;begin
 if v_phone is null or p_meta_id is null or p_at is null or p_at>now()+interval '5 minutes' then raise exception 'Invalid inbound message';end if;
 -- Active owner/staff/trainer contacts may contact the platform even when their
 -- phone also appears as a member or has received managed gym reminders.
 -- Pending, disabled and deletion-requested accounts do not get this exception.
 if not exists(select 1 from public.staff_memberships s where s.access_status='active'
  and s.deletion_requested_at is null and app.wa_phone(s.phone_e164)=v_phone) and (exists(select 1 from public.whatsapp_messages w where w.sender_mode='managed' and w.direction='outbound' and app.wa_phone(w.phone_number_e164)=v_phone)
 or exists(select 1 from public.members m where m.deleted_at is null and app.wa_phone(m.phone_e164)=v_phone)) then
  return jsonb_build_object('classification','gym_member','stored',false);
 end if;
 select l.id into lid from public.platform_sales_leads l where l.phone=v_phone and l.deleted_at is null and l.duplicate_of is null order by l.created_at,l.id limit 1;
 select o.id into org from public.organizations o where app.wa_phone(o.contact_phone)=v_phone order by o.created_at,o.id limit 1;
 select coalesce(org,s.organization_id),nullif(btrim(concat_ws(' ',s.first_name,s.last_name)),'') into org,staff_name
 from public.staff_memberships s where s.access_status='active' and s.deletion_requested_at is null and app.wa_phone(s.phone_e164)=v_phone order by s.created_at,s.id limit 1;
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

revoke all on function public.platform_wa_ingest(text,text,timestamptz,text,text,text) from public,anon,authenticated;
grant execute on function public.platform_wa_ingest(text,text,timestamptz,text,text,text) to service_role;
notify pgrst,'reload schema';
commit;
