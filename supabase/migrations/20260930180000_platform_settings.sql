-- ═══════════════════════════════════════════════════════════════════════
-- Platform Settings area: roles & permissions, admin lifecycle (invite /
-- suspend / revoke), central platform_settings store, security + integration
-- + system read models.
--
-- PER-ENVIRONMENT: DEV and PROD are separate Supabase projects. Run this file
-- once in each. Everything here is scoped to the database it runs in — that
-- is also what makes "environment access" real: an admin can reach an
-- environment only if that environment's own platform_admins holds an ACTIVE
-- row for them. There is no cross-project query anywhere in this file.
--
-- PREREQUISITE: 1017_disaster_recovery.sql (extends admin_audit_log with the
-- environment / actor_role / entity_type / old_values / new_values / metadata
-- columns and creates disaster_recovery_config + system_alerts, all reused
-- here — this file deliberately does NOT create a second audit system).
--
-- SAFE FOR EXISTING DATA: every existing platform_admins row is backfilled to
-- role = platform_owner, status = active (or revoked when revoked_at is set),
-- which is exactly what those rows could already do before this migration.
-- Future rows that omit a role default to the least-privileged role.
--
-- What is and is NOT role-gated at the database level (be precise):
--   * Every function created in this file checks app.has_platform_permission()
--     itself — a Support/Finance admin calling PostgREST directly is refused.
--   * admin_create_gym_owner_invitation is re-created here (gyms.manage).
--   * The ~60 pre-existing admin_* RPCs (subscriptions, packages, recovery,
--     WhatsApp credits, ...) still check only "is an active platform admin".
--     Section-level route guards in the app cover those UIs, but a non-owner
--     admin who calls those RPCs directly is NOT yet stopped by the database.
--     Tightening them is a follow-up (see CLAUDE.md).
-- ═══════════════════════════════════════════════════════════════════════

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'admin_audit_log' and column_name = 'entity_type'
  ) then
    raise exception 'Apply 1017_disaster_recovery.sql first: admin_audit_log lacks the extended audit columns this migration writes.';
  end if;
  if to_regclass('public.disaster_recovery_config') is null or to_regclass('public.system_alerts') is null then
    raise exception 'Apply 1017_disaster_recovery.sql first: disaster_recovery_config / system_alerts are missing.';
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────
-- Roles and permissions. Data, not code: a new role or a changed grant is an
-- INSERT here, with no function or deployment change.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.platform_roles (
  role text primary key,
  label text not null,
  description text not null,
  sort_order integer not null default 0
);

create table if not exists public.platform_role_permissions (
  role text not null references public.platform_roles(role) on delete cascade,
  permission text not null,
  primary key (role, permission)
);

alter table public.platform_roles enable row level security;
alter table public.platform_roles force row level security;
alter table public.platform_role_permissions enable row level security;
alter table public.platform_role_permissions force row level security;

drop policy if exists platform_roles_select on public.platform_roles;
create policy platform_roles_select on public.platform_roles
  for select to authenticated using (app.is_platform_admin());
drop policy if exists platform_role_permissions_select on public.platform_role_permissions;
create policy platform_role_permissions_select on public.platform_role_permissions
  for select to authenticated using (app.is_platform_admin());

insert into public.platform_roles (role, label, description, sort_order) values
  ('platform_owner',   'Platform Owner',   'Full access, including admins, security and platform settings.', 10),
  ('operations_admin', 'Operations Admin', 'Gyms, subscriptions, WhatsApp monitoring, recovery visibility and reports.', 20),
  ('support_admin',    'Support Admin',    'Look-up and troubleshooting. Cannot change subscriptions, packages, money or settings.', 30),
  ('finance_admin',    'Finance Admin',    'Revenue, packages and subscriptions. No access to operations tooling.', 40)
on conflict (role) do nothing;

-- The full permission catalogue. platform_owner is granted every entry.
insert into public.platform_role_permissions (role, permission)
select 'platform_owner', p from unnest(array[
  'settings.view','settings.manage','admins.view','admins.manage','security.view','audit.view',
  'integrations.view','privacy.view','privacy.manage','system.view',
  'gyms.view','gyms.manage','subscriptions.manage','packages.view','packages.manage',
  'revenue.view','whatsapp.view','whatsapp.manage','recovery.view','recovery.manage','api_performance.view'
]) as p
on conflict do nothing;

insert into public.platform_role_permissions (role, permission)
select 'operations_admin', p from unnest(array[
  'settings.view','integrations.view','privacy.view','system.view',
  'gyms.view','gyms.manage','subscriptions.manage','packages.view',
  'revenue.view','whatsapp.view','whatsapp.manage','recovery.view','api_performance.view'
]) as p
on conflict do nothing;

insert into public.platform_role_permissions (role, permission)
select 'support_admin', p from unnest(array[
  'settings.view','system.view','gyms.view','whatsapp.view','api_performance.view'
]) as p
on conflict do nothing;

insert into public.platform_role_permissions (role, permission)
select 'finance_admin', p from unnest(array[
  'settings.view','gyms.view','subscriptions.manage','packages.view','revenue.view'
]) as p
on conflict do nothing;

-- ─────────────────────────────────────────────────────────────────────────
-- platform_admins: role + lifecycle. Existing rows become Platform Owners.
-- ─────────────────────────────────────────────────────────────────────────
alter table public.platform_admins
  add column if not exists role text not null default 'platform_owner' references public.platform_roles(role),
  add column if not exists status text not null default 'active'
    check (status in ('pending', 'active', 'suspended', 'revoked', 'expired')),
  add column if not exists invited_at timestamptz,
  add column if not exists invite_expires_at timestamptz,
  add column if not exists activated_at timestamptz,
  add column if not exists suspended_at timestamptz,
  add column if not exists suspended_by uuid references auth.users(id),
  add column if not exists revoked_by uuid references auth.users(id);

update public.platform_admins set status = 'revoked' where revoked_at is not null and status = 'active';
update public.platform_admins set activated_at = granted_at where activated_at is null and status in ('active', 'revoked', 'suspended');

-- After the backfill, new rows that say nothing get the LEAST privileged role.
alter table public.platform_admins alter column role set default 'support_admin';

create index if not exists platform_admins_role_idx on public.platform_admins (role) where status = 'active';

-- An admin is "live" only when active AND not revoked. Pending / suspended /
-- expired / revoked rows all fail closed everywhere app.is_platform_admin()
-- is used (every RLS policy and every pre-existing admin_* RPC).
create or replace function app.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.platform_admins
    where user_id = (select auth.uid())
      and revoked_at is null
      and status = 'active'
  )
