-- ═══════════════════════════════════════════════════════════════════════
-- Dynamic Plans, Pricing, Features & Offers — additive, alongside the
-- existing (legacy) Starter/Growth/Pro model, never replacing it.
--
-- The user's explicit requirement: the model of subscription as it exists
-- today must keep working completely unchanged, and the admin must be able
-- to freely flip a global switch between it and this new dynamic system at
-- any time. So this migration is purely additive:
--
--   - No existing row is modified. The 6 current platform_packages rows
--     (starter/growth/pro × monthly/yearly) get NO plan_id, ever, by this
--     migration. plan_id IS NULL is the definition of "legacy row".
--   - No existing RPC is dropped or changed. admin_create_package /
--     admin_update_package / admin_set_package_status keep working exactly
--     as they do today, forever, managing the legacy rows.
--   - platform_packages itself is not recreated or repointed — it simply
--     gains two nullable/defaulted columns and a widened billing_period
--     CHECK. organization_subscriptions.package_id and
--     platform_payments.package_id never change value. This is the
--     property that makes "freely choose between the two models" safe:
--     nothing about the working legacy path is touched.
--
-- New concepts, all admin-managed via SECURITY DEFINER RPCs only (never a
-- blanket RLS write policy — see 1003's comment on why: an audit trail a
-- client-role token can write to directly is not an audit trail):
--
--   plans                    — the parent a dynamic package belongs to.
--   platform_packages.plan_id — NULL = legacy row. NOT NULL = one billing
--                                cycle of a dynamic plan.
--   plan_features             — a dynamic plan's CRUD'd marketing feature
--                                list (replaces platform_packages.features
--                                text[] for CRUD purposes; that column is
--                                deprecated in place, not dropped).
--   plan_offers               — an optional discount on one specific
--                                dynamic billing cycle.
--   platform_billing_settings — one-row singleton holding the global
--                                'legacy'|'dynamic' switch buyers see.
--
-- Explicitly out of scope, confirmed with the user and left untouched:
-- feature-flag entitlement enforcement (features stay marketing/display
-- only) and cap enforcement (features/billing/limits.ts and
-- plan_resource_count in FitDeskApp already read max_branches/members/
-- staff dynamically off platform_packages — correct today, not touched).
-- ═══════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────
-- plans — the parent of a dynamic package's billing cycles.
-- ───────────────────────────────────────────────────────────────────────
create table public.plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  status text not null default 'active' check (status in ('active', 'archived')),
  is_purchasable boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger plans_set_updated_at
  before update on public.plans
  for each row execute function app.set_updated_at();

alter table public.plans enable row level security;
alter table public.plans force row level security;

-- Same "readable by anyone signed in" shape as platform_packages_select —
-- it's a price list. No write policy: admin_* RPCs only, below.
create policy plans_select on public.plans
  for select to authenticated using (true);

-- ───────────────────────────────────────────────────────────────────────
-- platform_packages: gains a nullable plan_id (NULL = legacy, untouched)
-- and is_purchasable, and billing_period widens from a 2-value CHECK to
-- an admin-defined label. duration_days already drives all real period
-- math everywhere (settlement, resource counting) — billing_period has
-- only ever been a display string. This widening is inert for the 6
-- legacy rows (still literally 'monthly'/'yearly', never edited) and only
-- matters for new dynamic cycles (e.g. "Quarterly").
-- ───────────────────────────────────────────────────────────────────────
alter table public.platform_packages
  add column plan_id uuid references public.plans(id) on delete restrict,
  add column is_purchasable boolean not null default true;

create index platform_packages_plan_id_idx on public.platform_packages (plan_id);

alter table public.platform_packages drop constraint platform_packages_billing_period_check;
alter table public.platform_packages add constraint platform_packages_billing_period_check
  check (billing_period is not null and length(trim(billing_period)) > 0 and length(billing_period) <= 40);

