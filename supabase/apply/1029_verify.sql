-- Read-only checks AFTER reviewed deployment of migration 1029 in an environment.
-- No audit inserts, mutation RPCs or production activation.
select to_regprocedure('public.admin_gym_activity(uuid,text,text,text,text,timestamptz,timestamptz,text,integer,integer,text,uuid,boolean)') is not null as activity_read_installed;

select p.provolatile = 's' as stable_read,
  p.prosecdef as guarded_definer,
  not has_function_privilege('anon', p.oid, 'execute') as anon_denied,
  has_function_privilege('authenticated', p.oid, 'execute') as authenticated_granted
from pg_proc p
where p.oid = to_regprocedure('public.admin_gym_activity(uuid,text,text,text,text,timestamptz,timestamptz,text,integer,integer,text,uuid,boolean)');

select app.activity_safe_value('{"avatar_path":"private/photo.webp","avatar_url":"https://example.invalid/photo?token=secret","nested":{"access_token":"secret"}}'::jsonb)
  = '{"avatar_path":"Photo set","avatar_url":"Photo set","nested":{"access_token":"[Redacted]"}}'::jsonb as sensitive_values_hidden;

-- For an authenticated admin with gyms.view, use a real gym UUID with the read
-- RPC and verify rows/total with p_search, p_actor_search, p_category, p_from,
-- p_to, p_status and p_offset. p_group_by_member=true paginates member entries;
-- p_member_id fetches original member events. A page past the end returns [] while
-- retaining total. Users without gyms.view must receive Not authorized.
