-- Admin calendar policy: IST for day/week/month reads and alert day counts.
-- Apply AFTER the existing overview, member-support, and operations migrations.
-- Only function definitions/configuration change; stored dates, tenant timezone
-- settings, subscription expiry instants, grants, and migration history do not.
begin;

-- Keep existing implementations, permission guards and ACLs. Replace only the
-- timezone selected for admin calendar reads. Abort if a prerequisite/body is
-- unexpected rather than silently deploying an incomplete timezone fix.
do $migration$
declare
  v_name text;
  v_function regprocedure;
  v_definition text;
  v_updated text;
  v_count integer;
begin
  foreach v_name in array array[
    'admin_gym_overview', 'admin_gym_members_support',
    'admin_gym_members_summary', 'admin_gym_member_detail'
  ] loop
    select count(*), min(p.oid::bigint)::oid::regprocedure
      into v_count, v_function
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = v_name;
    if v_count <> 1 then
      raise exception 'Expected one public.% function; apply its prerequisite migration first.', v_name;
    end if;
    v_definition := pg_get_functiondef(v_function);
    v_updated := replace(v_definition,
      'coalesce(nullif(default_timezone, ''''), ''Asia/Kolkata'')',
      '''Asia/Kolkata''::text');
    v_updated := replace(v_updated,
      'coalesce(nullif(o.default_timezone, ''''), ''Asia/Kolkata'')',
      '''Asia/Kolkata''::text');
    if v_updated = v_definition and position('''Asia/Kolkata''::text' in v_definition) = 0 then
      raise exception 'Unexpected timezone implementation in public.%; review before applying.', v_name;
    end if;
    execute v_updated;
    execute format('alter function %s set timezone = %L', v_function, 'Asia/Kolkata');
  end loop;
end;
$migration$;

-- These existing functions use session-dependent casts/date_trunc. Scope the
-- timezone to the function call, avoiding a global database timezone change.
alter function public.admin_revenue_trend(integer) set timezone = 'Asia/Kolkata';
alter function app.org_alert_candidates(uuid) set timezone = 'Asia/Kolkata';

commit;