-- ───────────────────────────────────────────────────────────────────────
-- plan_features — a dynamic plan's CRUD'd marketing feature list.
-- Nothing else ever FKs to a feature row, so a hard delete is safe.
-- ───────────────────────────────────────────────────────────────────────
create table public.plan_features (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans(id) on delete cascade,
  name text not null,
  description text,
  is_enabled boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index plan_features_plan_idx on public.plan_features (plan_id, sort_order);

create trigger plan_features_set_updated_at
  before update on public.plan_features
  for each row execute function app.set_updated_at();

alter table public.plan_features enable row level security;
alter table public.plan_features force row level security;

create policy plan_features_select on public.plan_features
  for select to authenticated using (true);

-- ───────────────────────────────────────────────────────────────────────
-- plan_offers — an optional discount on one specific dynamic billing
-- cycle (package_id here is always a platform_packages row with a
-- non-null plan_id — enforced in admin_create_plan_offer below, not by a
-- DB-level CHECK, since a CHECK can't see another table's column).
-- ───────────────────────────────────────────────────────────────────────
create table public.plan_offers (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.platform_packages(id) on delete cascade,
  discount_type text not null check (discount_type in ('percent', 'fixed')),
  discount_value numeric not null check (discount_value > 0),
  starts_at timestamptz,
  expires_at timestamptz,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint plan_offers_percent_range check (discount_type <> 'percent' or discount_value <= 100),
  constraint plan_offers_window check (expires_at is null or starts_at is null or expires_at > starts_at)
);

create index plan_offers_package_idx on public.plan_offers (package_id) where is_enabled;

create trigger plan_offers_set_updated_at
  before update on public.plan_offers
  for each row execute function app.set_updated_at();

alter table public.plan_offers enable row level security;
alter table public.plan_offers force row level security;

create policy plan_offers_select on public.plan_offers
  for select to authenticated using (true);

-- ───────────────────────────────────────────────────────────────────────
-- platform_billing_settings — one-row singleton: the global switch.
-- Defaults to 'legacy' — flipping to 'dynamic' is an explicit admin
-- action via admin_set_billing_model, never automatic. Read directly
-- (plain select, no RPC needed) by both repos, same openness as
-- platform_packages_select.
-- ───────────────────────────────────────────────────────────────────────
create table public.platform_billing_settings (
  id boolean primary key default true check (id),
  billing_model text not null default 'legacy' check (billing_model in ('legacy', 'dynamic')),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

insert into public.platform_billing_settings (id) values (true);

alter table public.platform_billing_settings enable row level security;
alter table public.platform_billing_settings force row level security;

create policy platform_billing_settings_select on public.platform_billing_settings
  for select to authenticated using (true);

-- ═══════════════════════════════════════════════════════════════════════
-- Fix required by the widened billing_period: admin_package_mix()'s MRR
-- normalization currently string-matches billing_period = 'yearly' to
-- divide by 12 — silently wrong for an arbitrary label like "Quarterly".
-- Replaced with a duration_days-based formula, which is more general and
-- already the real source of truth everywhere else. For existing yearly
-- rows (duration_days=365) this changes the divisor from an exact /12 to
-- ×30/365 (≈/12.17) — an intentional ~1.4% MRR-dashboard shift, noted
-- here rather than silently changing behavior.
-- ═══════════════════════════════════════════════════════════════════════
create or replace function public.admin_package_mix()
returns table (
  package_id uuid,
  code text,
  name text,
  billing_period text,
  price_minor bigint,
  gym_count bigint,
  mrr_minor bigint
)
language sql
stable
security definer
set search_path = public, app, pg_temp
as $$
  select
    pk.id,
    pk.code,
    pk.name,
    pk.billing_period,
    pk.price_minor,
    count(os.organization_id),
    coalesce(sum(case
      when os.organization_id is null then 0
      else round(pk.price_minor * 30.0 / pk.duration_days)
    end), 0)::bigint
  from platform_packages pk
  left join organization_subscriptions os
    on os.package_id = pk.id
    and os.status <> 'cancelled'
  where app.is_platform_admin()
  group by pk.id, pk.code, pk.name, pk.billing_period, pk.price_minor, pk.sort_order
  order by pk.sort_order
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- RPCs. Every one: plpgsql, security definer, search_path pinned,
-- app.is_platform_admin() gate first, table write + admin_audit_log
-- insert in the same transaction, not-found guard after any UPDATE/DELETE
-- that could silently no-op, and the mandatory revoke-then-grant pair
-- (Postgres grants EXECUTE to PUBLIC by default at creation — a lone
-- GRANT without the REVOKE leaves anon/public able to call it too).
-- ═══════════════════════════════════════════════════════════════════════

-- ─────────────────────────── Billing model ───────────────────────────

create or replace function public.admin_set_billing_model(p_model text)
returns void
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_before text;
begin
  if not app.is_platform_admin() then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;
  if p_model not in ('legacy', 'dynamic') then
    raise exception 'model must be legacy or dynamic';
  end if;

  select billing_model into v_before from platform_billing_settings where id = true;

  update platform_billing_settings
  set billing_model = p_model, updated_at = now(), updated_by = auth.uid()
  where id = true;

  insert into admin_audit_log (admin_id, action, target_organization_id, detail)
  values (auth.uid(), 'billing_settings.update', null, jsonb_build_object('before', v_before, 'after', p_model));
end;
$$;

revoke execute on function public.admin_set_billing_model(text) from public, anon, authenticated;
grant execute on function public.admin_set_billing_model(text) to authenticated;

-- ─────────────────────────────── Plans ────────────────────────────────

create or replace function public.admin_create_plan(
  p_code text,
  p_name text,
  p_description text,
  p_is_purchasable boolean default true
) returns uuid
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_id uuid;
  v_sort_order integer;
begin
  if not app.is_platform_admin() then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(trim(p_code), '') = '' then
    raise exception 'code is required';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'name is required';
  end if;

  select coalesce(max(sort_order), -1) + 1 into v_sort_order from plans;

  insert into plans (code, name, description, is_purchasable, sort_order)
  values (trim(p_code), trim(p_name), nullif(trim(p_description), ''), p_is_purchasable, v_sort_order)
  returning id into v_id;

  insert into admin_audit_log (admin_id, action, target_organization_id, detail)
  values (auth.uid(), 'plan.create', null, jsonb_build_object('plan_id', v_id, 'code', p_code, 'name', p_name));

  return v_id;
end;
$$;

revoke execute on function public.admin_create_plan(text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.admin_create_plan(text, text, text, boolean) to authenticated;

create or replace function public.admin_update_plan(
  p_id uuid,
  p_name text,
  p_description text,
  p_is_purchasable boolean
) returns void
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_before_name text;
begin
  if not app.is_platform_admin() then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'name is required';
  end if;

  select name into v_before_name from plans where id = p_id;
  if not found then
    raise exception 'Plan not found' using errcode = 'no_data_found';
  end if;

  update plans
  set name = trim(p_name), description = nullif(trim(p_description), ''), is_purchasable = p_is_purchasable
  where id = p_id;

  -- platform_packages.name/description are copied from the plan at cycle
  -- creation time (admin_gym_directory, listAssignablePackages, and the
  -- revenue invoices join all read pk.name directly and are deliberately
  -- not touched by this migration) — keep every active cycle's copy in
  -- sync so a rename never goes stale on those downstream reads.
  update platform_packages
  set name = trim(p_name), description = nullif(trim(p_description), '')
  where plan_id = p_id and status = 'active';

  insert into admin_audit_log (admin_id, action, target_organization_id, detail)
  values (auth.uid(), 'plan.update', null, jsonb_build_object('plan_id', p_id, 'before_name', v_before_name, 'after_name', p_name));
end;
$$;

revoke execute on function public.admin_update_plan(uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function public.admin_update_plan(uuid, text, text, boolean) to authenticated;

create or replace function public.admin_set_plan_status(p_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
begin
  if not app.is_platform_admin() then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;
  if p_status not in ('active', 'archived') then
    raise exception 'status must be active or archived';
  end if;

  update plans set status = p_status where id = p_id;
  if not found then
    raise exception 'Plan not found' using errcode = 'no_data_found';
  end if;

  insert into admin_audit_log (admin_id, action, target_organization_id, detail)
  values (auth.uid(), case when p_status = 'archived' then 'plan.archive' else 'plan.restore' end, null, jsonb_build_object('plan_id', p_id));
end;
$$;

revoke execute on function public.admin_set_plan_status(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_set_plan_status(uuid, text) to authenticated;

create or replace function public.admin_reorder_plans(p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_count integer;
begin
  if not app.is_platform_admin() then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;

  select count(*) into v_count from plans where id = any(p_ids);
  if v_count <> coalesce(array_length(p_ids, 1), 0) then
    raise exception 'One or more plan ids do not exist';
  end if;

  update plans set sort_order = t.rn
  from unnest(p_ids) with ordinality as t(id, rn)
  where plans.id = t.id;

  insert into admin_audit_log (admin_id, action, target_organization_id, detail)
  values (auth.uid(), 'plan.reorder', null, jsonb_build_object('ids', p_ids));
end;
$$;

revoke execute on function public.admin_reorder_plans(uuid[]) from public, anon, authenticated;
grant execute on function public.admin_reorder_plans(uuid[]) to authenticated;

create or replace function public.admin_set_plan_caps(
  p_plan_id uuid,
  p_max_branches integer,
  p_max_members integer,
  p_max_staff integer
) returns void
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_updated integer;
begin
  if not app.is_platform_admin() then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from plans where id = p_plan_id) then
    raise exception 'Plan not found' using errcode = 'no_data_found';
  end if;

  update platform_packages
  set max_branches = p_max_branches, max_members = p_max_members, max_staff = p_max_staff
  where plan_id = p_plan_id and status = 'active';
  get diagnostics v_updated = row_count;

  insert into admin_audit_log (admin_id, action, target_organization_id, detail)
  values (auth.uid(), 'plan.set_caps', null, jsonb_build_object(
    'plan_id', p_plan_id, 'max_branches', p_max_branches, 'max_members', p_max_members,
    'max_staff', p_max_staff, 'cycles_updated', v_updated
  ));
end;
$$;

revoke execute on function public.admin_set_plan_caps(uuid, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.admin_set_plan_caps(uuid, integer, integer, integer) to authenticated;

-- ───────────────────────────── Plan features ──────────────────────────

create or replace function public.admin_create_plan_feature(
  p_plan_id uuid,
  p_name text,
  p_description text,
  p_is_enabled boolean default true
) returns uuid
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_id uuid;
  v_sort_order integer;
begin
  if not app.is_platform_admin() then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from plans where id = p_plan_id) then
    raise exception 'Plan not found' using errcode = 'no_data_found';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'name is required';
  end if;

  select coalesce(max(sort_order), -1) + 1 into v_sort_order from plan_features where plan_id = p_plan_id;

  insert into plan_features (plan_id, name, description, is_enabled, sort_order)
  values (p_plan_id, trim(p_name), nullif(trim(p_description), ''), p_is_enabled, v_sort_order)
  returning id into v_id;

  insert into admin_audit_log (admin_id, action, target_organization_id, detail)
  values (auth.uid(), 'plan_feature.create', null, jsonb_build_object('plan_id', p_plan_id, 'feature_id', v_id, 'name', p_name));

  return v_id;
end;
$$;

revoke execute on function public.admin_create_plan_feature(uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function public.admin_create_plan_feature(uuid, text, text, boolean) to authenticated;

create or replace function public.admin_update_plan_feature(
  p_id uuid,
  p_name text,
  p_description text,
  p_is_enabled boolean
) returns void
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
begin
  if not app.is_platform_admin() then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'name is required';
  end if;

  update plan_features
  set name = trim(p_name), description = nullif(trim(p_description), ''), is_enabled = p_is_enabled
  where id = p_id;
  if not found then
    raise exception 'Feature not found' using errcode = 'no_data_found';
  end if;

  insert into admin_audit_log (admin_id, action, target_organization_id, detail)
  values (auth.uid(), 'plan_feature.update', null, jsonb_build_object('feature_id', p_id, 'name', p_name));
end;
$$;

revoke execute on function public.admin_update_plan_feature(uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function public.admin_update_plan_feature(uuid, text, text, boolean) to authenticated;

create or replace function public.admin_delete_plan_feature(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_plan_id uuid;
  v_name text;
begin
  if not app.is_platform_admin() then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;

  select plan_id, name into v_plan_id, v_name from plan_features where id = p_id;
  if not found then
    raise exception 'Feature not found' using errcode = 'no_data_found';
  end if;

  delete from plan_features where id = p_id;

  insert into admin_audit_log (admin_id, action, target_organization_id, detail)
  values (auth.uid(), 'plan_feature.delete', null, jsonb_build_object('plan_id', v_plan_id, 'feature_id', p_id, 'name', v_name));
end;
$$;

revoke execute on function public.admin_delete_plan_feature(uuid) from public, anon, authenticated;
grant execute on function public.admin_delete_plan_feature(uuid) to authenticated;

create or replace function public.admin_reorder_plan_features(p_plan_id uuid, p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_count integer;
begin
  if not app.is_platform_admin() then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;

  select count(*) into v_count from plan_features where id = any(p_ids) and plan_id = p_plan_id;
  if v_count <> coalesce(array_length(p_ids, 1), 0) then
    raise exception 'One or more feature ids do not belong to this plan';
  end if;

  update plan_features set sort_order = t.rn
  from unnest(p_ids) with ordinality as t(id, rn)
  where plan_features.id = t.id;

  insert into admin_audit_log (admin_id, action, target_organization_id, detail)
  values (auth.uid(), 'plan_feature.reorder', null, jsonb_build_object('plan_id', p_plan_id, 'ids', p_ids));
end;
$$;

revoke execute on function public.admin_reorder_plan_features(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.admin_reorder_plan_features(uuid, uuid[]) to authenticated;

create or replace function public.admin_set_plan_feature_enabled(p_id uuid, p_is_enabled boolean)
returns void
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
begin
  if not app.is_platform_admin() then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;

  update plan_features set is_enabled = p_is_enabled where id = p_id;
  if not found then
    raise exception 'Feature not found' using errcode = 'no_data_found';
  end if;

  insert into admin_audit_log (admin_id, action, target_organization_id, detail)
  values (auth.uid(), 'plan_feature.toggle', null, jsonb_build_object('feature_id', p_id, 'is_enabled', p_is_enabled));
end;
$$;

revoke execute on function public.admin_set_plan_feature_enabled(uuid, boolean) from public, anon, authenticated;
grant execute on function public.admin_set_plan_feature_enabled(uuid, boolean) to authenticated;

-- ───────────────────────────── Billing cycles ─────────────────────────
-- (dynamic only — legacy keeps admin_create_package/admin_update_package/
-- admin_set_package_status untouched, managing plan_id IS NULL rows.)

create or replace function public.admin_create_plan_billing_cycle(
  p_plan_id uuid,
  p_code text,
  p_billing_period text,
  p_price_minor bigint,
  p_currency text,
  p_duration_days integer,
  p_max_branches integer,
  p_max_members integer,
  p_max_staff integer,
  p_is_purchasable boolean default true
) returns uuid
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_id uuid;
  v_sort_order integer;
begin
  if not app.is_platform_admin() then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from plans where id = p_plan_id) then
    raise exception 'Plan not found' using errcode = 'no_data_found';
  end if;
  if coalesce(trim(p_code), '') = '' then
    raise exception 'code is required';
  end if;
  if coalesce(trim(p_billing_period), '') = '' then
    raise exception 'billing_period is required';
  end if;
  if p_price_minor < 0 then
    raise exception 'price_minor must be >= 0';
  end if;
  if p_duration_days <= 0 then
    raise exception 'duration_days must be > 0';
  end if;

  select coalesce(max(sort_order), -1) + 1 into v_sort_order from platform_packages where plan_id = p_plan_id;

  insert into platform_packages (
    plan_id, code, name, description, price_minor, currency, billing_period, duration_days,
    max_branches, max_members, max_staff, sort_order, status, is_purchasable
  )
  select p_plan_id, trim(p_code), pl.name, pl.description, p_price_minor, p_currency, trim(p_billing_period), p_duration_days,
    p_max_branches, p_max_members, p_max_staff, v_sort_order, 'active', p_is_purchasable
  from plans pl where pl.id = p_plan_id
  returning id into v_id;

  insert into admin_audit_log (admin_id, action, target_organization_id, detail)
  values (auth.uid(), 'plan_billing_cycle.create', null, jsonb_build_object(
    'plan_id', p_plan_id, 'cycle_id', v_id, 'billing_period', p_billing_period, 'price_minor', p_price_minor
  ));

  return v_id;
end;
$$;

revoke execute on function public.admin_create_plan_billing_cycle(uuid, text, text, bigint, text, integer, integer, integer, integer, boolean) from public, anon, authenticated;
grant execute on function public.admin_create_plan_billing_cycle(uuid, text, text, bigint, text, integer, integer, integer, integer, boolean) to authenticated;

create or replace function public.admin_update_plan_billing_cycle(
  p_id uuid,
  p_price_minor bigint,
  p_duration_days integer,
  p_max_branches integer,
  p_max_members integer,
  p_max_staff integer,
  p_is_purchasable boolean
) returns void
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_before_price bigint;
begin
  if not app.is_platform_admin() then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;
  if p_price_minor < 0 then
    raise exception 'price_minor must be >= 0';
  end if;
  if p_duration_days <= 0 then
    raise exception 'duration_days must be > 0';
  end if;

  select price_minor into v_before_price from platform_packages where id = p_id and plan_id is not null;
  if not found then
    raise exception 'Billing cycle not found' using errcode = 'no_data_found';
  end if;

  update platform_packages
  set price_minor = p_price_minor, duration_days = p_duration_days, max_branches = p_max_branches,
      max_members = p_max_members, max_staff = p_max_staff, is_purchasable = p_is_purchasable
  where id = p_id;

  insert into admin_audit_log (admin_id, action, target_organization_id, detail)
  values (auth.uid(), 'plan_billing_cycle.update', null, jsonb_build_object(
    'cycle_id', p_id, 'before_price_minor', v_before_price, 'after_price_minor', p_price_minor
  ));
end;
$$;

revoke execute on function public.admin_update_plan_billing_cycle(uuid, bigint, integer, integer, integer, integer, boolean) from public, anon, authenticated;
grant execute on function public.admin_update_plan_billing_cycle(uuid, bigint, integer, integer, integer, integer, boolean) to authenticated;

create or replace function public.admin_set_plan_billing_cycle_status(p_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
begin
  if not app.is_platform_admin() then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;
  if p_status not in ('active', 'archived') then
    raise exception 'status must be active or archived';
  end if;

  update platform_packages set status = p_status where id = p_id and plan_id is not null;
  if not found then
    raise exception 'Billing cycle not found' using errcode = 'no_data_found';
  end if;

  insert into admin_audit_log (admin_id, action, target_organization_id, detail)
  values (auth.uid(), case when p_status = 'archived' then 'plan_billing_cycle.archive' else 'plan_billing_cycle.restore' end, null, jsonb_build_object('cycle_id', p_id));
end;
$$;

revoke execute on function public.admin_set_plan_billing_cycle_status(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_set_plan_billing_cycle_status(uuid, text) to authenticated;

create or replace function public.admin_set_plan_billing_cycle_purchasable(p_id uuid, p_is_purchasable boolean)
returns void
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
begin
  if not app.is_platform_admin() then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;

  update platform_packages set is_purchasable = p_is_purchasable where id = p_id and plan_id is not null;
  if not found then
    raise exception 'Billing cycle not found' using errcode = 'no_data_found';
  end if;

  insert into admin_audit_log (admin_id, action, target_organization_id, detail)
  values (auth.uid(), 'plan_billing_cycle.toggle_purchasable', null, jsonb_build_object('cycle_id', p_id, 'is_purchasable', p_is_purchasable));
end;
$$;

revoke execute on function public.admin_set_plan_billing_cycle_purchasable(uuid, boolean) from public, anon, authenticated;
grant execute on function public.admin_set_plan_billing_cycle_purchasable(uuid, boolean) to authenticated;

create or replace function public.admin_reorder_plan_billing_cycles(p_plan_id uuid, p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_count integer;
begin
  if not app.is_platform_admin() then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;

  select count(*) into v_count from platform_packages where id = any(p_ids) and plan_id = p_plan_id;
  if v_count <> coalesce(array_length(p_ids, 1), 0) then
    raise exception 'One or more cycle ids do not belong to this plan';
  end if;

  update platform_packages set sort_order = t.rn
  from unnest(p_ids) with ordinality as t(id, rn)
  where platform_packages.id = t.id;

  insert into admin_audit_log (admin_id, action, target_organization_id, detail)
  values (auth.uid(), 'plan_billing_cycle.reorder', null, jsonb_build_object('plan_id', p_plan_id, 'ids', p_ids));
end;
$$;

revoke execute on function public.admin_reorder_plan_billing_cycles(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.admin_reorder_plan_billing_cycles(uuid, uuid[]) to authenticated;

-- ────────────────────────────────  Offers  ─────────────────────────────

create or replace function public.admin_create_plan_offer(
  p_package_id uuid,
  p_discount_type text,
  p_discount_value numeric,
  p_starts_at timestamptz,
  p_expires_at timestamptz,
  p_is_enabled boolean default true
) returns uuid
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_id uuid;
  v_plan_id uuid;
  v_status text;
  v_price_minor bigint;
begin
  if not app.is_platform_admin() then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;

  select plan_id, status, price_minor into v_plan_id, v_status, v_price_minor
  from platform_packages where id = p_package_id;
  if not found then
    raise exception 'Billing cycle not found' using errcode = 'no_data_found';
  end if;
  if v_plan_id is null then
    raise exception 'Offers require a plan-managed billing cycle';
  end if;
  if v_status <> 'active' then
    raise exception 'Cannot add an offer to an archived billing cycle';
  end if;
  if p_discount_type not in ('percent', 'fixed') then
    raise exception 'discount_type must be percent or fixed';
  end if;
  if p_discount_value <= 0 then
    raise exception 'discount_value must be > 0';
  end if;
  if p_discount_type = 'percent' and p_discount_value > 100 then
    raise exception 'percent discount cannot exceed 100';
  end if;
  if p_discount_type = 'fixed' and p_discount_value >= v_price_minor then
    raise exception 'fixed discount must be less than the cycle price';
  end if;
  if p_expires_at is not null and p_starts_at is not null and p_expires_at <= p_starts_at then
    raise exception 'expires_at must be after starts_at';
  end if;

  insert into plan_offers (package_id, discount_type, discount_value, starts_at, expires_at, is_enabled)
  values (p_package_id, p_discount_type, p_discount_value, p_starts_at, p_expires_at, p_is_enabled)
  returning id into v_id;

  insert into admin_audit_log (admin_id, action, target_organization_id, detail)
  values (auth.uid(), 'plan_offer.create', null, jsonb_build_object(
    'cycle_id', p_package_id, 'offer_id', v_id, 'discount_type', p_discount_type, 'discount_value', p_discount_value
  ));

  return v_id;
end;
$$;

revoke execute on function public.admin_create_plan_offer(uuid, text, numeric, timestamptz, timestamptz, boolean) from public, anon, authenticated;
grant execute on function public.admin_create_plan_offer(uuid, text, numeric, timestamptz, timestamptz, boolean) to authenticated;

create or replace function public.admin_update_plan_offer(
  p_id uuid,
  p_discount_type text,
  p_discount_value numeric,
  p_starts_at timestamptz,
  p_expires_at timestamptz
) returns void
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_price_minor bigint;
begin
  if not app.is_platform_admin() then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;

  select pk.price_minor into v_price_minor
  from plan_offers o join platform_packages pk on pk.id = o.package_id
  where o.id = p_id;
  if not found then
    raise exception 'Offer not found' using errcode = 'no_data_found';
  end if;
  if p_discount_type not in ('percent', 'fixed') then
    raise exception 'discount_type must be percent or fixed';
  end if;
  if p_discount_value <= 0 then
    raise exception 'discount_value must be > 0';
  end if;
  if p_discount_type = 'percent' and p_discount_value > 100 then
    raise exception 'percent discount cannot exceed 100';
  end if;
  if p_discount_type = 'fixed' and p_discount_value >= v_price_minor then
    raise exception 'fixed discount must be less than the cycle price';
  end if;
  if p_expires_at is not null and p_starts_at is not null and p_expires_at <= p_starts_at then
    raise exception 'expires_at must be after starts_at';
  end if;

  update plan_offers
  set discount_type = p_discount_type, discount_value = p_discount_value, starts_at = p_starts_at, expires_at = p_expires_at
  where id = p_id;

  insert into admin_audit_log (admin_id, action, target_organization_id, detail)
  values (auth.uid(), 'plan_offer.update', null, jsonb_build_object('offer_id', p_id, 'discount_type', p_discount_type, 'discount_value', p_discount_value));
end;
$$;

revoke execute on function public.admin_update_plan_offer(uuid, text, numeric, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.admin_update_plan_offer(uuid, text, numeric, timestamptz, timestamptz) to authenticated;

create or replace function public.admin_set_plan_offer_enabled(p_id uuid, p_is_enabled boolean)
returns void
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
begin
  if not app.is_platform_admin() then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;

  update plan_offers set is_enabled = p_is_enabled where id = p_id;
  if not found then
    raise exception 'Offer not found' using errcode = 'no_data_found';
  end if;

  insert into admin_audit_log (admin_id, action, target_organization_id, detail)
  values (auth.uid(), case when p_is_enabled then 'plan_offer.enable' else 'plan_offer.disable' end, null, jsonb_build_object('offer_id', p_id));
end;
$$;

revoke execute on function public.admin_set_plan_offer_enabled(uuid, boolean) from public, anon, authenticated;
grant execute on function public.admin_set_plan_offer_enabled(uuid, boolean) to authenticated;

create or replace function public.admin_delete_plan_offer(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_is_enabled boolean;
begin
  if not app.is_platform_admin() then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;

  select is_enabled into v_is_enabled from plan_offers where id = p_id;
  if not found then
    raise exception 'Offer not found' using errcode = 'no_data_found';
  end if;
  if v_is_enabled then
    raise exception 'Disable this offer before deleting it';
  end if;

  delete from plan_offers where id = p_id;

  insert into admin_audit_log (admin_id, action, target_organization_id, detail)
  values (auth.uid(), 'plan_offer.delete', null, jsonb_build_object('offer_id', p_id));
end;
$$;

revoke execute on function public.admin_delete_plan_offer(uuid) from public, anon, authenticated;
grant execute on function public.admin_delete_plan_offer(uuid) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- plan_effective_price — the one function FitDeskApp's dynamic checkout
-- calls. No admin gate: it's a public pricing lookup any authenticated
-- tenant user must be able to call, matching platform_packages_select's
-- own openness. Only ever meaningful for a dynamic (plan_id IS NOT NULL)
-- cycle — legacy checkout never calls this at all.
--
-- Two deliberate edge cases:
--   - A fixed discount is clamped to price_minor - 1 so the effective
--     price can never reach zero/negative (platform_payments has
--     amount_minor > 0 — an unclamped discount would fail that insert
--     with an opaque constraint error instead of a clean number here).
--   - If two offers are somehow simultaneously active on one cycle (an
--     admin mistake — nothing hard-blocks it), the LARGEST discount wins,
--     tied-broken by newest: "best deal for the buyer" over "most
--     recently created", so a double-booked discount never accidentally
--     undercharges less than the admin's more generous intent.
-- ═══════════════════════════════════════════════════════════════════════
create or replace function public.plan_effective_price(
  p_package_id uuid,
  p_at timestamptz default now()
) returns table (
  package_id uuid,
  price_minor bigint,
  currency text,
  offer_id uuid,
  discount_type text,
  discount_value numeric,
  discount_minor bigint,
  effective_price_minor bigint
)
language sql
stable
security definer
set search_path = public, app, pg_temp
as $$
  with base as (
    select id, price_minor, currency from platform_packages where id = p_package_id
  ),
  best_offer as (
    select o.*
    from plan_offers o, base b
    where o.package_id = p_package_id
      and o.is_enabled
      and (o.starts_at is null or o.starts_at <= p_at)
      and (o.expires_at is null or o.expires_at > p_at)
    order by
      (case when o.discount_type = 'percent'
        then floor(b.price_minor * o.discount_value / 100.0)
        else least(o.discount_value, b.price_minor - 1) end) desc,
      o.created_at desc
    limit 1
  )
  select
    b.id,
    b.price_minor,
    b.currency,
    bo.id,
    bo.discount_type,
    bo.discount_value,
    coalesce((case
      when bo.discount_type = 'percent' then floor(b.price_minor * bo.discount_value / 100.0)
      when bo.discount_type = 'fixed' then least(bo.discount_value, b.price_minor - 1)
      else 0 end), 0)::bigint,
    (b.price_minor - coalesce((case
      when bo.discount_type = 'percent' then floor(b.price_minor * bo.discount_value / 100.0)
      when bo.discount_type = 'fixed' then least(bo.discount_value, b.price_minor - 1)
      else 0 end), 0))::bigint
  from base b left join best_offer bo on true
$$;

revoke execute on function public.plan_effective_price(uuid, timestamptz) from public, anon;
grant execute on function public.plan_effective_price(uuid, timestamptz) to authenticated;
