-- MyFitDesk disaster-recovery control plane.
--
-- Backups intentionally contain the application-managed `public` and `app`
-- schemas only. The worker excludes every table in this control plane plus
-- platform_admins/admin_audit_log, and never dumps Supabase-managed schemas
-- (auth, storage, realtime, extensions). This is an application-data logical
-- recovery system, not a replacement for Supabase PITR/WAL recovery.

create table if not exists public.disaster_recovery_config (
  singleton boolean primary key default true check (singleton),
  environment text not null unique check (environment in ('development', 'production')),
  database_identifier text not null unique check (length(database_identifier) between 3 and 200),
  maintenance_mode boolean not null default false,
  maintenance_reason text,
  maintenance_enabled_at timestamptz,
  maintenance_enabled_by uuid references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now()
);

create table if not exists public.database_backups (
  id uuid primary key default gen_random_uuid(),
  environment text not null check (environment in ('development', 'production')),
  backup_type text not null check (backup_type in ('hourly', 'daily', 'monthly', 'manual', 'pre_restore', 'pre_migration')),
  storage_key text unique,
  filename text,
  file_size_bytes bigint check (file_size_bytes is null or file_size_bytes >= 0),
  checksum_sha256 text check (checksum_sha256 is null or checksum_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  duration_ms bigint check (duration_ms is null or duration_ms >= 0),
  status text not null default 'queued' check (status in ('queued', 'creating', 'ready', 'failed', 'restoring', 'delete_requested', 'deleted', 'corrupted')),
  error_message text,
  database_identifier text not null,
  trigger_type text not null check (trigger_type in ('scheduled', 'manual', 'restore_safety', 'migration')),
  triggered_by uuid references auth.users(id) on delete restrict,
  verified_at timestamptz,
  verification_status text not null default 'pending' check (verification_status in ('pending', 'verified', 'failed', 'corrupted')),
  protected boolean not null default false,
  delete_requested_at timestamptz,
  delete_requested_by uuid references auth.users(id) on delete restrict,
  deleted_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  constraint database_backups_ready_fields check (
    status <> 'ready' or (
      storage_key is not null and filename is not null and file_size_bytes is not null and
      checksum_sha256 is not null and completed_at is not null
    )
  )
);

create index if not exists database_backups_environment_created_idx
  on public.database_backups (environment, created_at desc);
create index if not exists database_backups_retention_idx
  on public.database_backups (environment, backup_type, created_at)
  where status = 'ready' and protected = false;
create index if not exists database_backups_queued_idx
  on public.database_backups (created_at)
  where status in ('queued', 'delete_requested');

create table if not exists public.database_restore_history (
  id uuid primary key default gen_random_uuid(),
  environment text not null check (environment in ('development', 'production')),
  backup_id uuid not null references public.database_backups(id) on delete restrict,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'queued' check (status in ('queued', 'preparing', 'backing_up_current', 'downloading', 'verifying_checksum', 'restoring', 'verifying', 'completing', 'completed', 'failed')),
  requested_by uuid not null references auth.users(id) on delete restrict,
  pre_restore_backup_id uuid references public.database_backups(id) on delete restrict,
  duration_ms bigint check (duration_ms is null or duration_ms >= 0),
  error_message text,
  records_verified jsonb,
  maintenance_mode_enabled boolean not null default false,
  checksum_verified boolean not null default false,
  request_id text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists database_restore_history_environment_started_idx
  on public.database_restore_history (environment, started_at desc);
create unique index if not exists database_restore_one_active_per_environment_idx
  on public.database_restore_history (environment)
  where status not in ('completed', 'failed');

create table if not exists public.system_alerts (
  id uuid primary key default gen_random_uuid(),
  severity text not null check (severity in ('info', 'warning', 'critical')),
  type text not null,
  environment text not null check (environment in ('development', 'production')),
  gym_id uuid,
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete restrict
);

create index if not exists system_alerts_open_idx
  on public.system_alerts (environment, severity, created_at desc)
  where resolved_at is null;

create table if not exists public.system_data_snapshots (
  id bigint generated always as identity primary key,
  captured_at timestamptz not null default now(),
  environment text not null check (environment in ('development', 'production')),
  gym_count bigint not null check (gym_count >= 0),
  member_count bigint not null check (member_count >= 0),
  subscription_count bigint not null check (subscription_count >= 0),
  payment_count bigint not null check (payment_count >= 0),
  staff_count bigint not null check (staff_count >= 0)
);

create index if not exists system_data_snapshots_environment_at_idx
  on public.system_data_snapshots (environment, captured_at desc);

-- Extend the existing centralized platform-admin audit table rather than
-- creating a competing second audit log. Existing columns stay compatible.
alter table public.admin_audit_log
  add column if not exists environment text check (environment in ('development', 'production')),
  add column if not exists gym_id uuid,
  add column if not exists actor_role text,
  add column if not exists entity_type text,
  add column if not exists entity_id text,
  add column if not exists old_values jsonb,
  add column if not exists new_values jsonb,
  add column if not exists metadata jsonb,
  add column if not exists ip_address inet,
  add column if not exists request_id text,
  add column if not exists created_at timestamptz;

update public.admin_audit_log set created_at = at where created_at is null;
alter table public.admin_audit_log alter column created_at set default now();
alter table public.admin_audit_log alter column created_at set not null;
create index if not exists admin_audit_log_environment_created_idx
  on public.admin_audit_log (environment, created_at desc);
create index if not exists admin_audit_log_entity_idx
  on public.admin_audit_log (entity_type, entity_id, created_at desc);

-- These tables are readable only by authenticated platform admins. All
-- writes happen through the narrowly-scoped RPCs below or the service-role
-- worker; no client role receives direct insert/update/delete privileges.
alter table public.disaster_recovery_config enable row level security;
alter table public.disaster_recovery_config force row level security;
alter table public.database_backups enable row level security;
alter table public.database_backups force row level security;
alter table public.database_restore_history enable row level security;
alter table public.database_restore_history force row level security;
alter table public.system_alerts enable row level security;
alter table public.system_alerts force row level security;
alter table public.system_data_snapshots enable row level security;
alter table public.system_data_snapshots force row level security;

drop policy if exists dr_config_admin_select on public.disaster_recovery_config;
create policy dr_config_admin_select on public.disaster_recovery_config for select to authenticated using (app.is_platform_admin());
drop policy if exists database_backups_admin_select on public.database_backups;
create policy database_backups_admin_select on public.database_backups for select to authenticated using (app.is_platform_admin());
drop policy if exists restore_history_admin_select on public.database_restore_history;
create policy restore_history_admin_select on public.database_restore_history for select to authenticated using (app.is_platform_admin());
drop policy if exists system_alerts_admin_select on public.system_alerts;
create policy system_alerts_admin_select on public.system_alerts for select to authenticated using (app.is_platform_admin());
drop policy if exists data_snapshots_admin_select on public.system_data_snapshots;
create policy data_snapshots_admin_select on public.system_data_snapshots for select to authenticated using (app.is_platform_admin());

revoke all on public.disaster_recovery_config, public.database_backups,
  public.database_restore_history, public.system_alerts,
  public.system_data_snapshots from anon, authenticated;
grant select on public.disaster_recovery_config, public.database_backups,
  public.database_restore_history, public.system_alerts,
  public.system_data_snapshots to authenticated;

create or replace function public.admin_queue_database_backup(
  p_environment text,
  p_ip_address inet default null,
  p_request_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_id uuid;
  v_identifier text;
begin
  if not app.is_platform_admin() then raise exception 'Platform administrator access required' using errcode = '42501'; end if;
  select database_identifier into v_identifier from disaster_recovery_config where singleton and environment = p_environment;
  if v_identifier is null then raise exception 'Disaster recovery is not configured for this environment'; end if;
  if exists (
    select 1 from database_backups
    where triggered_by = auth.uid() and trigger_type = 'manual'
      and created_at > now() - interval '5 minutes' and status not in ('failed', 'deleted')
  ) then raise exception 'A manual backup was already requested in the last five minutes'; end if;

  insert into database_backups (environment, backup_type, database_identifier, trigger_type, triggered_by)
  values (p_environment, 'manual', v_identifier, 'manual', auth.uid()) returning id into v_id;

  insert into admin_audit_log (admin_id, action, detail, environment, actor_role, entity_type, entity_id, metadata, ip_address, request_id)
  values (auth.uid(), 'database.backup_requested', jsonb_build_object('backup_id', v_id), p_environment,
    'platform_admin', 'database_backup', v_id::text, jsonb_build_object('trigger_type', 'manual'), p_ip_address, p_request_id);
  return v_id;
end;
$$;

create or replace function public.admin_queue_database_restore(
  p_backup_id uuid,
  p_environment text,
  p_confirmation text,
  p_ip_address inet default null,
  p_request_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_backup database_backups%rowtype;
  v_id uuid;
  v_expected text;
  v_iat bigint;
begin
  if not app.is_platform_admin() then raise exception 'Platform administrator access required' using errcode = '42501'; end if;
  v_expected := case when p_environment = 'production' then 'RESTORE PRODUCTION' else 'RESTORE DEVELOPMENT' end;
  if p_confirmation is distinct from v_expected then raise exception 'Typed confirmation does not match'; end if;
  select coalesce((auth.jwt() ->> 'iat')::bigint, 0) into v_iat;
  if v_iat = 0 or to_timestamp(v_iat) < now() - interval '15 minutes' then
    raise exception 'Recent authentication is required. Sign out and sign in again before restoring.' using errcode = '42501';
  end if;
  if not exists (select 1 from disaster_recovery_config where singleton and environment = p_environment) then
    raise exception 'Disaster recovery is not configured for this environment';
  end if;
  select * into v_backup from database_backups where id = p_backup_id for update;
  if not found then raise exception 'Backup not found'; end if;
  if v_backup.environment <> p_environment then raise exception 'Backup environment does not match target environment'; end if;
  if v_backup.status <> 'ready' or v_backup.verification_status <> 'verified' then
    raise exception 'Only ready, verified backups can be restored';
  end if;
  if exists (select 1 from database_restore_history where environment = p_environment and status not in ('completed', 'failed')) then
    raise exception 'A restore is already active for this environment';
  end if;
  if exists (select 1 from database_restore_history where requested_by = auth.uid() and started_at > now() - interval '10 minutes') then
    raise exception 'A restore was already requested by this administrator in the last ten minutes';
  end if;

  insert into database_restore_history (environment, backup_id, requested_by, request_id)
  values (p_environment, p_backup_id, auth.uid(), p_request_id) returning id into v_id;
  update database_backups set status = 'restoring' where id = p_backup_id;
  insert into admin_audit_log (admin_id, action, detail, environment, actor_role, entity_type, entity_id, metadata, ip_address, request_id)
  values (auth.uid(), 'database.restore_requested', jsonb_build_object('backup_id', p_backup_id, 'restore_id', v_id),
    p_environment, 'platform_admin', 'database_restore', v_id::text,
    jsonb_build_object('backup_id', p_backup_id), p_ip_address, p_request_id);
  return v_id;
end;
$$;

create or replace function public.admin_set_backup_protected(p_backup_id uuid, p_protected boolean)
returns void language plpgsql security definer set search_path = public, app, pg_temp as $$
declare v_environment text;
begin
  if not app.is_platform_admin() then raise exception 'Platform administrator access required' using errcode = '42501'; end if;
  update database_backups set protected = p_protected where id = p_backup_id and status not in ('deleted', 'delete_requested') returning environment into v_environment;
  if not found then raise exception 'Backup not found or cannot be changed'; end if;
  insert into admin_audit_log (admin_id, action, environment, actor_role, entity_type, entity_id, new_values)
  values (auth.uid(), case when p_protected then 'database.backup_protected' else 'database.backup_unprotected' end,
    v_environment, 'platform_admin', 'database_backup', p_backup_id::text, jsonb_build_object('protected', p_protected));
end;
$$;

create or replace function public.admin_request_backup_deletion(p_backup_id uuid, p_confirmation text)
returns void language plpgsql security definer set search_path = public, app, pg_temp as $$
declare v_backup database_backups%rowtype;
begin
  if not app.is_platform_admin() then raise exception 'Platform administrator access required' using errcode = '42501'; end if;
  select * into v_backup from database_backups where id = p_backup_id for update;
  if not found then raise exception 'Backup not found'; end if;
  if v_backup.protected then raise exception 'Protected backups cannot be deleted'; end if;
  if v_backup.status not in ('ready', 'failed', 'corrupted') then raise exception 'Backup cannot be deleted in its current state'; end if;
  if v_backup.environment = 'production' and p_confirmation <> 'DELETE PRODUCTION BACKUP' then raise exception 'Typed confirmation does not match'; end if;
  update database_backups set status = 'delete_requested', delete_requested_at = now(), delete_requested_by = auth.uid() where id = p_backup_id;
  insert into admin_audit_log (admin_id, action, environment, actor_role, entity_type, entity_id, old_values, new_values)
  values (auth.uid(), 'database.backup_deletion_requested', v_backup.environment, 'platform_admin', 'database_backup', p_backup_id::text,
    jsonb_build_object('status', v_backup.status), jsonb_build_object('status', 'delete_requested'));
end;
$$;

create or replace function public.admin_set_maintenance_mode(
  p_environment text,
  p_enabled boolean,
  p_reason text,
  p_confirmation text
)
returns void language plpgsql security definer set search_path = public, app, pg_temp as $$
begin
  if not app.is_platform_admin() then raise exception 'Platform administrator access required' using errcode = '42501'; end if;
  if p_environment = 'production' and p_confirmation <> case when p_enabled then 'ENABLE MAINTENANCE' else 'DISABLE MAINTENANCE' end then
    raise exception 'Typed confirmation does not match';
  end if;
  update disaster_recovery_config
  set maintenance_mode = p_enabled,
      maintenance_reason = case when p_enabled then nullif(trim(p_reason), '') else null end,
      maintenance_enabled_at = case when p_enabled then now() else null end,
      maintenance_enabled_by = case when p_enabled then auth.uid() else null end,
      updated_at = now()
  where singleton and environment = p_environment;
  if not found then raise exception 'Disaster recovery is not configured for this environment'; end if;
  insert into admin_audit_log (admin_id, action, environment, actor_role, entity_type, entity_id, new_values)
  values (auth.uid(), case when p_enabled then 'system.maintenance_enabled' else 'system.maintenance_disabled' end,
    p_environment, 'platform_admin', 'disaster_recovery_config', p_environment,
    jsonb_build_object('maintenance_mode', p_enabled, 'reason', nullif(trim(p_reason), '')));
end;
$$;

create or replace function public.admin_resolve_system_alert(p_alert_id uuid)
returns void language plpgsql security definer set search_path = public, app, pg_temp as $$
declare v_environment text;
begin
  if not app.is_platform_admin() then raise exception 'Platform administrator access required' using errcode = '42501'; end if;
  update system_alerts set resolved_at = now(), resolved_by = auth.uid()
  where id = p_alert_id and resolved_at is null returning environment into v_environment;
  if not found then raise exception 'Open alert not found'; end if;
  insert into admin_audit_log (admin_id, action, environment, actor_role, entity_type, entity_id)
  values (auth.uid(), 'system.alert_resolved', v_environment, 'platform_admin', 'system_alert', p_alert_id::text);
end;
$$;

-- Recycle bin over the tenant app's existing deletion semantics. No columns
-- are added to business tables here: members/subscriptions/inventory already
-- use deleted_at; organizations/staff use deletion_requested_at. Payments
-- are deliberately absent because financial records are never casually
-- deleted or restored.
create or replace function public.admin_deleted_records()
returns table (
  entity_type text,
  entity_id uuid,
  organization_id uuid,
  display_name text,
  deleted_at timestamptz,
  metadata jsonb
)
language sql stable security definer set search_path = public, app, pg_temp as $$
  select * from (
    select 'member'::text, m.id, m.organization_id, trim(m.first_name || ' ' || coalesce(m.last_name, '')), m.deleted_at,
      jsonb_build_object('email', m.email, 'status', m.status) from members m where m.deleted_at is not null
    union all
    select 'member_subscription', s.id, s.organization_id, s.plan_name_snapshot, s.deleted_at,
      jsonb_build_object('status', s.status, 'member_id', s.member_id) from member_subscriptions s where s.deleted_at is not null
    union all
    select 'inventory_product', p.id, p.organization_id, p.name, p.deleted_at,
      jsonb_build_object('status', p.status, 'sku', p.sku) from inventory_products p where p.deleted_at is not null
    union all
    select 'organization', o.id, o.id, o.name, o.deletion_requested_at,
      jsonb_build_object('slug', o.slug) from organizations o where o.deletion_requested_at is not null
    union all
    select 'staff_membership', s.id, s.organization_id, coalesce(nullif(trim(coalesce(s.first_name, '') || ' ' || coalesce(s.last_name, '')), ''), s.email),
      s.deletion_requested_at, jsonb_build_object('email', s.email, 'role', s.role)
      from staff_memberships s where s.deletion_requested_at is not null
  ) records
  where app.is_platform_admin()
  order by deleted_at desc;
$$;

create or replace function public.admin_restore_deleted_record(p_entity_type text, p_entity_id uuid)
returns void language plpgsql security definer set search_path = public, app, pg_temp as $$
declare v_org uuid;
begin
  if not app.is_platform_admin() then raise exception 'Platform administrator access required' using errcode = '42501'; end if;
  case p_entity_type
    when 'member' then update members set deleted_at = null, updated_at = now() where id = p_entity_id and deleted_at is not null returning organization_id into v_org;
    when 'member_subscription' then update member_subscriptions set deleted_at = null, updated_at = now() where id = p_entity_id and deleted_at is not null returning organization_id into v_org;
    when 'inventory_product' then update inventory_products set deleted_at = null, status = 'active', updated_at = now() where id = p_entity_id and deleted_at is not null returning organization_id into v_org;
    when 'organization' then update organizations set deletion_requested_at = null, updated_at = now() where id = p_entity_id and deletion_requested_at is not null returning id into v_org;
    when 'staff_membership' then update staff_memberships set deletion_requested_at = null where id = p_entity_id and deletion_requested_at is not null returning organization_id into v_org;
    else raise exception 'Unsupported deleted-record type';
  end case;
  if v_org is null then raise exception 'Deleted record not found'; end if;
  insert into admin_audit_log (admin_id, action, target_organization_id, actor_role, entity_type, entity_id, new_values)
  values (auth.uid(), 'record.restored', v_org, 'platform_admin', p_entity_type, p_entity_id::text, jsonb_build_object('restored', true));
end;
$$;

-- Hourly worker call: cheap counts plus obvious-drop detection. A 50% drop
-- alert requires a previous baseline of at least 20 records, which avoids
-- noisy alerts in small development datasets.
create or replace function public.record_system_data_snapshot(p_environment text, p_database_identifier text)
returns bigint language plpgsql security definer set search_path = public, pg_temp as $$
declare v_previous system_data_snapshots%rowtype; v_current system_data_snapshots%rowtype;
begin
  if current_user not in ('postgres', 'service_role', 'supabase_admin') then
    raise exception 'Database service role required' using errcode = '42501';
  end if;
  if not exists (select 1 from disaster_recovery_config where singleton and environment = p_environment and database_identifier = p_database_identifier) then
    raise exception 'Environment/database identifier mismatch';
  end if;
  select * into v_previous from system_data_snapshots where environment = p_environment order by captured_at desc limit 1;
  insert into system_data_snapshots (environment, gym_count, member_count, subscription_count, payment_count, staff_count)
  select p_environment,
    (select count(*) from organizations where deletion_requested_at is null),
    (select count(*) from members where deleted_at is null),
    (select count(*) from member_subscriptions where deleted_at is null),
    (select count(*) from payments),
    (select count(*) from staff_memberships where deletion_requested_at is null)
  returning * into v_current;
  if v_previous.id is not null then
    if v_previous.gym_count > 0 and v_current.gym_count = 0 then
      insert into system_alerts (severity, type, environment, message, metadata) values
      ('critical', 'important_table_empty', p_environment, 'Organization count unexpectedly became zero.',
       jsonb_build_object('table', 'organizations', 'previous', v_previous.gym_count));
    end if;
    if v_previous.member_count >= 20 and v_current.member_count * 2 < v_previous.member_count then
      insert into system_alerts (severity, type, environment, message, metadata) values
      ('critical', 'member_count_drop', p_environment,
       format('Member count dropped from %s to %s within the monitoring interval.', v_previous.member_count, v_current.member_count),
       jsonb_build_object('previous', v_previous.member_count, 'current', v_current.member_count));
    end if;
    if v_previous.payment_count >= 20 and v_current.payment_count * 2 < v_previous.payment_count then
      insert into system_alerts (severity, type, environment, message, metadata) values
      ('critical', 'payment_count_drop', p_environment,
       format('Payment count dropped from %s to %s within the monitoring interval.', v_previous.payment_count, v_current.payment_count),
       jsonb_build_object('previous', v_previous.payment_count, 'current', v_current.payment_count));
    end if;
    if v_previous.member_count > 0 and v_previous.member_count < 20 and v_current.member_count = 0 then
      insert into system_alerts (severity, type, environment, message, metadata) values
      ('critical', 'important_table_empty', p_environment, 'Member count unexpectedly became zero.',
       jsonb_build_object('table', 'members', 'previous', v_previous.member_count));
    end if;
    if v_previous.payment_count > 0 and v_previous.payment_count < 20 and v_current.payment_count = 0 then
      insert into system_alerts (severity, type, environment, message, metadata) values
      ('critical', 'important_table_empty', p_environment, 'Payment count unexpectedly became zero.',
       jsonb_build_object('table', 'payments', 'previous', v_previous.payment_count));
    end if;
  end if;
  return v_current.id;
end;
$$;

-- Minimal read surface for FitDeskApp's request guard. It exposes only the
-- maintenance boolean and user-facing message, never DR configuration or
-- credentials. The tenant app still needs to call this at its authenticated
-- layout boundary; see docs/DISASTER_RECOVERY.md.
create or replace function public.get_maintenance_status()
returns table (enabled boolean, message text)
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(maintenance_mode, false),
    coalesce(maintenance_reason, 'MyFitDesk is temporarily undergoing maintenance. Please try again shortly.')
  from disaster_recovery_config where singleton
  union all
  select false, 'MyFitDesk is available.'
  where not exists (select 1 from disaster_recovery_config where singleton)
  limit 1;
$$;

-- Central critical-entity audit bridge. The tenant app already has its own
-- immutable audit_log for payments/subscriptions/plans/staff; these triggers
-- additionally feed the platform-wide admin trail and cover the other core
-- entities. Obvious secret-shaped fields are stripped structurally.
create or replace function app.write_platform_critical_audit()
returns trigger
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_old jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_new jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_org uuid;
  v_environment text;
  v_entity_id text;
  v_action text;
  v_actor_role text;
begin
  v_old := v_old - array['password', 'password_hash', 'token', 'secret', 'provider_metadata'];
  v_new := v_new - array['password', 'password_hash', 'token', 'secret', 'provider_metadata'];
  v_org := case when tg_table_name = 'organizations' then (v_row ->> 'id')::uuid else nullif(v_row ->> 'organization_id', '')::uuid end;
  v_entity_id := v_row ->> 'id';
  v_action := tg_table_name || '.' || lower(tg_op);
  select environment into v_environment from disaster_recovery_config where singleton;
  select role into v_actor_role from staff_memberships where organization_id = v_org and user_id = auth.uid() limit 1;
  insert into admin_audit_log (
    admin_id, action, target_organization_id, detail, environment, actor_role,
    entity_type, entity_id, old_values, new_values, metadata
  ) values (
    auth.uid(), v_action, v_org, jsonb_build_object('operation', tg_op), v_environment,
    coalesce(v_actor_role, case when app.is_platform_admin() then 'platform_admin' else 'system' end),
    tg_table_name, v_entity_id, v_old, v_new, jsonb_build_object('source', 'database_trigger')
  );

  if v_environment is not null and tg_table_name = 'organizations' and
     (tg_op = 'DELETE' or (tg_op = 'UPDATE' and (v_new ->> 'deletion_requested_at') is not null and (v_old ->> 'deletion_requested_at') is null)) then
    insert into system_alerts (severity, type, environment, gym_id, message, metadata)
    values ('critical', 'organization_deleted', v_environment, v_org,
      'An organization was deleted or marked for deletion.', jsonb_build_object('organization_id', v_org, 'operation', tg_op));
  end if;

  if v_environment is not null and tg_table_name = 'members' and
     (tg_op = 'DELETE' or (tg_op = 'UPDATE' and (v_new ->> 'deleted_at') is not null and (v_old ->> 'deleted_at') is null)) and
     (select count(*) from admin_audit_log where entity_type = 'members' and created_at > now() - interval '5 minutes'
       and action in ('members.delete', 'members.update')) >= 25 and
     not exists (select 1 from system_alerts where type = 'member_delete_spike' and environment = v_environment
       and created_at > now() - interval '5 minutes') then
    insert into system_alerts (severity, type, environment, gym_id, message, metadata)
    values ('critical', 'member_delete_spike', v_environment, v_org,
      'At least 25 member deletion events occurred within five minutes.', jsonb_build_object('window_minutes', 5, 'threshold', 25));
  end if;
  if v_environment is not null and tg_op = 'UPDATE' and
     (select count(*) from admin_audit_log where entity_type = tg_table_name and action = v_action
       and created_at > now() - interval '5 minutes') >= 100 and
     not exists (select 1 from system_alerts where type = 'bulk_update' and environment = v_environment
       and metadata ->> 'table' = tg_table_name and created_at > now() - interval '5 minutes') then
    insert into system_alerts (severity, type, environment, gym_id, message, metadata)
    values ('warning', 'bulk_update', v_environment, v_org,
      format('At least 100 %s records were updated within five minutes.', tg_table_name),
      jsonb_build_object('table', tg_table_name, 'window_minutes', 5, 'threshold', 100));
  end if;
  return null;
end;
$$;

drop trigger if exists platform_audit_organizations on public.organizations;
create trigger platform_audit_organizations after insert or update or delete on public.organizations for each row execute function app.write_platform_critical_audit();
drop trigger if exists platform_audit_gyms on public.gyms;
create trigger platform_audit_gyms after insert or update or delete on public.gyms for each row execute function app.write_platform_critical_audit();
drop trigger if exists platform_audit_branches on public.branches;
create trigger platform_audit_branches after insert or update or delete on public.branches for each row execute function app.write_platform_critical_audit();
drop trigger if exists platform_audit_members on public.members;
create trigger platform_audit_members after insert or update or delete on public.members for each row execute function app.write_platform_critical_audit();
drop trigger if exists platform_audit_staff on public.staff_memberships;
create trigger platform_audit_staff after insert or update or delete on public.staff_memberships for each row execute function app.write_platform_critical_audit();
drop trigger if exists platform_audit_subscriptions on public.member_subscriptions;
create trigger platform_audit_subscriptions after insert or update or delete on public.member_subscriptions for each row execute function app.write_platform_critical_audit();
drop trigger if exists platform_audit_payments on public.payments;
create trigger platform_audit_payments after insert or update or delete on public.payments for each row execute function app.write_platform_critical_audit();
drop trigger if exists platform_audit_plans on public.membership_plans;
create trigger platform_audit_plans after insert or update or delete on public.membership_plans for each row execute function app.write_platform_critical_audit();
drop trigger if exists platform_audit_inventory on public.inventory_products;
create trigger platform_audit_inventory after insert or update or delete on public.inventory_products for each row execute function app.write_platform_critical_audit();

-- Explicit function permissions; new tables are not exposed for direct writes.
revoke execute on function public.admin_queue_database_backup(text, inet, text) from public, anon, authenticated;
revoke execute on function public.admin_queue_database_restore(uuid, text, text, inet, text) from public, anon, authenticated;
revoke execute on function public.admin_set_backup_protected(uuid, boolean) from public, anon, authenticated;
revoke execute on function public.admin_request_backup_deletion(uuid, text) from public, anon, authenticated;
revoke execute on function public.admin_set_maintenance_mode(text, boolean, text, text) from public, anon, authenticated;
revoke execute on function public.admin_resolve_system_alert(uuid) from public, anon, authenticated;
revoke execute on function public.admin_deleted_records() from public, anon, authenticated;
revoke execute on function public.admin_restore_deleted_record(text, uuid) from public, anon, authenticated;
revoke execute on function public.record_system_data_snapshot(text, text) from public, anon, authenticated;
revoke execute on function public.get_maintenance_status() from public, anon, authenticated;
revoke execute on function app.write_platform_critical_audit() from public, anon, authenticated;
grant execute on function public.admin_queue_database_backup(text, inet, text) to authenticated;
grant execute on function public.admin_queue_database_restore(uuid, text, text, inet, text) to authenticated;
grant execute on function public.admin_set_backup_protected(uuid, boolean) to authenticated;
grant execute on function public.admin_request_backup_deletion(uuid, text) to authenticated;
grant execute on function public.admin_set_maintenance_mode(text, boolean, text, text) to authenticated;
grant execute on function public.admin_resolve_system_alert(uuid) to authenticated;
grant execute on function public.admin_deleted_records() to authenticated;
grant execute on function public.admin_restore_deleted_record(text, uuid) to authenticated;
grant execute on function public.record_system_data_snapshot(text, text) to service_role;
grant execute on function public.get_maintenance_status() to anon, authenticated;