$$;

revoke execute on function app.is_platform_admin() from public, anon, authenticated;
grant execute on function app.is_platform_admin() to authenticated;

create or replace function app.platform_admin_role()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select pa.role from public.platform_admins pa
  where pa.user_id = (select auth.uid()) and pa.revoked_at is null and pa.status = 'active'
$$;

create or replace function app.has_platform_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.platform_admins pa
    join public.platform_role_permissions rp on rp.role = pa.role
    where pa.user_id = (select auth.uid())
      and pa.revoked_at is null
      and pa.status = 'active'
      and rp.permission = p_permission
  )
$$;

revoke execute on function app.platform_admin_role() from public, anon, authenticated;
revoke execute on function app.has_platform_permission(text) from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- app.write_admin_audit — the ONE writer for this area's audit rows. It fills
-- the existing admin_audit_log (no second audit system) and derives the
-- environment from the database itself (disaster_recovery_config), so the
-- label can never be spoofed by the client. Not callable by any client role.
-- Never pass secrets in p_old / p_new / p_metadata.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function app.write_admin_audit(
  p_action text,
  p_entity_type text,
  p_entity_id text,
  p_old jsonb default null,
  p_new jsonb default null,
  p_metadata jsonb default null
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_environment text;
begin
  select c.environment into v_environment from public.disaster_recovery_config c limit 1;

  insert into public.admin_audit_log (
    admin_id, action, environment, actor_role, entity_type, entity_id,
    old_values, new_values, metadata, detail
  ) values (
    auth.uid(), p_action, v_environment, coalesce(app.platform_admin_role(), 'platform_admin'),
    p_entity_type, p_entity_id, p_old, p_new, p_metadata,
    jsonb_strip_nulls(jsonb_build_object(
      'entity_type', p_entity_type, 'entity_id', p_entity_id, 'old', p_old, 'new', p_new
    ))
  );
end;
$$;

revoke execute on function app.write_admin_audit(text, text, text, jsonb, jsonb, jsonb) from public, anon, authenticated;

create or replace function app.is_production_database()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.disaster_recovery_config c where c.environment = 'production')
$$;

revoke execute on function app.is_production_database() from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- Central platform settings. One row per setting; the catalogue (known keys,
-- defaults, validation) lives in the two functions below so an unknown key or
-- an out-of-range value can never be stored. Writes only via the RPC.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.platform_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

alter table public.platform_settings enable row level security;
alter table public.platform_settings force row level security;
drop policy if exists platform_settings_select on public.platform_settings;
create policy platform_settings_select on public.platform_settings
  for select to authenticated using (app.is_platform_admin());

create or replace function app.platform_setting_defaults()
returns jsonb
language sql
immutable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'general.platform_name',    'MyFitDesk',
    'general.support_email',    '',
    'general.support_phone',    '',
    'general.contact_address',  '',
    'defaults.trial_days',      14,
    'defaults.grace_days',      7,
    'defaults.country',         'India',
    'defaults.currency',        'INR',
    'defaults.timezone',        'Asia/Kolkata'
  )
$$;

revoke execute on function app.platform_setting_defaults() from public, anon, authenticated;

-- Validates and normalises one value; raises a plain message on bad input.
create or replace function app.validate_platform_setting(p_key text, p_value jsonb)
returns jsonb
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_text text;
  v_int integer;
