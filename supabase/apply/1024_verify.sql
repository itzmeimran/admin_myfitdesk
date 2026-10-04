-- Run after 1024 in either project. All synthetic message writes roll back.
begin;
do $$begin
 if has_function_privilege('anon','public.platform_wa_ingest(text,text,timestamptz,text,text,text)','execute')
 or has_function_privilege('authenticated','public.platform_wa_ingest(text,text,timestamptz,text,text,text)','execute')
 or not has_function_privilege('service_role','public.platform_wa_ingest(text,text,timestamptz,text,text,text)','execute') then
  raise exception 'Unexpected ingest grants';
 end if;
end$$;
set local role service_role;
do $$declare phone text; result jsonb;begin
 select app.wa_phone(s.phone_e164) into phone from public.staff_memberships s
 where s.access_status='active' and s.deletion_requested_at is null and app.wa_phone(s.phone_e164) is not null
 and exists(select 1 from public.members m where m.deleted_at is null and app.wa_phone(m.phone_e164)=app.wa_phone(s.phone_e164))
 and not exists(select 1 from public.platform_wa_conversations c where c.phone_e164=app.wa_phone(s.phone_e164) and c.blocked_at is not null)
 order by s.created_at,s.id limit 1;
 if phone is not null then
  result:=public.platform_wa_ingest(phone,'verify-1024-active-'||gen_random_uuid(),now(),'text','Rolled-back owner/staff precedence check',null);
  if result->>'classification'<>'platform' or result->>'stored'<>'true' then raise exception 'Active member/team contact was excluded';end if;
 end if;
 select app.wa_phone(m.phone_e164) into phone from public.members m
 where m.deleted_at is null and app.wa_phone(m.phone_e164) is not null
 and not exists(select 1 from public.staff_memberships s where s.access_status='active' and s.deletion_requested_at is null and app.wa_phone(s.phone_e164)=app.wa_phone(m.phone_e164))
 order by m.id limit 1;
 if phone is not null then
  result:=public.platform_wa_ingest(phone,'verify-1024-member-'||gen_random_uuid(),now(),'text','Do not persist this ordinary member check',null);
  if result->>'classification'<>'gym_member' or result->>'stored'<>'false' then raise exception 'Ordinary member exclusion failed';end if;
 end if;
end$$;
reset role;
rollback;
select '1024 verified: active team/member contacts accepted, ordinary members excluded, service-only ingest; all test messages rolled back' as result;
