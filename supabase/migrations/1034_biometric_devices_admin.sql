-- ═══════════════════════════════════════════════════════════════════════
-- 1034 — Smart Access Phase 1: platform-admin control of biometric devices.
--
-- REQUIRES FitDeskApp 0121_biometric_devices.sql (same database) applied first.
--
-- Only a platform admin links, relabels, moves, disables or unlinks a device
-- serial. Every function is SECURITY DEFINER, gated on
-- app.has_platform_permission, pins search_path and writes admin_audit_log
-- through app.log_admin_action. A gym owner holds no platform permission, so
-- a gym can never claim a serial for itself.
-- ═══════════════════════════════════════════════════════════════════════

-- Serials that called the receiver but belong to no gym, newest first.
create or replace function public.admin_list_unclaimed_biometric_devices()
returns table (serial text, firmware text, first_seen_at timestamptz, last_seen_at timestamptz)
language plpgsql
stable
security definer
set search_path = public, app, pg_temp
as $$
begin
  if not app.has_platform_permission('gyms.view') then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  return query
  select u.serial, u.firmware, u.first_seen_at, u.last_seen_at
    from public.biometric_unclaimed_devices u
   order by u.last_seen_at desc
   limit 200;
end;
$$;

-- Linked devices, for one gym or for every gym.
create or replace function public.admin_list_biometric_devices(p_organization_id uuid default null)
returns table (
  id uuid,
  serial text,
  organization_id uuid,
  gym_name text,
  branch_id uuid,
  branch_name text,
  label text,
  firmware text,
  status text,
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  covered_until timestamptz,
  integration_status text,
  integration_enabled boolean
)
language plpgsql
stable
security definer
set search_path = public, app, pg_temp
as $$
begin
  if not app.has_platform_permission('gyms.view') then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  return query
  select d.id, d.serial, d.organization_id, o.name, d.branch_id, b.name, d.label, d.firmware, d.status,
         d.first_seen_at, d.last_seen_at, d.covered_until, i.configuration_status, i.is_enabled
    from public.biometric_devices d
    join public.organizations o on o.id = d.organization_id
    join public.branches b on b.id = d.branch_id
    join public.biometric_integrations i on i.id = d.integration_id
   where p_organization_id is null or d.organization_id = p_organization_id
   order by o.name, d.created_at
   limit 500;
end;
$$;

-- Link a serial to a gym and branch. The gym must already have its Smart
-- Access integration (created when the request was approved). Linking also
-- clears the serial from the unclaimed list.
create or replace function public.admin_link_biometric_device(
  p_serial text,
  p_organization_id uuid,
  p_branch_id uuid,
  p_label text,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_serial text := upper(btrim(coalesce(p_serial, '')));
  v_label text := nullif(btrim(coalesce(p_label, '')), '');
  v_reason text;
  v_integration uuid;
  v_id uuid;
begin
  if not app.has_platform_permission('gyms.manage') then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  v_reason := app.require_reason(p_reason);
  if v_serial !~ '^[A-Z0-9_-]{1,64}$' then
    raise exception 'Enter the serial exactly as printed on the device (letters, digits, - and _).' using errcode = '22023';
  end if;
  if v_label is not null and char_length(v_label) > 80 then
    raise exception 'Keep the label under 80 characters.' using errcode = '22023';
  end if;

  select i.id into v_integration from public.biometric_integrations i
   where i.organization_id = p_organization_id and i.provider = 'essl';
  if v_integration is null then
    raise exception 'Approve this gym''s Smart Access request first.' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.branches b where b.id = p_branch_id and b.organization_id = p_organization_id) then
    raise exception 'That branch does not belong to this gym.' using errcode = '22023';
  end if;
  if exists (select 1 from public.biometric_devices d where d.serial = v_serial) then
    raise exception 'This serial is already linked. Unlink it first.' using errcode = '23505';
  end if;

  insert into public.biometric_devices (serial, organization_id, integration_id, branch_id, label)
  values (v_serial, p_organization_id, v_integration, p_branch_id, v_label)
  returning id into v_id;

  delete from public.biometric_unclaimed_devices where serial = v_serial;

  perform app.log_admin_action(
    'smart_access.device_link', p_organization_id, 'biometric_device', v_id::text,
    null,
    jsonb_build_object('serial', v_serial, 'branch_id', p_branch_id, 'label', v_label),
    v_reason
  );
  return v_id;