begin
  if p_key in ('general.platform_name','general.support_email','general.support_phone','general.contact_address',
               'defaults.country','defaults.currency','defaults.timezone') then
    if p_value is null or jsonb_typeof(p_value) <> 'string' then
      raise exception 'Invalid value for %.', p_key using errcode = 'invalid_parameter_value';
    end if;
    v_text := btrim(p_value #>> '{}');
  end if;

  case p_key
    when 'general.platform_name' then
      if char_length(v_text) not between 1 and 80 then
        raise exception 'Platform name must be 1 to 80 characters.' using errcode = 'invalid_parameter_value';
      end if;
      return to_jsonb(v_text);
    when 'general.support_email' then
      if v_text <> '' and (char_length(v_text) > 254 or v_text !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') then
        raise exception 'Enter a valid support email address.' using errcode = 'invalid_parameter_value';
      end if;
      return to_jsonb(lower(v_text));
    when 'general.support_phone' then
      if v_text <> '' and v_text !~ '^[+0-9 ()-]{6,24}$' then
        raise exception 'Enter a valid support phone number (digits, spaces, + ( ) -).' using errcode = 'invalid_parameter_value';
      end if;
      return to_jsonb(v_text);
    when 'general.contact_address' then
      if char_length(v_text) > 300 then
        raise exception 'Contact address must be 300 characters or fewer.' using errcode = 'invalid_parameter_value';
      end if;
      return to_jsonb(v_text);
    when 'defaults.trial_days' then
      if jsonb_typeof(p_value) <> 'number' or (p_value #>> '{}') !~ '^[0-9]{1,4}$' then
        raise exception 'Trial length must be a whole number of days.' using errcode = 'invalid_parameter_value';
      end if;
      v_int := (p_value #>> '{}')::integer;
      if v_int not between 1 and 365 then
        raise exception 'Trial length must be between 1 and 365 days.' using errcode = 'invalid_parameter_value';
      end if;
      return to_jsonb(v_int);
    when 'defaults.grace_days' then
      if jsonb_typeof(p_value) <> 'number' or (p_value #>> '{}') !~ '^[0-9]{1,3}$' then
        raise exception 'Grace period must be a whole number of days.' using errcode = 'invalid_parameter_value';
      end if;
      v_int := (p_value #>> '{}')::integer;
      if v_int not between 0 and 60 then
        raise exception 'Grace period must be between 0 and 60 days.' using errcode = 'invalid_parameter_value';
      end if;
      return to_jsonb(v_int);
    when 'defaults.country' then
      if char_length(v_text) not between 2 and 80 then
        raise exception 'Default country must be 2 to 80 characters.' using errcode = 'invalid_parameter_value';
      end if;
      return to_jsonb(v_text);
    when 'defaults.currency' then
      if v_text !~ '^[A-Za-z]{3}$' then
        raise exception 'Currency must be a 3-letter code such as INR.' using errcode = 'invalid_parameter_value';
      end if;
      return to_jsonb(upper(v_text));
    when 'defaults.timezone' then
      if not exists (select 1 from pg_timezone_names n where n.name = v_text) then
        raise exception 'Unknown timezone "%". Use an IANA name such as Asia/Kolkata.', v_text using errcode = 'invalid_parameter_value';
      end if;
      return to_jsonb(v_text);
    else
      raise exception 'Unknown setting "%".', p_key using errcode = 'invalid_parameter_value';
  end case;
end;
$$;

revoke execute on function app.validate_platform_setting(text, jsonb) from public, anon, authenticated;

create or replace function public.admin_get_platform_settings()
returns table (
  setting_key text,
  setting_value jsonb,
  is_default boolean,
  updated_at timestamptz,
  updated_by_email text
)
language plpgsql
stable
security definer
set search_path = public, app, pg_temp
as $$
begin
  if not app.has_platform_permission('settings.view') then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;

  return query
  select d.k, coalesce(s.value, d.v), s.key is null, s.updated_at, u.email::text
  from jsonb_each(app.platform_setting_defaults()) as d(k, v)
  left join public.platform_settings s on s.key = d.k
  left join auth.users u on u.id = s.updated_by
  order by d.k;
end;
$$;

revoke execute on function public.admin_get_platform_settings() from public, anon, authenticated;
grant execute on function public.admin_get_platform_settings() to authenticated;

create or replace function public.admin_update_platform_settings(p_changes jsonb)
returns integer
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_defaults jsonb := app.platform_setting_defaults();
  v_key text;
  v_raw jsonb;
  v_new jsonb;
  v_old jsonb;
  v_old_all jsonb := '{}'::jsonb;
  v_new_all jsonb := '{}'::jsonb;
  v_count integer := 0;
begin
  if not app.has_platform_permission('settings.manage') then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;
  if p_changes is null or jsonb_typeof(p_changes) <> 'object' or p_changes = '{}'::jsonb then
    raise exception 'Nothing to save.' using errcode = 'invalid_parameter_value';
  end if;
  if (select count(*) from jsonb_object_keys(p_changes)) > 20 then
    raise exception 'Too many settings in one request.' using errcode = 'invalid_parameter_value';
  end if;

  for v_key, v_raw in select e.key, e.value from jsonb_each(p_changes) as e loop
    if not (v_defaults ? v_key) then
      raise exception 'Unknown setting "%".', v_key using errcode = 'invalid_parameter_value';
    end if;
    v_new := app.validate_platform_setting(v_key, v_raw);
    select coalesce((select s.value from public.platform_settings s where s.key = v_key), v_defaults -> v_key) into v_old;

    if v_old is distinct from v_new then
      insert into public.platform_settings (key, value, updated_by, updated_at)
      values (v_key, v_new, auth.uid(), now())
      on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now();
      v_old_all := v_old_all || jsonb_build_object(v_key, v_old);
      v_new_all := v_new_all || jsonb_build_object(v_key, v_new);
      v_count := v_count + 1;
    end if;
  end loop;

  if v_count > 0 then
    perform app.write_admin_audit('platform_settings.updated', 'platform_settings', null, v_old_all, v_new_all,
      jsonb_build_object('changed_keys', (select jsonb_agg(k) from jsonb_object_keys(v_new_all) as k)));
  end if;
  return v_count;
end;
$$;

revoke execute on function public.admin_update_platform_settings(jsonb) from public, anon, authenticated;
grant execute on function public.admin_update_platform_settings(jsonb) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- The caller's own access: role, permissions, status. Used by every server
-- guard in the app. Returns nothing for a non-admin.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.admin_my_access()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_row public.platform_admins%rowtype;
begin
  select * into v_row from public.platform_admins pa
  where pa.user_id = auth.uid() and pa.revoked_at is null and pa.status = 'active';
  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'user_id', v_row.user_id,
    'role', v_row.role,
    'role_label', (select r.label from public.platform_roles r where r.role = v_row.role),
    'permissions', coalesce((select jsonb_agg(rp.permission order by rp.permission)
                              from public.platform_role_permissions rp where rp.role = v_row.role), '[]'::jsonb),
    'is_production_database', app.is_production_database()
  );
end;
$$;

revoke execute on function public.admin_my_access() from public, anon, authenticated;
grant execute on function public.admin_my_access() to authenticated;

create or replace function public.admin_list_platform_roles()
returns table (role text, label text, description text, permissions text[])
language sql
stable
security definer
set search_path = public, app, pg_temp
as $$
  select r.role, r.label, r.description,
         coalesce((select array_agg(rp.permission order by rp.permission) from public.platform_role_permissions rp where rp.role = r.role), '{}')
  from public.platform_roles r
  where app.has_platform_permission('admins.view')
  order by r.sort_order
$$;

revoke execute on function public.admin_list_platform_roles() from public, anon, authenticated;
grant execute on function public.admin_list_platform_roles() to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- Admin roster. Replaces the 1007 version (same name, richer columns) and
-- retires the 1007 grant/revoke RPCs, which had no role or last-owner rules.
-- ─────────────────────────────────────────────────────────────────────────
drop function if exists public.admin_list_platform_admins();
drop function if exists public.admin_grant_platform_admin(text);
drop function if exists public.admin_revoke_platform_admin(uuid);

create or replace function public.admin_list_platform_admins()
returns table (
  user_id uuid,
  email text,
  display_name text,
  role text,
  role_label text,
  status text,
  granted_by_email text,
  granted_at timestamptz,
  invited_at timestamptz,
  invite_expires_at timestamptz,
  activated_at timestamptz,
  suspended_at timestamptz,
  revoked_at timestamptz,
  last_sign_in_at timestamptz,
  last_active_at timestamptz,
  mfa_enabled boolean,
  is_self boolean
)
language sql
stable
security definer
set search_path = public, app, pg_temp
as $$
  select
    pa.user_id,
    pa.email::text,
    coalesce(nullif(u.raw_user_meta_data ->> 'full_name', ''), nullif(u.raw_user_meta_data ->> 'name', '')),
    pa.role,
    r.label,
    case when pa.status = 'pending' and pa.invite_expires_at is not null and pa.invite_expires_at < now()
         then 'expired' else pa.status end,
    granter.email::text,
    pa.granted_at,
    pa.invited_at,
    pa.invite_expires_at,
    pa.activated_at,
    pa.suspended_at,
    pa.revoked_at,
    u.last_sign_in_at,
    greatest(u.last_sign_in_at, (select max(l.created_at) from public.admin_audit_log l where l.admin_id = pa.user_id)),
    exists (select 1 from auth.mfa_factors f where f.user_id = pa.user_id and f.status = 'verified'),
    pa.user_id = auth.uid()
  from public.platform_admins pa
  join public.platform_roles r on r.role = pa.role
  left join auth.users u on u.id = pa.user_id
  left join auth.users granter on granter.id = pa.granted_by
  where app.has_platform_permission('admins.view')
  order by
    case when pa.status = 'active' then 0 when pa.status = 'pending' then 1 when pa.status = 'suspended' then 2
         when pa.status = 'expired' then 3 else 4 end,
    pa.granted_at desc
$$;

revoke execute on function public.admin_list_platform_admins() from public, anon, authenticated;
grant execute on function public.admin_list_platform_admins() to authenticated;

create or replace function public.admin_platform_admin_detail(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_row public.platform_admins%rowtype;
  v_user auth.users%rowtype;
begin
  if not app.has_platform_permission('admins.view') then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;

  select * into v_row from public.platform_admins pa where pa.user_id = p_user_id;
  if not found then
    raise exception 'Admin not found' using errcode = 'no_data_found';
  end if;
  select * into v_user from auth.users u where u.id = p_user_id;

  return jsonb_build_object(
    'permissions', coalesce((select jsonb_agg(rp.permission order by rp.permission)
                              from public.platform_role_permissions rp where rp.role = v_row.role), '[]'::jsonb),
    'session_count', (select count(*) from auth.sessions s where s.user_id = p_user_id),
    'suspended_by_email', (select u.email from auth.users u where u.id = v_row.suspended_by),
    'revoked_by_email', (select u.email from auth.users u where u.id = v_row.revoked_by),
    'recent_activity', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', x.id, 'action', x.action, 'at', x.created_at, 'environment', x.environment,
        'entity_type', x.entity_type
      ) order by x.created_at desc)
      from (
        select l.id, l.action, l.created_at, l.environment, l.entity_type
        from public.admin_audit_log l
        where l.admin_id = p_user_id
        order by l.created_at desc
        limit 12
      ) x
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.admin_platform_admin_detail(uuid) from public, anon, authenticated;
grant execute on function public.admin_platform_admin_detail(uuid) to authenticated;

-- Invite (or re-invite) an admin. The person must already have an auth
-- account in THIS project; the server action creates one first (via the
-- Admin API, which Postgres cannot reach) when this raises P0002.
create or replace function public.admin_invite_platform_admin(
  p_email text,
  p_role text,
  p_user_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_user auth.users%rowtype;
  v_existing public.platform_admins%rowtype;
  v_expires timestamptz := now() + interval '7 days';
  v_production boolean := app.is_production_database();
begin
  if not app.has_platform_permission('admins.manage') then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or char_length(v_email) > 254 then
    raise exception 'Enter a valid email address.' using errcode = 'invalid_parameter_value';
  end if;
  if not exists (select 1 from public.platform_roles r where r.role = p_role) then
    raise exception 'Choose a valid role.' using errcode = 'invalid_parameter_value';
  end if;

  select * into v_user from auth.users u where lower(u.email) = v_email limit 1;
  if v_user.id is null then
    raise exception 'NO_ACCOUNT' using errcode = 'no_data_found';
  end if;
  if p_user_id is not null and p_user_id <> v_user.id then
    raise exception 'That account does not match the email address.' using errcode = 'invalid_parameter_value';
  end if;

  select * into v_existing from public.platform_admins pa where pa.user_id = v_user.id for update;
  if found and v_existing.revoked_at is null and v_existing.status in ('active', 'suspended') then
    raise exception 'That person is already a platform admin (%). Change their role or reactivate them instead.', v_existing.status
      using errcode = 'unique_violation';
  end if;

  insert into public.platform_admins (user_id, email, role, status, granted_by, granted_at, invited_at, invite_expires_at)
  values (v_user.id, v_email, p_role, 'pending', auth.uid(), now(), now(), v_expires)
  on conflict (user_id) do update
    set email = excluded.email, role = excluded.role, status = 'pending',
        granted_by = excluded.granted_by, granted_at = now(),
        invited_at = now(), invite_expires_at = excluded.invite_expires_at,
        activated_at = null, suspended_at = null, suspended_by = null,
        revoked_at = null, revoked_by = null;

  perform app.write_admin_audit('platform_admin.invited', 'platform_admin', v_user.id::text, null,
    jsonb_build_object('email', v_email, 'role', p_role, 'status', 'pending'),
    jsonb_build_object('expires_at', v_expires, 'resend', v_existing.user_id is not null));
  if v_production then
    perform app.write_admin_audit('platform_admin.production_access_granted', 'platform_admin', v_user.id::text, null,
      jsonb_build_object('email', v_email, 'role', p_role), null);
  end if;

  return jsonb_build_object(
    'user_id', v_user.id, 'email', v_email, 'role', p_role, 'expires_at', v_expires,
    'email_confirmed', v_user.email_confirmed_at is not null
  );
end;
$$;

revoke execute on function public.admin_invite_platform_admin(text, text, uuid) from public, anon, authenticated;
grant execute on function public.admin_invite_platform_admin(text, text, uuid) to authenticated;

-- Self-scoped: the signed-in person turns THEIR OWN pending invitation into
-- access. Deliberately not admin-gated (they are not an admin yet); it can
-- only ever touch the row whose user_id is the caller.
create or replace function public.claim_platform_admin_invitation()
returns text
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_row public.platform_admins%rowtype;
begin
  if auth.uid() is null then
    return 'none';
  end if;
  select * into v_row from public.platform_admins pa where pa.user_id = auth.uid() for update;
  if not found or v_row.status <> 'pending' then
    return 'none';
  end if;
  if v_row.invite_expires_at is not null and v_row.invite_expires_at < now() then
    update public.platform_admins set status = 'expired' where user_id = v_row.user_id;
    return 'expired';
  end if;

  update public.platform_admins set status = 'active', activated_at = now() where user_id = v_row.user_id;
  perform app.write_admin_audit('platform_admin.activated', 'platform_admin', v_row.user_id::text,
    jsonb_build_object('status', 'pending'), jsonb_build_object('status', 'active', 'role', v_row.role), null);
  return 'activated';
end;
$$;

revoke execute on function public.claim_platform_admin_invitation() from public, anon, authenticated;
grant execute on function public.claim_platform_admin_invitation() to authenticated;

create or replace function public.admin_set_platform_admin_role(p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_target public.platform_admins%rowtype;
begin
  if not app.has_platform_permission('admins.manage') then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.platform_roles r where r.role = p_role) then
    raise exception 'Choose a valid role.' using errcode = 'invalid_parameter_value';
  end if;

  select * into v_target from public.platform_admins pa where pa.user_id = p_user_id for update;
  if not found or v_target.status not in ('active', 'suspended', 'pending') then
    raise exception 'Admin not found, or no longer has access.' using errcode = 'no_data_found';
  end if;
  if v_target.role = p_role then
    raise exception 'That is already their role.' using errcode = 'invalid_parameter_value';
  end if;

  if v_target.role = 'platform_owner' and v_target.status = 'active' and not exists (
    select 1 from public.platform_admins o
    where o.role = 'platform_owner' and o.status = 'active' and o.revoked_at is null and o.user_id <> p_user_id
  ) then
    raise exception 'There must always be at least one active Platform Owner.' using errcode = 'invalid_parameter_value';
  end if;

  update public.platform_admins set role = p_role where user_id = p_user_id;
  perform app.write_admin_audit('platform_admin.role_changed', 'platform_admin', p_user_id::text,
    jsonb_build_object('role', v_target.role), jsonb_build_object('role', p_role),
    jsonb_build_object('email', v_target.email));
end;
$$;

revoke execute on function public.admin_set_platform_admin_role(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_set_platform_admin_role(uuid, text) to authenticated;

create or replace function public.admin_set_platform_admin_status(
  p_user_id uuid,
  p_action text,
  p_reason text default null
) returns void
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_target public.platform_admins%rowtype;
  v_production boolean := app.is_production_database();
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_other_owner boolean;
begin
  if not app.has_platform_permission('admins.manage') then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;
  if p_action not in ('suspend', 'reactivate', 'revoke') then
    raise exception 'Unknown action.' using errcode = 'invalid_parameter_value';
  end if;
  if v_reason is not null and char_length(v_reason) > 300 then
    raise exception 'Reason must be 300 characters or fewer.' using errcode = 'invalid_parameter_value';
  end if;

  select * into v_target from public.platform_admins pa where pa.user_id = p_user_id for update;
  if not found then
    raise exception 'Admin not found.' using errcode = 'no_data_found';
  end if;

  select exists (
    select 1 from public.platform_admins o
    where o.role = 'platform_owner' and o.status = 'active' and o.revoked_at is null and o.user_id <> p_user_id
  ) into v_other_owner;

  if p_action in ('suspend', 'revoke') then
    if p_user_id = auth.uid() then
      raise exception 'You cannot % your own access.', p_action using errcode = 'invalid_parameter_value';
    end if;
    if v_target.role = 'platform_owner' and v_target.status = 'active' and not v_other_owner then
      raise exception 'There must always be at least one active Platform Owner.' using errcode = 'invalid_parameter_value';
    end if;
  end if;

  if p_action = 'suspend' then
    if v_target.status <> 'active' then
      raise exception 'Only an active admin can be suspended.' using errcode = 'invalid_parameter_value';
    end if;
    update public.platform_admins
    set status = 'suspended', suspended_at = now(), suspended_by = auth.uid()
    where user_id = p_user_id;
    delete from auth.sessions s where s.user_id = p_user_id;
    perform app.write_admin_audit('platform_admin.suspended', 'platform_admin', p_user_id::text,
      jsonb_build_object('status', v_target.status), jsonb_build_object('status', 'suspended'),
      jsonb_build_object('email', v_target.email, 'reason', v_reason));

  elsif p_action = 'revoke' then
    if v_target.status = 'revoked' then
      raise exception 'Already revoked.' using errcode = 'invalid_parameter_value';
    end if;
    update public.platform_admins
    set status = 'revoked', revoked_at = now(), revoked_by = auth.uid()
    where user_id = p_user_id;
    delete from auth.sessions s where s.user_id = p_user_id;
    perform app.write_admin_audit('platform_admin.revoked', 'platform_admin', p_user_id::text,
      jsonb_build_object('status', v_target.status), jsonb_build_object('status', 'revoked'),
      jsonb_build_object('email', v_target.email, 'reason', v_reason));
    if v_production then
      perform app.write_admin_audit('platform_admin.production_access_removed', 'platform_admin', p_user_id::text,
        null, null, jsonb_build_object('email', v_target.email));
    end if;

  else -- reactivate
    if v_target.status not in ('suspended', 'revoked') or v_target.activated_at is null then
      raise exception 'Only a suspended or previously active admin can be reactivated. Send a new invitation instead.'
        using errcode = 'invalid_parameter_value';
    end if;
    update public.platform_admins
    set status = 'active', suspended_at = null, suspended_by = null, revoked_at = null, revoked_by = null
    where user_id = p_user_id;
    perform app.write_admin_audit('platform_admin.reactivated', 'platform_admin', p_user_id::text,
      jsonb_build_object('status', v_target.status), jsonb_build_object('status', 'active'),
      jsonb_build_object('email', v_target.email, 'reason', v_reason));
    if v_production and v_target.status = 'revoked' then
      perform app.write_admin_audit('platform_admin.production_access_granted', 'platform_admin', p_user_id::text,
        null, null, jsonb_build_object('email', v_target.email));
    end if;
  end if;
end;
$$;

revoke execute on function public.admin_set_platform_admin_status(uuid, text, text) from public, anon, authenticated;
grant execute on function public.admin_set_platform_admin_status(uuid, text, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- Security: sessions, overview, access history, environment-switch log.
-- Revoking a session deletes it from auth.sessions: its refresh token dies
-- immediately, but an access token already issued keeps working until it
-- expires (Supabase default: up to 1 hour). The app's own per-request
-- is_platform_admin() check is what makes suspend/revoke immediate.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.admin_list_admin_sessions()
returns table (
  session_id uuid,
  user_id uuid,
  email text,
  created_at timestamptz,
  refreshed_at timestamptz,
  user_agent text,
  ip text,
  aal text,
  is_current boolean
)
language sql
stable
security definer
set search_path = public, app, pg_temp
as $$
  select
    s.id, s.user_id, pa.email::text, s.created_at,
    (s.refreshed_at at time zone 'UTC'),
    s.user_agent, host(s.ip), s.aal::text,
    s.id = nullif(auth.jwt() ->> 'session_id', '')::uuid
  from auth.sessions s
  join public.platform_admins pa on pa.user_id = s.user_id and pa.revoked_at is null
  where app.has_platform_permission('security.view')
  order by coalesce(s.refreshed_at at time zone 'UTC', s.created_at) desc
$$;

revoke execute on function public.admin_list_admin_sessions() from public, anon, authenticated;
grant execute on function public.admin_list_admin_sessions() to authenticated;

create or replace function public.admin_revoke_admin_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_user uuid;
begin
  if not app.has_platform_permission('admins.manage') then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;
  if p_session_id = nullif(auth.jwt() ->> 'session_id', '')::uuid then
    raise exception 'That is your current session. Use Sign out instead.' using errcode = 'invalid_parameter_value';
  end if;

  select s.user_id into v_user from auth.sessions s
  where s.id = p_session_id and exists (select 1 from public.platform_admins pa where pa.user_id = s.user_id);
  if v_user is null then
    raise exception 'Session not found.' using errcode = 'no_data_found';
  end if;

  delete from auth.sessions s where s.id = p_session_id;
  perform app.write_admin_audit('platform_security.session_revoked', 'platform_admin', v_user::text, null, null,
    jsonb_build_object('session_id', p_session_id));
end;
$$;

revoke execute on function public.admin_revoke_admin_session(uuid) from public, anon, authenticated;
grant execute on function public.admin_revoke_admin_session(uuid) to authenticated;

create or replace function public.admin_revoke_all_other_admin_sessions()
returns integer
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_count integer;
begin
  if not app.has_platform_permission('admins.manage') then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;

  with gone as (
    delete from auth.sessions s
    where s.user_id in (select pa.user_id from public.platform_admins pa)
      and s.id is distinct from nullif(auth.jwt() ->> 'session_id', '')::uuid
    returning s.id
  )
  select count(*)::integer into v_count from gone;

  perform app.write_admin_audit('platform_security.all_admin_sessions_revoked', 'platform_admin', null, null, null,
    jsonb_build_object('sessions_revoked', v_count));
  return v_count;
end;
$$;

revoke execute on function public.admin_revoke_all_other_admin_sessions() from public, anon, authenticated;
grant execute on function public.admin_revoke_all_other_admin_sessions() to authenticated;

create or replace function public.admin_security_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app, pg_temp
as $$
begin
  if not app.has_platform_permission('security.view') then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;

  return (
    select jsonb_build_object(
      'active_admins',      count(*) filter (where pa.status = 'active' and pa.revoked_at is null),
      'active_owners',      count(*) filter (where pa.status = 'active' and pa.revoked_at is null and pa.role = 'platform_owner'),
      'pending_invites',    count(*) filter (where pa.status = 'pending' and (pa.invite_expires_at is null or pa.invite_expires_at >= now())),
      'expired_invites',    count(*) filter (where pa.status = 'expired' or (pa.status = 'pending' and pa.invite_expires_at < now())),
      'suspended_admins',   count(*) filter (where pa.status = 'suspended'),
      'revoked_admins',     count(*) filter (where pa.status = 'revoked'),
      'mfa_enabled_admins', count(*) filter (where pa.status = 'active' and pa.revoked_at is null and exists (
                              select 1 from auth.mfa_factors f where f.user_id = pa.user_id and f.status = 'verified')),
      'admin_sessions',     (select count(*) from auth.sessions s where s.user_id in (select a.user_id from public.platform_admins a where a.status = 'active' and a.revoked_at is null)),
      'security_events_24h', (select count(*) from public.admin_audit_log l
                               where l.created_at > now() - interval '24 hours'
                                 and (l.action like 'platform_admin.%' or l.action like 'platform_security.%')),
      'is_production_database', app.is_production_database()
    )
    from public.platform_admins pa
  );
end;
$$;

revoke execute on function public.admin_security_overview() from public, anon, authenticated;
grant execute on function public.admin_security_overview() to authenticated;

create or replace function public.admin_access_history(
  p_category text default null,
  p_limit integer default 25,
  p_offset integer default 0
) returns table (
  event_id bigint,
  event_action text,
  actor_email text,
  actor_role text,
  entity_type text,
  entity_id text,
  old_values jsonb,
  new_values jsonb,
  metadata jsonb,
  event_environment text,
  occurred_at timestamptz,
  total_count bigint
)
language sql
stable
security definer
set search_path = public, app, pg_temp
as $$
  select
    l.id, l.action, u.email::text, l.actor_role, l.entity_type, l.entity_id,
    l.old_values, l.new_values, l.metadata, l.environment, l.created_at,
    count(*) over()
  from public.admin_audit_log l
  left join auth.users u on u.id = l.admin_id
  where app.has_platform_permission('audit.view')
    and (
      case coalesce(p_category, 'all')
        when 'admins'      then l.action like 'platform_admin.%' or l.action in ('admin.grant', 'admin.revoke')
        when 'settings'    then l.action like 'platform_settings.%'
        when 'environment' then l.action like 'platform_environment.%'
        when 'security'    then l.action like 'platform_security.%'
        when 'integration' then l.action like 'platform_integration.%'
        else l.action like 'platform_admin.%' or l.action like 'platform_settings.%'
          or l.action like 'platform_environment.%' or l.action like 'platform_security.%'
          or l.action like 'platform_integration.%' or l.action in ('admin.grant', 'admin.revoke')
      end
    )
  order by l.created_at desc, l.id desc
  limit least(greatest(coalesce(p_limit, 25), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0)
$$;

revoke execute on function public.admin_access_history(text, integer, integer) from public, anon, authenticated;
grant execute on function public.admin_access_history(text, integer, integer) to authenticated;

create or replace function public.admin_log_environment_switch(p_from text, p_to text)
returns void
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
begin
  if not app.is_platform_admin() then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;
  if p_from not in ('development', 'production') or p_to not in ('development', 'production') or p_from = p_to then
    raise exception 'Invalid environment switch.' using errcode = 'invalid_parameter_value';
  end if;
  perform app.write_admin_audit('platform_environment.switched', 'platform_environment', null,
    jsonb_build_object('environment', p_from), jsonb_build_object('environment', p_to), null);
end;
$$;

revoke execute on function public.admin_log_environment_switch(text, text) from public, anon, authenticated;
grant execute on function public.admin_log_environment_switch(text, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- Read models for Integrations / System / Data & Privacy. Counts and
-- timestamps only — no payloads, no keys, no cron command text.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.admin_integration_health()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app, pg_temp
as $$
begin
  if not app.has_platform_permission('integrations.view') then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;

  return jsonb_build_object(
    'webhooks', coalesce((
      select jsonb_agg(to_jsonb(w))
      from (
        select
          e.provider,
          max(e.received_at) as last_received_at,
          count(*) filter (where e.received_at > now() - interval '24 hours') as events_24h,
          count(*) filter (where e.received_at > now() - interval '24 hours' and e.signature_verified is not true) as signature_failures_24h,
          count(*) filter (where e.received_at > now() - interval '24 hours' and e.processing_error is not null) as processing_errors_24h
        from public.payment_provider_events e
        group by e.provider
      ) w
    ), '[]'::jsonb),
    'whatsapp', (
      select jsonb_build_object(
        'total', count(*),
        'connected', count(*) filter (where w.status = 'connected'),
        'with_error', count(*) filter (where w.last_error is not null and w.status = 'connected'),
        'last_webhook_at', max(w.last_webhook_at),
        'tokens_expiring_7d', count(*) filter (where w.status = 'connected' and w.token_expires_at < now() + interval '7 days')
      )
      from public.whatsapp_integrations w
    ),
    'gateways', (
      select jsonb_build_object(
        'total', count(*),
        'connected', count(*) filter (where g.status = 'connected'),
        'with_error', count(*) filter (where g.last_error is not null and g.status = 'connected')
      )
      from public.payment_gateway_integrations g
    ),
    'email', (
      select jsonb_build_object(
        'sent_24h', count(*) filter (where l.status = 'sent' and l.sent_at > now() - interval '24 hours'),
        'failed_24h', count(*) filter (where l.status = 'failed' and l.sent_at > now() - interval '24 hours'),
        'last_sent_at', max(l.sent_at) filter (where l.status = 'sent'),
        'last_failed_at', max(l.sent_at) filter (where l.status = 'failed')
      )
      from public.email_log l
    )
  );
end;
$$;

revoke execute on function public.admin_integration_health() from public, anon, authenticated;
grant execute on function public.admin_integration_health() to authenticated;

create or replace function public.admin_cron_health()
returns table (
  job_name text,
  job_schedule text,
  job_active boolean,
  last_run_at timestamptz,
  last_status text,
  last_error text,
  last_duration_ms numeric,
  runs_24h bigint,
  failed_24h bigint
)
language plpgsql
stable
security definer
set search_path = public, app, pg_temp
as $$
begin
  if not app.has_platform_permission('system.view') then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;
  if to_regclass('cron.job') is null then
    return;
  end if;

  return query
  select
    j.jobname::text,
    j.schedule::text,
    j.active,
    lr.start_time,
    lr.status::text,
    case when lr.status = 'failed' then left(lr.return_message, 200) end,
    extract(epoch from (lr.end_time - lr.start_time)) * 1000,
    (select count(*) from cron.job_run_details d where d.jobid = j.jobid and d.start_time > now() - interval '24 hours'),
    (select count(*) from cron.job_run_details d where d.jobid = j.jobid and d.start_time > now() - interval '24 hours' and d.status = 'failed')
  from cron.job j
  left join lateral (
    select d.start_time, d.end_time, d.status, d.return_message
    from cron.job_run_details d where d.jobid = j.jobid
    order by d.start_time desc limit 1
  ) lr on true
  order by j.jobname;
end;
$$;

revoke execute on function public.admin_cron_health() from public, anon, authenticated;
grant execute on function public.admin_cron_health() to authenticated;

create or replace function public.admin_system_info()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app, pg_temp
as $$
begin
  if not app.has_platform_permission('system.view') then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;

  return jsonb_build_object(
    'environment', (select c.environment from public.disaster_recovery_config c limit 1),
    'database_identifier', (select c.database_identifier from public.disaster_recovery_config c limit 1),
    'maintenance_mode', coalesce((select c.maintenance_mode from public.disaster_recovery_config c limit 1), false),
    'postgres_version', current_setting('server_version'),
    'server_time', now(),
    'cron_available', to_regclass('cron.job') is not null,
    'open_critical_alerts', (select count(*) from public.system_alerts a where a.severity = 'critical' and a.resolved_at is null),
    'billing_model', (select b.billing_model from public.platform_billing_settings b limit 1)
  );
end;
$$;

revoke execute on function public.admin_system_info() from public, anon, authenticated;
grant execute on function public.admin_system_info() to authenticated;

create or replace function public.admin_get_data_policy()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app, pg_temp
as $$
begin
  if not app.has_platform_permission('privacy.view') then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;

  return (
    select jsonb_build_object(
      'api_raw_retention_days', s.raw_retention_days,
      'api_hourly_retention_days', s.hourly_retention_days,
      'api_settings_updated_at', s.updated_at
    )
    from public.api_monitor_settings s limit 1
  );
end;
$$;

revoke execute on function public.admin_get_data_policy() from public, anon, authenticated;
grant execute on function public.admin_get_data_policy() to authenticated;

-- api_monitor_settings.raw/hourly_retention_days are read by the daily
-- api-metrics-prune job, so changing them here really changes what is kept.
create or replace function public.admin_update_api_retention(p_raw_days integer, p_hourly_days integer)
returns void
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_old public.api_monitor_settings%rowtype;
begin
  if not app.has_platform_permission('privacy.manage') then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;
  if p_raw_days is null or p_raw_days not between 1 and 30 then
    raise exception 'Raw request retention must be between 1 and 30 days.' using errcode = 'invalid_parameter_value';
  end if;
  if p_hourly_days is null or p_hourly_days not between 7 and 365 then
    raise exception 'Hourly summary retention must be between 7 and 365 days.' using errcode = 'invalid_parameter_value';
  end if;
  if p_hourly_days < p_raw_days then
    raise exception 'Hourly summaries must be kept at least as long as raw requests.' using errcode = 'invalid_parameter_value';
  end if;

  select * into v_old from public.api_monitor_settings limit 1 for update;
  if not found then
    raise exception 'API monitoring is not set up on this environment.' using errcode = 'no_data_found';
  end if;
  if v_old.raw_retention_days = p_raw_days and v_old.hourly_retention_days = p_hourly_days then
    return;
  end if;

  update public.api_monitor_settings
  set raw_retention_days = p_raw_days, hourly_retention_days = p_hourly_days, updated_at = now();

  perform app.write_admin_audit('platform_settings.updated', 'api_monitor_settings', null,
    jsonb_build_object('api_raw_retention_days', v_old.raw_retention_days, 'api_hourly_retention_days', v_old.hourly_retention_days),
    jsonb_build_object('api_raw_retention_days', p_raw_days, 'api_hourly_retention_days', p_hourly_days), null);
end;
$$;

revoke execute on function public.admin_update_api_retention(integer, integer) from public, anon, authenticated;
grant execute on function public.admin_update_api_retention(integer, integer) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- admin_create_gym_owner_invitation — re-created from the live definition
-- (1012 + later patches) with exactly two changes:
--   1. gate is gyms.manage instead of "any admin";
--   2. if an admin has saved a default grace period (Settings → Platform
--      defaults), the new gym's subscription gets it. With no saved setting
--      nothing changes, so the tenant column default (7 days) still applies.
-- The trial length / country / timezone / currency defaults are applied by
-- the invite form (it pre-fills them), so they need no change here.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.admin_create_gym_owner_invitation(
  p_gym_name text, p_owner_first_name text, p_owner_last_name text, p_email text,
  p_phone text default null, p_address_line text default null, p_city text default null,
  p_state text default null, p_country text default null, p_postal_code text default null,
  p_default_timezone text default 'Asia/Kolkata', p_default_currency text default 'INR',
  p_billing_mode text default 'trial', p_trial_days integer default 14,
  p_package_id uuid default null, p_period_days integer default null, p_notes text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_admin_id uuid := auth.uid();
  v_org_id uuid;
  v_gym_id uuid;
  v_gym_code text;
  v_slug citext;
  v_invitation_id uuid;
  v_pkg record;
  v_email citext;
  v_default_grace integer;
begin
  if not app.has_platform_permission('gyms.manage') then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;

  if p_gym_name is null or btrim(p_gym_name) = '' then
    raise exception 'Enter a gym name.' using errcode = 'invalid_parameter_value';
  end if;
  if p_owner_first_name is null or btrim(p_owner_first_name) = '' then
    raise exception 'Enter the owner''s first name.' using errcode = 'invalid_parameter_value';
  end if;
  if p_email is null or btrim(p_email) = '' or p_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Enter a valid email address.' using errcode = 'invalid_parameter_value';
  end if;
  if p_billing_mode not in ('trial', 'paid', 'custom') then
    raise exception 'Choose a valid billing mode.' using errcode = 'invalid_parameter_value';
  end if;

  v_email := lower(btrim(p_email))::citext;

  if exists (select 1 from staff_memberships where email = v_email) then
    raise exception 'This email already belongs to a member of an existing gym.' using errcode = 'unique_violation';
  end if;
  if exists (select 1 from staff_invitations where email = v_email and status = 'pending') then
    raise exception 'This email already has a pending invitation.' using errcode = 'unique_violation';
  end if;
  if exists (select 1 from auth.users where email = v_email) then
    raise exception 'This email already has a MyFitDesk account that is not linked to any gym yet. Resolve it manually (in Supabase Auth) before inviting it here — a brand-new invite only works for an email with no existing account.' using errcode = 'unique_violation';
  end if;

  if p_billing_mode = 'paid' then
    if p_package_id is null then
      raise exception 'Choose a subscription plan.' using errcode = 'invalid_parameter_value';
    end if;
    select * into v_pkg from platform_packages where id = p_package_id and status = 'active';
    if v_pkg.id is null then
      raise exception 'That plan is not available.' using errcode = 'invalid_parameter_value';
    end if;
  elsif p_billing_mode = 'custom' then
    if p_period_days is null or p_period_days <= 0 then
      raise exception 'Enter how many days of access to grant.' using errcode = 'invalid_parameter_value';
    end if;
  end if;

  v_slug := (regexp_replace(lower(btrim(p_gym_name)), '[^a-z0-9]+', '-', 'g') || '-' || substr(md5(random()::text), 1, 6))::citext;

  insert into organizations (
    slug, name, contact_email, contact_phone, address_line, city, state, country, postal_code,
    default_timezone, default_currency
  ) values (
    v_slug, btrim(p_gym_name), v_email, nullif(btrim(coalesce(p_phone, '')), ''),
    nullif(btrim(coalesce(p_address_line, '')), ''), nullif(btrim(coalesce(p_city, '')), ''),
    nullif(btrim(coalesce(p_state, '')), ''), nullif(btrim(coalesce(p_country, '')), ''),
    nullif(btrim(coalesce(p_postal_code, '')), ''),
    coalesce(nullif(btrim(p_default_timezone), ''), 'Asia/Kolkata'),
    coalesce(nullif(btrim(p_default_currency), ''), 'INR')
  )
  returning id, gym_code into v_org_id, v_gym_code;

  insert into gyms (organization_id, slug, name) values (v_org_id, 'main', btrim(p_gym_name))
  returning id into v_gym_id;

  insert into branches (organization_id, gym_id, name) values (v_org_id, v_gym_id, 'Main Branch');

  if p_billing_mode = 'trial' then
    update organization_subscriptions
    set current_period_end = now() + (greatest(coalesce(p_trial_days, 14), 1) || ' days')::interval,
        status = 'trialing'
    where organization_id = v_org_id;
  elsif p_billing_mode = 'paid' then
    update organization_subscriptions
    set package_id = v_pkg.id,
        status = 'active',
        current_period_start = now(),
        current_period_end = now() + (coalesce(p_period_days, v_pkg.duration_days) || ' days')::interval,
        cancelled_at = null
    where organization_id = v_org_id;
  else -- custom
    update organization_subscriptions
    set package_id = null,
        status = 'active',
        current_period_start = now(),
        current_period_end = now() + (p_period_days || ' days')::interval,
        cancelled_at = null
    where organization_id = v_org_id;
  end if;

  select (s.value #>> '{}')::integer into v_default_grace
  from public.platform_settings s where s.key = 'defaults.grace_days';
  if v_default_grace is not null then
    update organization_subscriptions set grace_days = v_default_grace where organization_id = v_org_id;
  end if;

  insert into staff_invitations (
    organization_id, organization_name_snapshot, branch_id, email, role, invited_by,
    invited_first_name, invited_last_name, invited_phone
  ) values (
    v_org_id, btrim(p_gym_name), null, v_email, 'owner', v_admin_id,
    nullif(btrim(p_owner_first_name), ''), nullif(btrim(coalesce(p_owner_last_name, '')), ''),
    nullif(btrim(coalesce(p_phone, '')), '')
  )
  returning id into v_invitation_id;

  insert into admin_audit_log (admin_id, action, target_organization_id, detail)
  values (
    v_admin_id, 'gym.created', v_org_id,
    jsonb_build_object(
      'gym_name', btrim(p_gym_name), 'gym_code', v_gym_code, 'billing_mode', p_billing_mode,
      'package_id', p_package_id, 'notes', nullif(btrim(coalesce(p_notes, '')), '')
    )
  );
  insert into admin_audit_log (admin_id, action, target_organization_id, detail)
  values (
    v_admin_id, 'invitation.sent', v_org_id,
    jsonb_build_object('invitation_id', v_invitation_id, 'email', v_email)
  );

  return jsonb_build_object(
    'organization_id', v_org_id,
    'gym_code', v_gym_code,
    'invitation_id', v_invitation_id,
    'email', v_email
  );
end;
$$;
