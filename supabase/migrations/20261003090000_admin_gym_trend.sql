-- Admin Gym Overview: "Payments & enrollments" trend chart.
--
-- One curated, read-only, gym-scoped function. A platform admin has no SELECT
-- policy on the tenant `payments` / `members` tables (by design — see 1009's
-- header), so the chart's series come from here instead of a blanket policy.
-- It returns only dense per-bucket aggregates (amount, count) — never a member
-- or payment row.
--
--   daily  : the last 60 IST calendar days, oldest first (the chart shows the
--            latest 30 and compares them with the 30 before).
--   hourly : the last 48 IST clock hours, oldest first (the chart shows the
--            latest 24 and compares them with the 24 before).
--
-- Every bucket is present even when empty (zeros), so the chart's x-axis is
-- constant. Buckets are IST per the admin calendar policy (1020): the function
-- pins `timezone = 'Asia/Kolkata'`, which is what makes date_trunc() cut on IST
-- midnight / IST hour boundaries rather than the session's zone.
--
-- "Payments"    = settled gym-member payments (status = 'succeeded') by paid_at.
-- "New members" = non-deleted members by created_at (same rule as the
--                 Overview's "New members · this month" tile).

create or replace function public.admin_gym_trend(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app, pg_temp
set timezone = 'Asia/Kolkata'
as $$
declare
  v_day_start  timestamptz := date_trunc('day',  now()) - interval '59 days';
  v_hour_start timestamptz := date_trunc('hour', now()) - interval '47 hours';
  v_daily  jsonb;
  v_hourly jsonb;
begin
  if not app.is_platform_admin() then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.organizations o where o.id = p_organization_id) then
    raise exception 'Gym not found' using errcode = 'no_data_found';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'at', b.bucket,
           'pay_minor', coalesce(pay.amount, 0),
           'txn', coalesce(pay.n, 0),
           'mem', coalesce(mem.n, 0)
         ) order by b.bucket), '[]'::jsonb)
    into v_daily
  from generate_series(v_day_start, date_trunc('day', now()), interval '1 day') as b(bucket)
  left join (
    select date_trunc('day', p.paid_at) as bucket,
           sum(p.amount_minor)::bigint as amount, count(*)::int as n
    from public.payments p
    where p.organization_id = p_organization_id
      and p.status = 'succeeded'
      and p.paid_at >= v_day_start
    group by 1
  ) pay on pay.bucket = b.bucket
  left join (
    select date_trunc('day', m.created_at) as bucket, count(*)::int as n
    from public.members m
    where m.organization_id = p_organization_id
      and m.deleted_at is null
      and m.created_at >= v_day_start
    group by 1
  ) mem on mem.bucket = b.bucket;

  select coalesce(jsonb_agg(jsonb_build_object(
           'at', b.bucket,
           'pay_minor', coalesce(pay.amount, 0),
           'txn', coalesce(pay.n, 0),
           'mem', coalesce(mem.n, 0)
         ) order by b.bucket), '[]'::jsonb)
    into v_hourly
  from generate_series(v_hour_start, date_trunc('hour', now()), interval '1 hour') as b(bucket)
  left join (
    select date_trunc('hour', p.paid_at) as bucket,
           sum(p.amount_minor)::bigint as amount, count(*)::int as n
    from public.payments p
    where p.organization_id = p_organization_id
      and p.status = 'succeeded'
      and p.paid_at >= v_hour_start
    group by 1
  ) pay on pay.bucket = b.bucket
  left join (
    select date_trunc('hour', m.created_at) as bucket, count(*)::int as n
    from public.members m
    where m.organization_id = p_organization_id
      and m.deleted_at is null
      and m.created_at >= v_hour_start
    group by 1
  ) mem on mem.bucket = b.bucket;

  return jsonb_build_object('timezone', 'Asia/Kolkata', 'daily', v_daily, 'hourly', v_hourly);
end;
$$;

revoke execute on function public.admin_gym_trend(uuid) from public, anon, authenticated;
grant execute on function public.admin_gym_trend(uuid) to authenticated;
