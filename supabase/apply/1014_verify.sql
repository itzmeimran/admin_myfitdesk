-- ═══════════════════════════════════════════════════════════════════════
-- Verify: 1014_admin_schedule_subscription_package.sql
--
-- Read-only. Paste into the Supabase SQL Editor and run. Prints a PASS/FAIL
-- table. Safe to run any number of times — section 3's behavioural check
-- runs inside BEGIN/ROLLBACK so nothing it does is kept.
--
-- Note: the SQL Editor runs as a superuser, which BYPASSES RLS — a plain
-- SELECT against organization_subscriptions there would prove nothing about
-- what a real admin session can do. Section 3 instead imitates a real
-- PostgREST request (authenticator + SET ROLE authenticated + a
-- request.jwt.claims GUC) using a real row from platform_admins, the same
-- method this project's own verified passes always use — never a superuser
-- shortcut (see CLAUDE.md's note on the trap that hid a real bug in 0065).
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. Do the three functions exist? ──────────────────────────────────
-- to_regprocedure() returns NULL for a missing function instead of raising
-- — has_function_privilege() with a text signature RAISES on a missing
-- function, which aborted an earlier verify script's entire output (see
-- FitDeskApp CLAUDE.md, migration 0072's own section on this exact trap).
select
  'function exists: admin_schedule_subscription_package' as check,
  case when to_regprocedure('public.admin_schedule_subscription_package(uuid, uuid)') is not null
    then 'PASS' else 'FAIL' end as result
union all
select
  'function exists: admin_clear_scheduled_package',
  case when to_regprocedure('public.admin_clear_scheduled_package(uuid)') is not null
    then 'PASS' else 'FAIL' end
union all
select
  'function exists: admin_get_scheduled_package',
  case when to_regprocedure('public.admin_get_scheduled_package(uuid)') is not null
    then 'PASS' else 'FAIL' end;

-- ── 2. Both-revokes check — anon must be false, authenticated must be true ──
-- Every admin_* RPC in this app is locked to anon=false/authenticated=true
-- (see the "both revokes" trap this project's own CLAUDE.md repeats).
select
  'admin_schedule_subscription_package: anon refused' as check,
  case when to_regprocedure('public.admin_schedule_subscription_package(uuid, uuid)') is null then 'SKIP (function missing)'
    when has_function_privilege('anon', 'public.admin_schedule_subscription_package(uuid, uuid)', 'execute') then 'FAIL'
    else 'PASS' end as result
union all
select
  'admin_schedule_subscription_package: authenticated can call',
  case when to_regprocedure('public.admin_schedule_subscription_package(uuid, uuid)') is null then 'SKIP (function missing)'
    when has_function_privilege('authenticated', 'public.admin_schedule_subscription_package(uuid, uuid)', 'execute') then 'PASS'
    else 'FAIL' end
union all
select
  'admin_clear_scheduled_package: anon refused',
  case when to_regprocedure('public.admin_clear_scheduled_package(uuid)') is null then 'SKIP (function missing)'
    when has_function_privilege('anon', 'public.admin_clear_scheduled_package(uuid)', 'execute') then 'FAIL'
    else 'PASS' end
union all
select
  'admin_clear_scheduled_package: authenticated can call',
  case when to_regprocedure('public.admin_clear_scheduled_package(uuid)') is null then 'SKIP (function missing)'
    when has_function_privilege('authenticated', 'public.admin_clear_scheduled_package(uuid)', 'execute') then 'PASS'
    else 'FAIL' end
union all
select
  'admin_get_scheduled_package: anon refused',
  case when to_regprocedure('public.admin_get_scheduled_package(uuid)') is null then 'SKIP (function missing)'
    when has_function_privilege('anon', 'public.admin_get_scheduled_package(uuid)', 'execute') then 'FAIL'
    else 'PASS' end
union all
select
  'admin_get_scheduled_package: authenticated can call',
  case when to_regprocedure('public.admin_get_scheduled_package(uuid)') is null then 'SKIP (function missing)'
    when has_function_privilege('authenticated', 'public.admin_get_scheduled_package(uuid)', 'execute') then 'PASS'
    else 'FAIL' end;

-- ── 3. Behavioural check, as a real admin session, rolled back ────────
begin;

create temp table verify_results (step text, outcome text) on commit drop;
grant insert, select on verify_results to authenticated;

do $$
declare
  v_admin_id uuid;
  v_org_id uuid;
  v_package_id uuid;
  v_duration integer;
  v_before_end timestamptz;
begin
  select user_id into v_admin_id from platform_admins limit 1;
  if v_admin_id is null then
    insert into verify_results values ('setup', 'INCONCLUSIVE: no row in platform_admins to impersonate');
    return;
  end if;

  select os.organization_id, os.current_period_end
    into v_org_id, v_before_end
  from organization_subscriptions os
  order by os.organization_id
  limit 1;
  if v_org_id is null then
    insert into verify_results values ('setup', 'INCONCLUSIVE: no row in organization_subscriptions to test against');
    return;
  end if;

  select id, duration_days into v_package_id, v_duration
  from platform_packages where status = 'active' limit 1;
  if v_package_id is null then
    insert into verify_results values ('setup', 'INCONCLUSIVE: no active platform_packages row to schedule');
    return;
  end if;

  -- From here on, act as the real admin would via PostgREST.
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin_id, 'role', 'authenticated')::text, true);
  set local role authenticated;

  begin
    perform admin_schedule_subscription_package(v_org_id, v_package_id);
    insert into verify_results values ('schedule_subscription_package call', 'PASS: no error');
  exception when others then
    insert into verify_results values ('schedule_subscription_package call', 'FAIL: ' || sqlerrm);
  end;

  if exists (
    select 1 from organization_subscriptions os
    where os.organization_id = v_org_id
      and os.pending_package_id = v_package_id
      and os.pending_period_start = v_before_end
      and os.pending_period_end = v_before_end + make_interval(days => v_duration)
  ) then
    insert into verify_results values ('pending_* written correctly', 'PASS');
  else
    insert into verify_results values ('pending_* written correctly', 'FAIL');
  end if;

  begin
    perform admin_get_scheduled_package(v_org_id);
    insert into verify_results values ('get_scheduled_package call', 'PASS: no error');
  exception when others then
    insert into verify_results values ('get_scheduled_package call', 'FAIL: ' || sqlerrm);
  end;

  if exists (
    select 1 from admin_get_scheduled_package(v_org_id) r where r.package_id = v_package_id
  ) then
    insert into verify_results values ('get_scheduled_package returns it', 'PASS');
  else
    insert into verify_results values ('get_scheduled_package returns it', 'FAIL');
  end if;

  begin
    perform admin_clear_scheduled_package(v_org_id);
    insert into verify_results values ('clear_scheduled_package call', 'PASS: no error');
  exception when others then
    insert into verify_results values ('clear_scheduled_package call', 'FAIL: ' || sqlerrm);
  end;

  if exists (
    select 1 from organization_subscriptions os
    where os.organization_id = v_org_id and os.pending_package_id is null
  ) then
    insert into verify_results values ('pending_* cleared correctly', 'PASS');
  else
    insert into verify_results values ('pending_* cleared correctly', 'FAIL');
  end if;

  begin
    perform admin_clear_scheduled_package(v_org_id);
    insert into verify_results values ('clear again with nothing scheduled', 'FAIL: should have raised');
  exception when others then
    insert into verify_results values ('clear again with nothing scheduled', 'PASS: refused - ' || sqlerrm);
  end;
end $$;

reset role;

select step as check, outcome as result from verify_results;

-- Nothing above is kept — this whole section only ever ran inside this
-- transaction, and it stops here without a COMMIT.
rollback;
