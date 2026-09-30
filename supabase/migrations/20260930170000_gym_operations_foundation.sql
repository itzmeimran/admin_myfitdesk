-- Gym Command Center — part 1 of 2: tables, policies and audited write RPCs.
--
-- Everything here is scoped by organization_id (the tenant boundary). No new
-- gym_id column is introduced. Reused structures: admin_audit_log (every
-- privileged write below logs old/new values + a mandatory reason),
-- system_alerts (extended, not replaced), admin_gym_notes (extended with
-- soft-delete), whatsapp_credit_balances / whatsapp_credit_transactions,
-- whatsapp_messages, staff_memberships, auth.sessions.
--
-- RLS / privilege summary (also documented in CLAUDE.md):
--   * organization_operation_locks  — RLS forced; SELECT policy for platform
--     admins only; no client INSERT/UPDATE/DELETE (writes go through
--     admin_set_operation_lock). Gym staff cannot read the table, its reasons
--     or who set a lock.
--   * feature_flag_definitions / organization_feature_flags — same shape.
--   * admin_gym_notes — unchanged SELECT policy (admin only); new columns only.
--   * system_alerts — unchanged policy (admin SELECT only); new columns only.
--   * Tenant-facing enforcement hooks are two boolean-only functions,
--     organization_operation_locked() and organization_feature_enabled(),
--     callable by the org's own staff/service role. They never return reasons
--     or admin identities.
--   * app.* helpers are not executable by any client role.

-- ---------------------------------------------------------------------------
-- helpers
-- ---------------------------------------------------------------------------

create or replace function app.current_environment()
returns text
language sql
stable
security definer
set search_path = public, app, pg_temp
as $$
  select coalesce((select environment from public.disaster_recovery_config where singleton limit 1), 'production')
$$;

create or replace function app.require_reason(p_reason text)
returns text
language plpgsql
immutable
set search_path = public, app, pg_temp
as $$
declare
  v text := nullif(btrim(p_reason), '');
begin
  if v is null or char_length(v) < 3 then
    raise exception 'A reason is required (at least 3 characters).' using errcode = '22023';
  end if;
  if char_length(v) > 500 then
    raise exception 'The reason must be 500 characters or fewer.' using errcode = '22023';
  end if;
  return v;
end;
$$;

