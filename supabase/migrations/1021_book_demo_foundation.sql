-- Public Book Demo + shared platform CRM foundation. See docs/BOOK_DEMO_IMPLEMENTATION.md.
-- Prerequisites: 1001, platform-settings (20260930180000), shared rate limiter 0039/0040.
-- DEV pgedlnxuuelmtpmbkdwm: user applies in SQL Editor. PROD clbphruocsqsmklmrloq: approval required.
begin;

create table public.platform_sales_leads (
  id uuid primary key default gen_random_uuid(),
  gym text not null check (length(gym) between 1 and 160),
  contact text not null check (length(contact) between 1 and 100),
  phone text not null check (phone ~ '^\+91[6-9][0-9]{9}$'),
  email text not null check (email = lower(btrim(email)) and length(email) between 3 and 254),
  city text not null check (length(city) between 1 and 120),
  state text not null,
  branches text not null check (branches in ('1', '2–3', '4–10', '10+')),
  members text not null check (members in ('Under 100', '100–300', '300–600', '600–1,000', '1,000+')),
  source text not null default 'Website Demo',
  stage text not null default 'demo_req' check (stage in ('new','contacted','interested','demo_req','demo_sched','trial','followup','converted','later','notint','lost')),
  owner uuid references auth.users(id) on delete restrict,
  demo_status text check (demo_status in ('Awaiting confirmation','Scheduled','Rescheduled','Completed','No show','Cancelled')),
  preferred_at timestamptz,
  possible_existing_lead boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Not unique: legacy/imported leads can conflict and need human review, not auto-merging.
create index platform_sales_leads_phone_idx on public.platform_sales_leads(phone);
create index platform_sales_leads_email_idx on public.platform_sales_leads(email);
create index platform_sales_leads_stage_created_idx on public.platform_sales_leads(stage, created_at desc);
create index platform_sales_leads_owner_idx on public.platform_sales_leads(owner, created_at desc);

create table public.platform_demo_requests (
  id uuid primary key,
  lead_id uuid not null references public.platform_sales_leads(id) on delete restrict,
  payload jsonb not null,
  requested_date date not null,
  time_index integer not null check (time_index between 0 and 17),
  requested_at timestamptz not null,
  status text not null default 'Awaiting confirmation' check (status in ('Awaiting confirmation','Scheduled','Rescheduled','Completed','No show','Cancelled')),
  confirmed_at timestamptz,
  is_returning boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status not in ('Scheduled','Rescheduled') or confirmed_at is not null)
);
create index platform_demo_requests_lead_idx on public.platform_demo_requests(lead_id, created_at desc);
create index platform_demo_requests_capacity_idx on public.platform_demo_requests(confirmed_at) where status in ('Scheduled','Rescheduled');
create index platform_demo_requests_created_idx on public.platform_demo_requests(created_at desc);

create table public.platform_sales_activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.platform_sales_leads(id) on delete restrict,
  kind text not null,
  title text not null,
  detail jsonb not null default '{}'::jsonb,
  actor_id uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index platform_sales_activities_lead_idx on public.platform_sales_activities(lead_id, created_at desc);

create table public.platform_demo_working_hours (
  weekday integer primary key check (weekday between 0 and 6),
  first_slot integer not null default 0 check (first_slot between 0 and 17),
  last_slot integer not null default 17 check (last_slot between 0 and 17 and last_slot >= first_slot),
  capacity integer not null default 1 check (capacity between 0 and 100)
);
insert into public.platform_demo_working_hours(weekday, capacity)
select d, case when d = 0 then 0 else 1 end from generate_series(0,6) d;
create table public.platform_demo_day_overrides (
  day date primary key,
  closed boolean not null default false,
  capacity integer check (capacity between 0 and 100)
);

alter table public.platform_sales_leads enable row level security;
alter table public.platform_sales_leads force row level security;
alter table public.platform_demo_requests enable row level security;
alter table public.platform_demo_requests force row level security;
alter table public.platform_sales_activities enable row level security;
alter table public.platform_sales_activities force row level security;
alter table public.platform_demo_working_hours enable row level security;
alter table public.platform_demo_working_hours force row level security;
alter table public.platform_demo_day_overrides enable row level security;
alter table public.platform_demo_day_overrides force row level security;
revoke all on public.platform_sales_leads, public.platform_demo_requests, public.platform_sales_activities,
  public.platform_demo_working_hours, public.platform_demo_day_overrides from public, anon, authenticated;
