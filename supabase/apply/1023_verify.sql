-- Read-only checks after manually applying 1023 in the intended project.
-- Run 1021_verify / 1022_verify first. This file does not apply migrations.
do $$declare n integer;begin
 select count(*) into n from pg_class c join pg_namespace s on s.oid=c.relnamespace
 where s.nspname='public' and c.relname in ('platform_wa_conversations','platform_wa_messages','platform_wa_events','platform_wa_template_allowlist')
 and c.relrowsecurity and c.relforcerowsecurity;
 if n<>4 then raise exception 'Inbox tables missing or RLS not forced';end if;
 select count(*) into n from pg_proc p join pg_namespace s on s.oid=p.pronamespace
 where s.nspname='public' and (p.proname like 'admin_wa_%' or p.proname like 'platform_wa_%') and has_function_privilege('anon',p.oid,'execute');
 if n<>0 then raise exception 'Anonymous inbox RPC access detected';end if;
 select count(*) into n from pg_proc p join pg_namespace s on s.oid=p.pronamespace
 where s.nspname='public' and p.proname like 'platform_wa_%' and has_function_privilege('authenticated',p.oid,'execute');
 if n<>0 then raise exception 'Client webhook/dispatch RPC access detected';end if;
 select count(*) into n from pg_class c join pg_namespace s on s.oid=c.relnamespace
 where s.nspname='public' and c.relname in ('platform_wa_conversations','platform_wa_messages','platform_wa_events','platform_wa_template_allowlist')
 and (has_table_privilege('anon',c.oid,'select') or has_table_privilege('authenticated',c.oid,'select'));
 if n<>0 then raise exception 'Direct inbox table reads detected';end if;
 select count(*) into n from pg_proc p join pg_namespace s on s.oid=p.pronamespace
 where s.nspname='public' and (p.proname like 'admin_wa_%' or p.proname like 'platform_wa_%')
 and p.prosecdef and exists(select 1 from unnest(p.proconfig) x where x like 'search_path=%');
 if n<>10 then raise exception 'Expected 10 RPCs with pinned search_path, found %',n;end if;
 if not exists(select 1 from pg_policies where schemaname='realtime' and tablename='messages' and policyname='admin_wa_broadcast_read') then raise exception 'Private inbox broadcast policy missing';end if;
end$$;
select '1023 inbox schema and privileges verified' as result;

-- Runtime acceptance MUST also use a signed-in admin against real DEV rows:
-- inbound/replay -> list -> read -> assign/note/close/reopen -> link lead ->
-- send/retry -> Meta delivered/read -> archive/block/unblock, and a view-only account.
-- The local harness exercises these SQL paths with fixture rows, not live data.
