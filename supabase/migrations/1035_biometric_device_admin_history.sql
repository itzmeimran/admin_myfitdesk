-- ═══════════════════════════════════════════════════════════════════════
-- 1035 — Smart Access devices: change a serial with a reason, and read a
-- device's history.
--
-- REQUIRES FitDeskApp 0121, 0122 and 0123 (same database), and 1034.
--
--   * admin_change_biometric_device_serial: for a typo, or a replacement unit.
--     Needs a reason. Refuses a serial any gym has linked. Cancels commands
--     still waiting for the old unit (they can never reach the new one) and
--     clears what we knew about the old unit's last contact, because the new
--     one has not been heard from yet.
--   * admin_list_biometric_device_history: every change to a gym's devices,
--     newest first, with from -> to, the reason and the admin's email.
--   * admin_link / admin_update / admin_unlink are re-created (same behaviour
--     as 1034) so the reason travels into the device history. The history is
--     written by a trigger on the table (0123); these functions only hand it
--     the reason through a transaction-local setting.
-- ═══════════════════════════════════════════════════════════════════════

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
    raise exception 'This serial is already linked to a gym. Unlink it first.' using errcode = '23505';
  end if;

  perform set_config('app.device_reason', v_reason, true);
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

  perform set_config('app.device_reason', v_reason, true);
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

  perform set_config('app.device_reason', v_reason, true);
  delete from public.biometric_devices where id = p_device_id;

  perform app.log_admin_action(
    'smart_access.device_unlink', v_old.organization_id, 'biometric_device', p_device_id::text,
    jsonb_build_object('serial', v_old.serial, 'branch_id', v_old.branch_id, 'label', v_old.label),
    null,
    v_reason
  );
end;
$$;

create or replace function public.admin_change_biometric_device_serial(
  p_device_id uuid,
  p_new_serial text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_new text := upper(btrim(coalesce(p_new_serial, '')));
  v_old public.biometric_devices%rowtype;
  v_reason text;
  v_cmd record;
begin
  if not app.has_platform_permission('gyms.manage') then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  v_reason := app.require_reason(p_reason);
  if v_new !~ '^[A-Z0-9_-]{1,64}$' then
    raise exception 'Enter the serial exactly as printed on the device (letters, digits, - and _).' using errcode = '22023';
  end if;

  select * into v_old from public.biometric_devices where id = p_device_id for update;
  if not found then
    raise exception 'Device not found.' using errcode = 'P0002';
  end if;
  if v_new = v_old.serial then
    raise exception 'That is already this device''s serial.' using errcode = '22023';
  end if;
  if exists (select 1 from public.biometric_devices d where d.serial = v_new) then
    raise exception 'That serial is already linked to a gym. Unlink it first.' using errcode = '23505';
  end if;

  -- Anything still waiting for the old unit can never reach the new one.
  for v_cmd in
    update public.biometric_device_commands c
       set status = 'cancelled', completed_at = now(), result_detail = 'The device serial was changed.'
     where c.device_serial = v_old.serial and c.organization_id = v_old.organization_id
       and c.status in ('queued', 'sent')
    returning c.integration_id, c.enrollment_id, c.kind
  loop
    if app.biometric_credential_of(v_cmd.kind) is not null then
      perform app.biometric_revert_credential(v_cmd.integration_id, v_cmd.enrollment_id, app.biometric_credential_of(v_cmd.kind));
    end if;
  end loop;

  perform set_config('app.device_reason', v_reason, true);
  perform set_config('app.allow_device_serial_change', 'on', true);
  -- The new unit has not been heard from yet.
  update public.biometric_devices
     set serial = v_new, first_seen_at = null, last_seen_at = null, covered_until = null, firmware = null
   where id = p_device_id;

  delete from public.biometric_unclaimed_devices where serial = v_new;

  perform app.log_admin_action(
    'smart_access.device_serial_change', v_old.organization_id, 'biometric_device', p_device_id::text,
    jsonb_build_object('serial', v_old.serial),
    jsonb_build_object('serial', v_new),
    v_reason
  );
end;
$$;

create or replace function public.admin_list_biometric_device_history(
  p_organization_id uuid,
  p_device_id uuid default null,
  p_limit integer default 100
)
returns table (
  id uuid,
  device_id uuid,
  serial text,
  event text,
  details jsonb,
  reason text,
  actor_email text,
  at timestamptz
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
  select h.id, h.device_id, h.serial, h.event, h.details, h.reason, u.email::text, h.at
    from public.biometric_device_history h
    left join auth.users u on u.id = h.actor_id
   where h.organization_id = p_organization_id
     and (p_device_id is null or h.device_id = p_device_id)
   order by h.at desc, h.id
   limit least(greatest(coalesce(p_limit, 100), 1), 500);
end;
$$;

do $$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'public.admin_link_biometric_device(text, uuid, uuid, text, text)',
    'public.admin_update_biometric_device(uuid, text, uuid, text, text)',
    'public.admin_unlink_biometric_device(uuid, text)',
    'public.admin_change_biometric_device_serial(uuid, text, text)',
    'public.admin_list_biometric_device_history(uuid, uuid, integer)'
  ] loop
    execute format('revoke execute on function %s from public, anon', v_fn);
    execute format('grant execute on function %s to authenticated', v_fn);
  end loop;
end;
$$;