grant select, insert, update, delete on public.platform_sales_leads, public.platform_demo_requests, public.platform_sales_activities,
  public.platform_demo_working_hours, public.platform_demo_day_overrides to service_role;

-- Single assignment seam; no public client can invoke it.
create function app.assign_website_demo_owner() returns uuid
language sql stable security invoker set search_path = public, pg_temp as $$
  select pa.user_id from public.platform_admins pa
  where pa.revoked_at is null and pa.status = 'active' and pa.role = 'platform_owner'
  order by pa.granted_at, pa.user_id limit 1
$$;
revoke all on function app.assign_website_demo_owner() from public, anon, authenticated;
grant usage on schema app to service_role;
grant execute on function app.assign_website_demo_owner() to service_role;
grant select on public.platform_admins to service_role;

-- Internal availability supports confirmation beyond the public 30-day window.
create function app.website_demo_open_slots(p_date date, p_exclude uuid default null)
returns integer[] language sql stable security invoker
set search_path = public, pg_temp set timezone = 'Asia/Kolkata' as $$
  select coalesce(array_agg(s.i order by s.i), '{}'::integer[])
  from public.platform_demo_working_hours w
  left join public.platform_demo_day_overrides o on o.day = p_date
  cross join lateral generate_series(w.first_slot, w.last_slot) s(i)
  where w.weekday = extract(dow from p_date)::integer
    and w.weekday <> 0 and not coalesce(o.closed, false)
    and coalesce(o.capacity, w.capacity) > (
      select count(*) from public.platform_demo_requests r
      where r.status in ('Scheduled','Rescheduled') and (p_exclude is null or r.id <> p_exclude)
        and r.confirmed_at = (p_date + time '10:00' + s.i * interval '30 minutes') at time zone 'Asia/Kolkata'
    )
$$;
revoke all on function app.website_demo_open_slots(date, uuid) from public, anon, authenticated;
grant execute on function app.website_demo_open_slots(date, uuid) to service_role;

create function public.website_demo_availability(p_date date)
returns jsonb language sql stable security invoker
set search_path = public, pg_temp set timezone = 'Asia/Kolkata' as $$
  select case when p_date > (now() at time zone 'Asia/Kolkata')::date
    and p_date <= (now() at time zone 'Asia/Kolkata')::date + 30 then
    jsonb_build_object('date', p_date, 'openSlots', to_jsonb(app.website_demo_open_slots(p_date)),
      'status', case when extract(dow from p_date) = 0
          or exists(select 1 from public.platform_demo_day_overrides o where o.day = p_date and o.closed)
          or not exists(select 1 from public.platform_demo_working_hours w where w.weekday = extract(dow from p_date) and w.capacity > 0)
        then 'closed' when cardinality(app.website_demo_open_slots(p_date)) = 0 then 'full' else 'open' end)
    else jsonb_build_object('date', p_date, 'openSlots', '[]'::jsonb, 'status', 'past') end
$$;
revoke all on function public.website_demo_availability(date) from public, anon, authenticated;
grant execute on function public.website_demo_availability(date) to service_role;

create function public.website_demo_calendar() returns jsonb
language sql stable security invoker set search_path = public, pg_temp set timezone = 'Asia/Kolkata' as $$
  select jsonb_object_agg(d::text, public.website_demo_availability(d)->'status')
  from (select (now() at time zone 'Asia/Kolkata')::date + i as d from generate_series(1,30) i) days
$$;
revoke all on function public.website_demo_calendar() from public, anon, authenticated;
grant execute on function public.website_demo_calendar() to service_role;

-- One transaction: match/create + immutable request + activity. Server supplies validated normalized payload.
-- All other lead writers must take the same identity locks in sorted order.
create function public.submit_website_demo(p_id uuid, p_payload jsonb, p_date date, p_time_index integer)
returns jsonb language plpgsql security invoker
set search_path = public, pg_temp set timezone = 'Asia/Kolkata' as $$
declare
  v_lead uuid; v_matches uuid[]; v_returning boolean; v_at timestamptz;
  v_existing public.platform_demo_requests%rowtype; v_lock bigint;
