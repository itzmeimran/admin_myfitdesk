-- ═══════════════════════════════════════════════════════════════════════
-- Applied to the live project 2026-09-08. Package CRUD, the first real
-- "Manage" write path in this admin panel — see CLAUDE.md's Plan, P1.
--
-- Every mutation goes through a narrow SECURITY DEFINER RPC that performs
-- the table write AND the admin_audit_log entry in the same transaction —
-- not a blanket RLS write policy. That's a deliberate departure from
-- 1002's platform_packages_admin_write policy, which this migration drops:
-- once real writes exist, a blanket "any authenticated admin can write any
-- column" policy means a direct REST call (not through this app's Server
-- Actions) could mutate the catalogue with NO audit trail at all — the
-- audit-log insert only happens because the RPC body does it, and nothing
-- forces a caller to go through the RPC if the table itself is openly
-- writable. Dropping the blanket policy closes that gap: platform_packages
-- write access from a client role now exists ONLY through these functions.
--
-- `code` and `billing_period` are deliberately NOT updatable — FORM_FIELDS'
-- own hint text calls `code` "Stable machine name, unique, never reused",
-- and a package changing billing period in place would be a different
-- product than the one gyms already subscribed to. Changing either means
-- creating a new package row, matching FitDeskApp's own package pattern
-- (starter_monthly / starter_yearly are separate catalogue rows, not one
-- row with a mutable period).
--
-- Verified live (2026-09-08): created, updated, archived and restored a
-- throwaway test package as the real admin session, confirmed all 4
-- actions recorded a correct admin_audit_log entry, then deleted the test
-- row and its audit entries. get_advisors (security) clean afterward — no
-- new findings beyond the 3 expected authenticated-callable flags.
-- ═══════════════════════════════════════════════════════════════════════

drop policy if exists platform_packages_admin_write on public.platform_packages;

create or replace function public.admin_create_package(
  p_code text,
  p_name text,
  p_description text,
  p_price_minor bigint,
  p_currency text,
  p_billing_period text,
  p_duration_days integer,
  p_max_branches integer,
  p_max_members integer,
  p_max_staff integer,
  p_features text[] default '{}'
) returns uuid
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_id uuid;
begin
  if not app.is_platform_admin() then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;
  if p_billing_period not in ('monthly', 'yearly') then
    raise exception 'billing_period must be monthly or yearly';
  end if;
  if p_price_minor < 0 or p_duration_days <= 0 then
    raise exception 'price_minor must be >= 0 and duration_days > 0';
  end if;

  insert into platform_packages (
    code, name, description, price_minor, currency, billing_period, duration_days,
    max_branches, max_members, max_staff, features, status, sort_order
  ) values (
    p_code, p_name, nullif(p_description, ''), p_price_minor, coalesce(p_currency, 'INR'), p_billing_period, p_duration_days,
    p_max_branches, p_max_members, p_max_staff, coalesce(p_features, '{}'), 'active',
    (select coalesce(max(sort_order), 0) + 1 from platform_packages)
  )
  returning id into v_id;

  insert into admin_audit_log (admin_id, action, detail)
  values (
    auth.uid(), 'package.create',
    jsonb_build_object('package_id', v_id, 'code', p_code, 'name', p_name, 'price_minor', p_price_minor, 'billing_period', p_billing_period)
  );

  return v_id;
end;
$$;

revoke execute on function public.admin_create_package(text, text, text, bigint, text, text, integer, integer, integer, integer, text[]) from public, anon, authenticated;
grant execute on function public.admin_create_package(text, text, text, bigint, text, text, integer, integer, integer, integer, text[]) to authenticated;

create or replace function public.admin_update_package(
  p_id uuid,
  p_name text,
  p_description text,
  p_price_minor bigint,
  p_duration_days integer,
  p_max_branches integer,
  p_max_members integer,
  p_max_staff integer,
  p_features text[]
) returns void
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_before jsonb;
begin
  if not app.is_platform_admin() then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;
  if p_price_minor < 0 or p_duration_days <= 0 then
    raise exception 'price_minor must be >= 0 and duration_days > 0';
  end if;

  select jsonb_build_object('name', name, 'price_minor', price_minor) into v_before
  from platform_packages where id = p_id;
  if v_before is null then
    raise exception 'Package not found' using errcode = 'no_data_found';
  end if;

  update platform_packages set
    name = p_name,
    description = nullif(p_description, ''),
    price_minor = p_price_minor,
    duration_days = p_duration_days,
    max_branches = p_max_branches,
    max_members = p_max_members,
    max_staff = p_max_staff,
    features = coalesce(p_features, '{}')
  where id = p_id;

  insert into admin_audit_log (admin_id, action, target_organization_id, detail)
  values (
    auth.uid(), 'package.update', null,
    jsonb_build_object('package_id', p_id, 'before', v_before, 'after', jsonb_build_object('name', p_name, 'price_minor', p_price_minor))
  );
end;
$$;

revoke execute on function public.admin_update_package(uuid, text, text, bigint, integer, integer, integer, integer, text[]) from public, anon, authenticated;
grant execute on function public.admin_update_package(uuid, text, text, bigint, integer, integer, integer, integer, text[]) to authenticated;

create or replace function public.admin_set_package_status(
  p_id uuid,
  p_status text
) returns void
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_action text;
begin
  if not app.is_platform_admin() then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;
  if p_status not in ('active', 'archived') then
    raise exception 'status must be active or archived';
  end if;

  update platform_packages set status = p_status where id = p_id;
  if not found then
    raise exception 'Package not found' using errcode = 'no_data_found';
  end if;

  v_action := case when p_status = 'archived' then 'package.archive' else 'package.restore' end;
  insert into admin_audit_log (admin_id, action, detail)
  values (auth.uid(), v_action, jsonb_build_object('package_id', p_id));
end;
$$;

revoke execute on function public.admin_set_package_status(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_set_package_status(uuid, text) to authenticated;
