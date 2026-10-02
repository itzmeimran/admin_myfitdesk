-- Read-only verification after applying 1020_admin_ist_calendar.sql.
begin;
do $verify$
declare
  v_name text;
  v_function regprocedure;
  v_definition text;
  v_config text[];
begin
  foreach v_name in array array[
    'public.admin_gym_overview(uuid)',
    'public.admin_gym_members_support(uuid,text,text,uuid,text,boolean,text,text,integer,integer)',
    'public.admin_gym_members_summary(uuid,uuid)',
    'public.admin_gym_member_detail(uuid,uuid)',
    'public.admin_revenue_trend(integer)',
    'app.org_alert_candidates(uuid)'
  ] loop
    v_function := v_name::regprocedure;
    select proconfig into v_config from pg_proc where oid = v_function;
    if not exists (select 1 from unnest(v_config) c where lower(c) = 'timezone=asia/kolkata') then
      raise exception 'IST timezone missing on %', v_name;
    end if;
    if v_name like 'public.admin_gym_%' then
      v_definition := pg_get_functiondef(v_function);
      if position('''Asia/Kolkata''::text' in v_definition) = 0
        or position('coalesce(nullif(o.default_timezone' in v_definition) > 0
        or position('coalesce(nullif(default_timezone' in v_definition) > 0 then
        raise exception 'IST calendar selection missing on %', v_name;
      end if;
      if position('app.is_platform_admin()' in v_definition) = 0 then
        raise exception 'Admin guard missing on %', v_name;
      end if;
    end if;
  end loop;
  if (timestamptz '2026-10-01 18:29:59.999+00' at time zone 'Asia/Kolkata')::date <> date '2026-10-01'
    or (timestamptz '2026-10-01 18:30:00+00' at time zone 'Asia/Kolkata')::date <> date '2026-10-02' then
    raise exception 'IST midnight boundary failed';
  end if;
  if date_trunc('month', timestamptz '2026-09-30 18:30:00+00', 'Asia/Kolkata')
      <> timestamptz '2026-09-30 18:30:00+00' then
    raise exception 'IST month boundary failed';
  end if;
end;
$verify$;
select 'IST function configuration and calendar boundary checks passed' as result;
rollback;