begin
  if p_id is null or p_payload is null or p_date is null or p_time_index is null
    or p_time_index not between 0 and 17
    or (p_payload->>'phone') is null or (p_payload->>'phone') !~ '^\+91[6-9][0-9]{9}$'
    or (p_payload->>'email') is null or (p_payload->>'email') <> lower(btrim(p_payload->>'email'))
    or length(coalesce(p_payload->>'message','')) > 1000 then
    raise exception 'Invalid request' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('website-demo-request:' || p_id::text, 0));
  select r.* into v_existing from public.platform_demo_requests r where r.id = p_id;
  if found then
    if v_existing.payload <> p_payload or v_existing.requested_date <> p_date or v_existing.time_index <> p_time_index then
      raise exception 'Invalid request' using errcode = '22023';
    end if;
    return jsonb_build_object('returning', v_existing.is_returning, 'created', false);
  end if;
  -- Same day lock as staff confirmation. Requests don't consume capacity.
  perform pg_advisory_xact_lock(hashtextextended('website-demo-day:' || p_date::text, 0));
  if p_date <= (now() at time zone 'Asia/Kolkata')::date or p_date > (now() at time zone 'Asia/Kolkata')::date + 30
    or not (p_time_index = any(app.website_demo_open_slots(p_date))) then
    raise exception 'Time unavailable' using errcode = 'P0002';
  end if;
  for v_lock in select distinct hashtextextended(k, 0) from unnest(array[
    'platform-sales-phone:' || (p_payload->>'phone'), 'platform-sales-email:' || (p_payload->>'email')]) k order by 1 loop
    perform pg_advisory_xact_lock(v_lock);
  end loop;
  select array_agg(l.id order by (l.phone = p_payload->>'phone') desc, l.created_at, l.id)
    into v_matches from public.platform_sales_leads l
    where l.phone = p_payload->>'phone' or l.email = p_payload->>'email';
  v_returning := coalesce(cardinality(v_matches),0) > 0;
  v_at := (p_date + time '10:00' + p_time_index * interval '30 minutes') at time zone 'Asia/Kolkata';
  if v_returning then
    v_lead := v_matches[1];
    update public.platform_sales_leads set possible_existing_lead = true, updated_at = now() where id = any(v_matches);
  else
    insert into public.platform_sales_leads(gym,contact,phone,email,city,state,branches,members,owner,demo_status,preferred_at)
    values (p_payload->>'gym',p_payload->>'name',p_payload->>'phone',p_payload->>'email',p_payload->>'city',
      p_payload->>'state',p_payload->>'branches',p_payload->>'members',app.assign_website_demo_owner(),'Awaiting confirmation',v_at)
    returning id into v_lead;
  end if;
  insert into public.platform_demo_requests(id,lead_id,payload,requested_date,time_index,requested_at,is_returning)
    values(p_id,v_lead,p_payload,p_date,p_time_index,v_at,v_returning);
  insert into public.platform_sales_activities(lead_id,kind,title,detail)
    values(v_lead,'demo',case when v_returning then 'Demo requested · Possible existing lead' else 'Website demo requested' end,
      jsonb_build_object('request_id',p_id,'requested_at',v_at,'message',p_payload->>'message','matching_lead_ids',v_matches));
  return jsonb_build_object('returning',v_returning,'created',true);
end;
$$;
revoke all on function public.submit_website_demo(uuid,jsonb,date,integer) from public, anon, authenticated;
grant execute on function public.submit_website_demo(uuid,jsonb,date,integer) to service_role;

-- Curated read for the upcoming CRM; do not give authenticated direct table access.
create function public.admin_demo_requests(p_limit integer default 50, p_offset integer default 0)
returns jsonb language plpgsql stable security definer
set search_path = public, pg_temp set timezone = 'Asia/Kolkata' as $$
begin
  if not app.is_platform_admin() or app.platform_admin_role() is distinct from 'platform_owner' then raise exception 'Not authorized' using errcode = '42501'; end if;
  return jsonb_build_object('total', (select count(*) from public.platform_demo_requests), 'requests', coalesce((
    select jsonb_agg(to_jsonb(x)) from (
      select r.*, l.gym, l.contact, l.phone, l.email, l.city, l.state, l.branches, l.members,
        l.owner, l.stage, l.source, l.possible_existing_lead
      from public.platform_demo_requests r join public.platform_sales_leads l on l.id = r.lead_id
      order by r.created_at desc, r.id limit greatest(1,least(coalesce(p_limit,50),100)) offset greatest(coalesce(p_offset,0),0)
    ) x), '[]'::jsonb));