end;
$$;

-- Relabel, move to another branch of the same gym, or disable/enable.
-- A null argument leaves that field alone; an empty label clears it.
create or replace function public.admin_update_biometric_device(
  p_device_id uuid,
  p_label text,
  p_branch_id uuid,
  p_status text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_old public.biometric_devices%rowtype;
  v_new public.biometric_devices%rowtype;
  v_reason text;
begin
  if not app.has_platform_permission('gyms.manage') then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  v_reason := app.require_reason(p_reason);
  if p_status is not null and p_status not in ('active', 'disabled') then
    raise exception 'Unknown device status' using errcode = '22023';
  end if;
  if p_label is not null and char_length(btrim(p_label)) > 80 then
    raise exception 'Keep the label under 80 characters.' using errcode = '22023';
  end if;

  select * into v_old from public.biometric_devices where id = p_device_id for update;
  if not found then
    raise exception 'Device not found.' using errcode = 'P0002';
  end if;
  if p_branch_id is not null and not exists (
       select 1 from public.branches b where b.id = p_branch_id and b.organization_id = v_old.organization_id) then
    raise exception 'That branch does not belong to this gym.' using errcode = '22023';
  end if;

  update public.biometric_devices
     set label = case when p_label is null then label else nullif(btrim(p_label), '') end,
         branch_id = coalesce(p_branch_id, branch_id),
         status = coalesce(p_status, status)
   where id = p_device_id
  returning * into v_new;

  perform app.log_admin_action(
    'smart_access.device_update', v_old.organization_id, 'biometric_device', p_device_id::text,
    jsonb_build_object('label', v_old.label, 'branch_id', v_old.branch_id, 'status', v_old.status),
    jsonb_build_object('label', v_new.label, 'branch_id', v_new.branch_id, 'status', v_new.status),
    v_reason
  );
end;
$$;

-- Unlink: the serial goes back to being unknown. Punches already stored keep
-- their device_id text; nothing is deleted from attendance.
create or replace function public.admin_unlink_biometric_device(p_device_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_old public.biometric_devices%rowtype;
  v_reason text;
begin
  if not app.has_platform_permission('gyms.manage') then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  v_reason := app.require_reason(p_reason);

  select * into v_old from public.biometric_devices where id = p_device_id for update;
  if not found then
    raise exception 'Device not found.' using errcode = 'P0002';
  end if;

  delete from public.biometric_devices where id = p_device_id;

  perform app.log_admin_action(
    'smart_access.device_unlink', v_old.organization_id, 'biometric_device', p_device_id::text,
    jsonb_build_object('serial', v_old.serial, 'branch_id', v_old.branch_id, 'label', v_old.label),
    null,
    v_reason
  );
end;
$$;

-- Both revokes, then grant to authenticated (the permission check inside is
-- the real gate; a gym user calling these gets 'Not authorized').
do $$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'public.admin_list_unclaimed_biometric_devices()',
    'public.admin_list_biometric_devices(uuid)',
    'public.admin_link_biometric_device(text, uuid, uuid, text, text)',
    'public.admin_update_biometric_device(uuid, text, uuid, text, text)',
    'public.admin_unlink_biometric_device(uuid, text)'
  ] loop
    execute format('revoke execute on function %s from public, anon', v_fn);
    execute format('grant execute on function %s to authenticated', v_fn);
  end loop;
end;
$$;