-- One audit writer for every privileged action in this file. Mirrors the
-- column usage of the existing admin_* RPCs (entity_type/entity_id/old_values/
-- new_values/metadata) and always stores the reason in `detail`.
create or replace function app.log_admin_action(
  p_action text,
  p_organization_id uuid,
  p_entity_type text,
  p_entity_id text,
  p_old jsonb,
  p_new jsonb,
  p_reason text,
  p_extra jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = public, app, pg_temp
as $$
  insert into public.admin_audit_log
    (admin_id, action, target_organization_id, detail, environment, actor_role,
     entity_type, entity_id, old_values, new_values, metadata)
  values (
    (select auth.uid()), p_action, p_organization_id,
    jsonb_build_object('reason', p_reason) || coalesce(p_extra, '{}'::jsonb),
    app.current_environment(), 'platform_admin',
    p_entity_type, p_entity_id, p_old, p_new,
    jsonb_build_object('source', 'platform_admin')
  )
$$;

revoke execute on function app.current_environment() from public, anon, authenticated;
revoke execute on function app.require_reason(text) from public, anon, authenticated;
revoke execute on function app.log_admin_action(text, uuid, text, text, jsonb, jsonb, text, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1. Operation locks
-- ---------------------------------------------------------------------------

create table if not exists public.organization_operation_locks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  lock_type text not null check (lock_type in (
    'read_only', 'block_payments', 'block_member_edits', 'block_member_imports',
    'block_whatsapp', 'block_scheduled_broadcasts', 'block_staff_login', 'block_financial_edits'
  )),
  is_enabled boolean not null default true,
  reason text not null check (char_length(reason) between 3 and 500),
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz,
  unique (organization_id, lock_type)
);

create index if not exists organization_operation_locks_active_idx
  on public.organization_operation_locks (organization_id)
  where is_enabled;

alter table public.organization_operation_locks enable row level security;
alter table public.organization_operation_locks force row level security;

drop policy if exists organization_operation_locks_admin_select on public.organization_operation_locks;
create policy organization_operation_locks_admin_select on public.organization_operation_locks
  for select to authenticated
  using ((select app.is_platform_admin()));

revoke insert, update, delete on public.organization_operation_locks from public, anon, authenticated;

-- A full read-only lock implies every specific write lock.
create or replace function app.org_lock_active(p_organization_id uuid, p_lock_type text)
returns boolean
language sql
stable
security definer
set search_path = public, app, pg_temp
as $$
  select exists (
    select 1 from public.organization_operation_locks l
    where l.organization_id = p_organization_id
      and l.is_enabled
      and (l.expires_at is null or l.expires_at > now())
      and (l.lock_type = p_lock_type or l.lock_type = 'read_only')
  )
$$;
revoke execute on function app.org_lock_active(uuid, text) from public, anon, authenticated;

-- The one integration point for the tenant app: boolean only, never reasons.
create or replace function public.organization_operation_locked(p_organization_id uuid, p_lock_type text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, app, pg_temp
as $$
begin
  if p_lock_type not in (
    'read_only', 'block_payments', 'block_member_edits', 'block_member_imports',
    'block_whatsapp', 'block_scheduled_broadcasts', 'block_staff_login', 'block_financial_edits'
  ) then
    raise exception 'Unknown lock type' using errcode = '22023';
  end if;
  if not (
    app.is_platform_admin()
    or app.is_service_role()
    or exists (
      select 1 from public.staff_memberships sm
      where sm.organization_id = p_organization_id and sm.user_id = (select auth.uid())
    )
  ) then
    return false;
  end if;
  return app.org_lock_active(p_organization_id, p_lock_type);
end;
$$;
revoke execute on function public.organization_operation_locked(uuid, text) from public, anon, authenticated;
grant execute on function public.organization_operation_locked(uuid, text) to authenticated, service_role;

create or replace function public.admin_set_operation_lock(
  p_organization_id uuid,
  p_lock_type text,
  p_enabled boolean,
  p_reason text,
  p_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_reason text;
  v_old public.organization_operation_locks;
  v_new public.organization_operation_locks;
begin
  if not app.is_platform_admin() then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;
  v_reason := app.require_reason(p_reason);
  if not exists (select 1 from public.organizations where id = p_organization_id) then
    raise exception 'Gym not found' using errcode = 'no_data_found';
  end if;
  if p_enabled and p_expires_at is not null and p_expires_at <= now() then
    raise exception 'The expiry must be in the future.' using errcode = '22023';
  end if;

  select * into v_old from public.organization_operation_locks
  where organization_id = p_organization_id and lock_type = p_lock_type for update;

  if not found and not p_enabled then
    raise exception 'That restriction is not set.' using errcode = 'no_data_found';
  end if;

  insert into public.organization_operation_locks
    (organization_id, lock_type, is_enabled, reason, created_by, updated_by, expires_at)
  values (p_organization_id, p_lock_type, p_enabled, v_reason, (select auth.uid()), (select auth.uid()),
          case when p_enabled then p_expires_at else null end)
  on conflict (organization_id, lock_type) do update
    set is_enabled = excluded.is_enabled,
        reason = excluded.reason,
        updated_by = excluded.updated_by,
        updated_at = now(),
        expires_at = excluded.expires_at
  returning * into v_new;

  perform app.log_admin_action(
    case when p_enabled then 'operation_lock.enable' else 'operation_lock.disable' end,
    p_organization_id, 'operation_lock', v_new.id::text,
    case when v_old.id is null then null
         else jsonb_build_object('lock_type', v_old.lock_type, 'is_enabled', v_old.is_enabled, 'expires_at', v_old.expires_at) end,
    jsonb_build_object('lock_type', v_new.lock_type, 'is_enabled', v_new.is_enabled, 'expires_at', v_new.expires_at),
    v_reason
  );

  return jsonb_build_object('id', v_new.id, 'lock_type', v_new.lock_type, 'is_enabled', v_new.is_enabled, 'expires_at', v_new.expires_at);
end;
$$;
revoke execute on function public.admin_set_operation_lock(uuid, text, boolean, text, timestamptz) from public, anon, authenticated;
grant execute on function public.admin_set_operation_lock(uuid, text, boolean, text, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Feature flags
-- ---------------------------------------------------------------------------

create table if not exists public.feature_flag_definitions (
  flag_key text primary key check (flag_key ~ '^[a-z][a-z0-9_]{2,48}$'),
  label text not null,
  description text not null,
  default_enabled boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.organization_feature_flags (
  organization_id uuid not null references public.organizations(id) on delete restrict,
  flag_key text not null references public.feature_flag_definitions(flag_key) on delete restrict,
  is_enabled boolean not null,
  reason text not null check (char_length(reason) between 3 and 500),
  updated_by uuid not null references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  primary key (organization_id, flag_key)
);

alter table public.feature_flag_definitions enable row level security;
alter table public.feature_flag_definitions force row level security;
alter table public.organization_feature_flags enable row level security;
alter table public.organization_feature_flags force row level security;

drop policy if exists feature_flag_definitions_admin_select on public.feature_flag_definitions;
create policy feature_flag_definitions_admin_select on public.feature_flag_definitions
  for select to authenticated using ((select app.is_platform_admin()));
drop policy if exists organization_feature_flags_admin_select on public.organization_feature_flags;
create policy organization_feature_flags_admin_select on public.organization_feature_flags
  for select to authenticated using ((select app.is_platform_admin()));

revoke insert, update, delete on public.feature_flag_definitions from public, anon, authenticated;
revoke insert, update, delete on public.organization_feature_flags from public, anon, authenticated;

insert into public.feature_flag_definitions (flag_key, label, description, default_enabled) values
  ('new_whatsapp_workflow', 'New WhatsApp workflow', 'Opt this gym into the redesigned WhatsApp sending workflow.', false),
  ('leads_beta', 'Leads (beta)', 'Enable the leads pipeline for this gym.', false),
  ('new_reports', 'New reports', 'Show the redesigned reports section.', false),
  ('attendance_beta', 'Attendance (beta)', 'Enable member attendance tracking.', false),
  ('new_payment_flow', 'New payment flow', 'Use the new payment recording flow.', false)
on conflict (flag_key) do nothing;

create or replace function public.organization_feature_enabled(p_organization_id uuid, p_flag_key text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, app, pg_temp
as $$
begin
  if not (
    app.is_platform_admin()
    or app.is_service_role()
    or exists (
      select 1 from public.staff_memberships sm
      where sm.organization_id = p_organization_id and sm.user_id = (select auth.uid())
    )
  ) then
    return false;
  end if;
  return coalesce(
    (select f.is_enabled from public.organization_feature_flags f
      where f.organization_id = p_organization_id and f.flag_key = p_flag_key),
    (select d.default_enabled from public.feature_flag_definitions d where d.flag_key = p_flag_key),
    false
  );
end;
$$;
revoke execute on function public.organization_feature_enabled(uuid, text) from public, anon, authenticated;
grant execute on function public.organization_feature_enabled(uuid, text) to authenticated, service_role;

create or replace function public.admin_set_feature_flag(
  p_organization_id uuid,
  p_flag_key text,
  p_enabled boolean,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_reason text;
  v_before boolean;
begin
  if not app.is_platform_admin() then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;
  v_reason := app.require_reason(p_reason);
  if not exists (select 1 from public.organizations where id = p_organization_id) then
    raise exception 'Gym not found' using errcode = 'no_data_found';
  end if;
  if not exists (select 1 from public.feature_flag_definitions where flag_key = p_flag_key) then
    raise exception 'Unknown feature flag' using errcode = '22023';
  end if;

  select is_enabled into v_before from public.organization_feature_flags
  where organization_id = p_organization_id and flag_key = p_flag_key for update;

  insert into public.organization_feature_flags (organization_id, flag_key, is_enabled, reason, updated_by)
  values (p_organization_id, p_flag_key, p_enabled, v_reason, (select auth.uid()))
  on conflict (organization_id, flag_key) do update
    set is_enabled = excluded.is_enabled, reason = excluded.reason,
        updated_by = excluded.updated_by, updated_at = now();

  perform app.log_admin_action(
    'feature_flag.set', p_organization_id, 'feature_flag', p_flag_key,
    jsonb_build_object('is_enabled', v_before),
    jsonb_build_object('is_enabled', p_enabled),
    v_reason, jsonb_build_object('flag_key', p_flag_key)
  );
  return jsonb_build_object('flag_key', p_flag_key, 'is_enabled', p_enabled);
end;
$$;
revoke execute on function public.admin_set_feature_flag(uuid, text, boolean, text) from public, anon, authenticated;
grant execute on function public.admin_set_feature_flag(uuid, text, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Private admin notes: edit + soft delete (history kept in admin_audit_log)
-- ---------------------------------------------------------------------------

alter table public.admin_gym_notes
  add column if not exists updated_at timestamptz,
  add column if not exists updated_by uuid references auth.users(id) on delete restrict,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id) on delete restrict;

create or replace function public.admin_update_gym_note(p_note_id uuid, p_content text)
returns void
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_content text := nullif(btrim(p_content), '');
  v_note public.admin_gym_notes;
begin
  if not app.is_platform_admin() then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;
  if v_content is null or char_length(v_content) > 2000 then
    raise exception 'Note must be between 1 and 2000 characters.' using errcode = '22023';
  end if;
  select * into v_note from public.admin_gym_notes where id = p_note_id and deleted_at is null for update;
  if not found then
    raise exception 'Note not found' using errcode = 'no_data_found';
  end if;
  if v_note.content = v_content then
    return;
  end if;

  update public.admin_gym_notes
  set content = v_content, updated_at = now(), updated_by = (select auth.uid())
  where id = p_note_id;

  -- The previous text is retained here, so edit history is never lost.
  perform app.log_admin_action(
    'admin_note.edited', v_note.organization_id, 'admin_note', p_note_id::text,
    jsonb_build_object('content', v_note.content),
    jsonb_build_object('content', v_content),
    'Note edited'
  );
end;
$$;
revoke execute on function public.admin_update_gym_note(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_update_gym_note(uuid, text) to authenticated;

create or replace function public.admin_delete_gym_note(p_note_id uuid)
returns void
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_note public.admin_gym_notes;
begin
  if not app.is_platform_admin() then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;
  select * into v_note from public.admin_gym_notes where id = p_note_id and deleted_at is null for update;
  if not found then
    raise exception 'Note not found' using errcode = 'no_data_found';
  end if;

  update public.admin_gym_notes
  set deleted_at = now(), deleted_by = (select auth.uid())
  where id = p_note_id;

  perform app.log_admin_action(
    'admin_note.deleted', v_note.organization_id, 'admin_note', p_note_id::text,
    jsonb_build_object('content', v_note.content), null, 'Note deleted (soft)'
  );
end;
$$;
revoke execute on function public.admin_delete_gym_note(uuid) from public, anon, authenticated;
grant execute on function public.admin_delete_gym_note(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. system_alerts: organization-level alerts (extends the DR table)
-- ---------------------------------------------------------------------------

alter table public.system_alerts
  add column if not exists organization_id uuid references public.organizations(id) on delete restrict,
  add column if not exists title text,
  add column if not exists dedupe_key text,
  add column if not exists acknowledged_at timestamptz,
  add column if not exists acknowledged_by uuid references auth.users(id) on delete restrict,
  add column if not exists resolution_note text;

create unique index if not exists system_alerts_org_open_dedupe_idx
  on public.system_alerts (organization_id, dedupe_key)
  where organization_id is not null and resolved_at is null;

create index if not exists system_alerts_org_created_idx
  on public.system_alerts (organization_id, created_at desc)
  where organization_id is not null;

create or replace function public.admin_set_alert_status(p_alert_id uuid, p_action text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_alert public.system_alerts;
  v_note text := nullif(btrim(p_note), '');
begin
  if not app.is_platform_admin() then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;
  if p_action not in ('acknowledge', 'resolve') then
    raise exception 'Unknown action' using errcode = '22023';
  end if;
  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'The note must be 500 characters or fewer.' using errcode = '22023';
  end if;
  select * into v_alert from public.system_alerts where id = p_alert_id for update;
  if not found then
    raise exception 'Alert not found' using errcode = 'no_data_found';
  end if;
  if v_alert.resolved_at is not null then
    raise exception 'That alert is already resolved.' using errcode = '22023';
  end if;

  if p_action = 'acknowledge' then
    if v_alert.acknowledged_at is not null then
      raise exception 'That alert is already acknowledged.' using errcode = '22023';
    end if;
    update public.system_alerts
    set acknowledged_at = now(), acknowledged_by = (select auth.uid())
    where id = p_alert_id;
  else
    update public.system_alerts
    set resolved_at = now(), resolved_by = (select auth.uid()), resolution_note = v_note
    where id = p_alert_id;
  end if;

  perform app.log_admin_action(
    'alert.' || p_action, v_alert.organization_id, 'system_alert', p_alert_id::text,
    jsonb_build_object('status', case when v_alert.acknowledged_at is not null then 'acknowledged' else 'open' end),
    jsonb_build_object('status', case when p_action = 'resolve' then 'resolved' else 'acknowledged' end),
    coalesce(v_note, 'No note'),
    jsonb_build_object('alert_type', v_alert.type, 'title', coalesce(v_alert.title, v_alert.message))
  );
end;
$$;
revoke execute on function public.admin_set_alert_status(uuid, text, text) from public, anon, authenticated;
grant execute on function public.admin_set_alert_status(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. WhatsApp credit adjustment (add OR remove) with a mandatory reason
-- ---------------------------------------------------------------------------

create or replace function public.admin_adjust_whatsapp_credits(
  p_organization_id uuid,
  p_delta integer,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_reason text;
  v_before integer;
  v_after integer;
  v_tx uuid;
begin
  if not app.is_platform_admin() then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;
  v_reason := app.require_reason(p_reason);
  if p_delta is null or p_delta = 0 or abs(p_delta) > 10000000 then
    raise exception 'Enter a non-zero amount of up to 10,000,000 credits.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.organizations where id = p_organization_id) then
    raise exception 'Gym not found' using errcode = 'no_data_found';
  end if;

  insert into public.whatsapp_credit_balances (organization_id)
  values (p_organization_id) on conflict (organization_id) do nothing;

  select balance into v_before from public.whatsapp_credit_balances
  where organization_id = p_organization_id for update;

  if v_before + p_delta < 0 then
    raise exception 'Cannot remove % credits — this gym only has %.', abs(p_delta), v_before using errcode = '22023';
  end if;

  update public.whatsapp_credit_balances
  set balance = balance + p_delta, updated_at = now()
  where organization_id = p_organization_id
  returning balance into v_after;

  insert into public.whatsapp_credit_transactions (organization_id, delta, reason, balance_after, created_by)
  values (p_organization_id, p_delta, 'adjustment', v_after, (select auth.uid()))
  returning id into v_tx;

  perform app.log_admin_action(
    case when p_delta > 0 then 'whatsapp_credits.add' else 'whatsapp_credits.remove' end,
    p_organization_id, 'organization', p_organization_id::text,
    jsonb_build_object('balance', v_before),
    jsonb_build_object('balance', v_after),
    v_reason, jsonb_build_object('delta', p_delta, 'transaction_id', v_tx)
  );
  return jsonb_build_object('balance_before', v_before, 'balance_after', v_after, 'transaction_id', v_tx);
end;
$$;
revoke execute on function public.admin_adjust_whatsapp_credits(uuid, integer, text) from public, anon, authenticated;
grant execute on function public.admin_adjust_whatsapp_credits(uuid, integer, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Retry eligible failed WhatsApp messages (idempotent, duplicate-safe)
--
-- Only messages that Meta never accepted (no meta_message_id), that are not
-- bulk-run recipients (those have their own run/recipient state machine),
-- that failed with a transient/unknown error (same set the tenant worker
-- treats as transient: 1, 2, 4, 80007 or no code) — or were skipped for
-- insufficient credits — and that are under 7 days old. A message is never
-- re-queued if an equivalent message (same recipient/template/payment/due
-- date) was created at or after it and is queued/sent/delivered/read. The
-- re-queue is one atomic UPDATE on the status column, so a double click finds
-- nothing left to retry. Credits are not re-charged: the tenant worker only
-- consumes credits on a row's first attempt.
-- ---------------------------------------------------------------------------

create or replace function public.admin_retry_failed_whatsapp(p_organization_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_reason text;
  v_ids uuid[];
  v_balance integer;
  v_candidates integer;
begin
  if not app.is_platform_admin() then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;
  v_reason := app.require_reason(p_reason);
  if not exists (select 1 from public.organizations where id = p_organization_id) then
    raise exception 'Gym not found' using errcode = 'no_data_found';
  end if;
  if app.org_lock_active(p_organization_id, 'block_whatsapp') then
    raise exception 'WhatsApp sending is paused for this gym. Resume it before retrying.' using errcode = '22023';
  end if;

  select coalesce(balance, 0) into v_balance from public.whatsapp_credit_balances where organization_id = p_organization_id;
  v_balance := coalesce(v_balance, 0);

  select count(*) into v_candidates
  from public.whatsapp_messages m
  where m.organization_id = p_organization_id and m.direction = 'outbound' and m.status in ('failed', 'skipped')
    and m.created_at > now() - interval '7 days';

  with eligible as (
    select m.id
    from public.whatsapp_messages m
    where m.organization_id = p_organization_id
      and m.direction = 'outbound'
      and m.origin <> 'bulk'
      and m.meta_message_id is null
      and m.created_at > now() - interval '7 days'
      and (
        (m.status = 'failed' and (m.error_code is null or m.error_code in ('1', '2', '4', '80007')))
        or (m.status = 'skipped' and v_balance > 0 and m.error_message ilike '%credit%')
      )
      and not exists (
        select 1 from public.whatsapp_messages n
        where n.organization_id = m.organization_id
          and n.id <> m.id
          and n.direction = 'outbound'
          and n.phone_number_e164 = m.phone_number_e164
          and n.template_name is not distinct from m.template_name
          and n.payment_id is not distinct from m.payment_id
          and n.reminder_due_date is not distinct from m.reminder_due_date
          and n.created_at >= m.created_at
          and n.status in ('queued', 'processing', 'sent', 'delivered', 'read')
      )
    order by m.created_at
    limit 200
    for update skip locked
  ), moved as (
    update public.whatsapp_messages m
    set status = 'queued', next_attempt_at = now(), locked_at = null,
        max_attempts = greatest(m.max_attempts, m.attempts + 1)
    from eligible e
    where m.id = e.id and m.status in ('failed', 'skipped')
    returning m.id
  )
  select coalesce(array_agg(id), '{}') into v_ids from moved;

  perform app.log_admin_action(
    'whatsapp.retry_failed', p_organization_id, 'organization', p_organization_id::text,
    null, jsonb_build_object('requeued', coalesce(array_length(v_ids, 1), 0)),
    v_reason,
    jsonb_build_object('message_ids', to_jsonb(v_ids[1:50]), 'requeued', coalesce(array_length(v_ids, 1), 0),
                       'candidates', v_candidates)
  );

  return jsonb_build_object(
    'requeued', coalesce(array_length(v_ids, 1), 0),
    'not_retried', greatest(v_candidates - coalesce(array_length(v_ids, 1), 0), 0)
  );
end;
$$;
revoke execute on function public.admin_retry_failed_whatsapp(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_retry_failed_whatsapp(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Force logout (owner only, or every user of the organization)
--
-- Deletes the users' auth.sessions rows (their refresh tokens cascade), so
-- they cannot mint new access tokens. Already-issued access tokens stay valid
-- until they expire (Supabase default: 1 hour) — Supabase exposes no way to
-- revoke a stateless JWT earlier. Active platform admins are never affected.
-- ---------------------------------------------------------------------------

create or replace function public.admin_revoke_org_sessions(
  p_organization_id uuid,
  p_scope text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_reason text;
  v_users uuid[];
  v_deleted integer;
begin
  if not app.is_platform_admin() then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;
  v_reason := app.require_reason(p_reason);
  if p_scope not in ('owner', 'all') then
    raise exception 'Scope must be owner or all.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.organizations where id = p_organization_id) then
    raise exception 'Gym not found' using errcode = 'no_data_found';
  end if;

  select coalesce(array_agg(distinct sm.user_id), '{}') into v_users
  from public.staff_memberships sm
  where sm.organization_id = p_organization_id
    and (p_scope = 'all' or sm.role = 'owner')
    and not exists (select 1 from public.platform_admins pa where pa.user_id = sm.user_id and pa.revoked_at is null);

  delete from auth.sessions where user_id = any(v_users);
  get diagnostics v_deleted = row_count;

  perform app.log_admin_action(
    'sessions.revoke', p_organization_id, 'organization', p_organization_id::text,
    null, jsonb_build_object('users', coalesce(array_length(v_users, 1), 0), 'sessions_ended', v_deleted),
    v_reason, jsonb_build_object('scope', p_scope)
  );
  return jsonb_build_object('users', coalesce(array_length(v_users, 1), 0), 'sessions_ended', v_deleted);
end;
$$;
revoke execute on function public.admin_revoke_org_sessions(uuid, text, text) from public, anon, authenticated;
grant execute on function public.admin_revoke_org_sessions(uuid, text, text) to authenticated;