end;
$$;
revoke all on function public.admin_demo_requests(integer,integer) from public, anon, authenticated;
grant execute on function public.admin_demo_requests(integer,integer) to authenticated;

create function public.admin_set_demo_status(p_request_id uuid, p_status text, p_confirmed_at timestamptz default null)
returns void language plpgsql security definer
set search_path = public, pg_temp set timezone = 'Asia/Kolkata' as $$
declare
  v_request public.platform_demo_requests%rowtype; v_current public.platform_demo_requests%rowtype;
  v_day date; v_index integer; v_local timestamp;
begin
  if not app.is_platform_admin() or app.platform_admin_role() is distinct from 'platform_owner' then raise exception 'Not authorized' using errcode = '42501'; end if;
  if p_status is null or p_status not in ('Scheduled','Rescheduled','Completed','No show','Cancelled') then
    raise exception 'Invalid status' using errcode = '22023';
  end if;
  select r.* into v_request from public.platform_demo_requests r where r.id = p_request_id for update;
  if not found then raise exception 'Request not found' using errcode = 'P0002'; end if;
  if p_status in ('Scheduled','Rescheduled') then
    if p_confirmed_at is null or p_confirmed_at <= now() then raise exception 'Choose a future time' using errcode = '22023'; end if;
    v_local := p_confirmed_at at time zone 'Asia/Kolkata'; v_day := v_local::date;
    v_index := (extract(hour from v_local)::integer * 60 + extract(minute from v_local)::integer - 600) / 30;
    if extract(second from v_local) <> 0 or extract(minute from v_local)::integer % 30 <> 0 or v_index not between 0 and 17 then
      raise exception 'Choose a demo slot' using errcode = '22023';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('website-demo-day:' || v_day::text, 0));
    if not (v_index = any(app.website_demo_open_slots(v_day,p_request_id))) then
      raise exception 'Time unavailable' using errcode = 'P0002';
    end if;
  elsif p_status in ('Completed','No show') and v_request.status not in ('Scheduled','Rescheduled') then
    raise exception 'Confirm the demo first' using errcode = '22023';
  end if;
  update public.platform_demo_requests set status = p_status,
    confirmed_at = case when p_status in ('Scheduled','Rescheduled') then p_confirmed_at else confirmed_at end,
    updated_at = now() where id = p_request_id;
  -- Repeated website requests can belong to the same lead. An older cancellation
  -- must not hide a newer confirmed appointment in the CRM summary.
  perform 1 from public.platform_sales_leads l where l.id = v_request.lead_id for update;
  select r.* into v_current from public.platform_demo_requests r where r.lead_id = v_request.lead_id
    order by case when r.status in ('Scheduled','Rescheduled') then 0 when r.status = 'Awaiting confirmation' then 1 else 2 end,
      r.created_at desc, r.id desc limit 1;
  update public.platform_sales_leads set demo_status = v_current.status,
    preferred_at = coalesce(v_current.confirmed_at,v_current.requested_at),
    stage = case when v_current.status in ('Scheduled','Rescheduled') and stage in ('new','contacted','interested','demo_req','demo_sched') then 'demo_sched'
      when stage = 'demo_sched' then case when v_current.status = 'Awaiting confirmation' then 'demo_req' else 'followup' end else stage end,
    updated_at = now() where id = v_request.lead_id;
  insert into public.platform_sales_activities(lead_id,kind,title,actor_id,detail)
    values(v_request.lead_id,'demo','Demo ' || lower(p_status),auth.uid(),
      jsonb_build_object('request_id',p_request_id,'previous_status',v_request.status,'confirmed_at',p_confirmed_at));
  insert into public.admin_audit_log(admin_id,action,detail)
    values(auth.uid(),'demo.status_changed',jsonb_build_object('request_id',p_request_id,'lead_id',v_request.lead_id,
      'from',v_request.status,'to',p_status,'confirmed_at',p_confirmed_at));
end;
$$;
revoke all on function public.admin_set_demo_status(uuid,text,timestamptz) from public, anon, authenticated;
grant execute on function public.admin_set_demo_status(uuid,text,timestamptz) to authenticated;
commit;
