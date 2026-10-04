-- DEV only, after 1021-1023. Uses a real active owner and disposable inbox rows.
-- Everything rolls back. SQL reservations/status fixtures never call Meta or send messages.
begin;
do $$
declare
 a uuid; c uuid; fixture_phone text; meta text := 'inbox-verify-' || gen_random_uuid();
 ref uuid := gen_random_uuid(); v jsonb; send_row jsonb; lead uuid;
begin
 select user_id into a from public.platform_admins
 where role='platform_owner' and status='active' and revoked_at is null order by granted_at limit 1;
 if a is null then raise exception 'Verification requires an active platform owner'; end if;
 -- Never modify an existing contact: choose an unused synthetic Indian number.
 loop
  fixture_phone := '+916' || lpad(floor(random()*1000000000)::bigint::text,9,'0');
  exit when not exists(select 1 from public.platform_wa_conversations where phone_e164=fixture_phone)
   and not exists(select 1 from public.platform_sales_leads where app.wa_phone(platform_sales_leads.phone)=fixture_phone)
   and not exists(select 1 from public.members where app.wa_phone(phone_e164)=fixture_phone)
   and not exists(select 1 from public.whatsapp_messages where app.wa_phone(phone_number_e164)=fixture_phone)
   and not exists(select 1 from public.staff_memberships where app.wa_phone(phone_e164)=fixture_phone)
   and not exists(select 1 from public.organizations where app.wa_phone(contact_phone)=fixture_phone);
 end loop;
 execute 'set local role service_role';
 v := public.platform_wa_ingest(fixture_phone,meta,now(),'text','Inbox verification inbound','Verification contact');
 if v->>'stored'<>'true' then raise exception 'Inbound was not stored'; end if;
 v := public.platform_wa_ingest(fixture_phone,meta,now(),'text','Inbox verification inbound','Verification contact');
 if v->>'stored'<>'false' then raise exception 'Replay was not deduplicated'; end if;
 execute 'reset role';
 select id into strict c from public.platform_wa_conversations where phone_e164=fixture_phone and unread_count=1;
 perform set_config('request.jwt.claim.sub',a::text,true);
 execute 'set local role authenticated';
 perform public.admin_wa_bootstrap();
 perform public.admin_wa_conversations('all',fixture_phone);
 if not public.admin_wa_can_receive() then raise exception 'Broadcast authorization failed'; end if;
 v := public.admin_wa_messages(c);
 if jsonb_array_length(v->'items')<>1 then raise exception 'Thread replay duplicated'; end if;
 perform public.admin_wa_command(c,'assign',jsonb_build_object('assigneeId',a));
 perform public.admin_wa_command(c,'note','{"version":0,"note":"Inbox verification private note"}');
 begin
  perform public.admin_wa_command(c,'note','{"version":0,"note":"Stale overwrite"}');
  raise exception 'Stale note was accepted';
 exception when serialization_failure then null; end;
 perform public.admin_wa_command(c,'read',jsonb_build_object('through',now()));
 perform public.admin_wa_command(c,'close');
 perform public.admin_wa_command(c,'reopen');
 perform public.admin_wa_command(c,'lead','{"contactName":"Verification contact","gymName":"Inbox verification gym"}');
 perform public.admin_wa_command(c,'lead','{"contactName":"Verification contact","gymName":"Inbox verification gym"}');
 send_row := public.admin_wa_prepare_send(c,ref,'Inbox verification outbound');
 if send_row->>'dispatch'<>'true' then raise exception 'Send reservation failed'; end if;
 if public.admin_wa_prepare_send(c,ref,'Inbox verification outbound')->>'dispatch'<>'false' then
  raise exception 'Repeated reservation dispatched again'; end if;
 execute 'reset role';
 select lead_id into strict lead from public.platform_wa_conversations where id=c;
 if (select count(*) from public.platform_sales_leads where platform_sales_leads.phone=fixture_phone)<>1 then
  raise exception 'Lead linking was not idempotent'; end if;
 if (select last_contacted_at from public.platform_sales_leads where id=lead) is not null then
  raise exception 'Unaccepted send updated contact time'; end if;
 execute 'set local role service_role';
 perform public.platform_wa_finish_send((send_row->>'id')::uuid,(send_row->>'attempt')::uuid,null,'uncertain');
 if not public.platform_wa_record_status(meta||'-out','read',now(),'wa-inbox:'||(send_row->>'id')) then
  raise exception 'Response-loss callback was not recovered'; end if;
 perform public.platform_wa_record_status(meta||'-out','failed',now(),null,'131047');
 execute 'reset role';
 if (select status from public.platform_wa_messages where id=(send_row->>'id')::uuid)<>'read' then
  raise exception 'Late failure regressed read status'; end if;
 if (select last_contacted_at from public.platform_sales_leads where id=lead) is null then
  raise exception 'Acceptance did not update CRM contact time'; end if;
 execute 'set local role authenticated';
 perform public.admin_wa_command(c,'archive');
 perform public.admin_wa_hidden();
 perform public.admin_wa_command(c,'reopen');
 perform public.admin_wa_command(c,'block');
 execute 'set local role service_role';
 if public.platform_wa_ingest(fixture_phone,meta||'-blocked',now(),'text','Blocked fixture',null)->>'stored'<>'false' then
  raise exception 'Blocked sender was stored'; end if;
 execute 'set local role authenticated';
 perform public.admin_wa_command(c,'unblock');
 begin
  perform public.platform_wa_ingest(fixture_phone,meta||'-forged',now(),'text','Forged fixture',null);
  raise exception 'Authenticated caller could ingest';
 exception when insufficient_privilege then null; end;
 execute 'reset role';
 if exists(select 1 from public.admin_audit_log where action like 'whatsapp_inbox.%'
  and (detail::text like '%Inbox verification private note%' or detail::text like '%Inbox verification outbound%')) then
  raise exception 'Message or note content leaked to audit'; end if;
 perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
 execute 'set local role authenticated';
 begin
  perform public.admin_wa_conversations(); raise exception 'Non-admin could read inbox';
 exception when insufficient_privilege then null; end;
 execute 'reset role';
end $$;
select '1023 DEV runtime verified; all fixture changes rolled back, no messages sent' as result;
rollback;
