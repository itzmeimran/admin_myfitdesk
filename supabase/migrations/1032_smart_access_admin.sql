-- ═══════════════════════════════════════════════════════════════════════
-- 1032 — Smart Access (eSSL biometric): platform-admin operations.
--
-- REQUIRES FitDeskApp 0113_smart_access.sql applied first (same database).
--
-- Every function is SECURITY DEFINER, gated on app.has_platform_permission,
-- pins search_path, writes admin_audit_log through app.log_admin_action, and
-- acts on exactly ONE organization named by its id. None of them can be
-- reached by a gym owner or staff member (they hold no platform permission),
-- so a gym can never approve or enable itself.
--
-- Approval and enabling both re-check plan entitlement
-- (app.smart_access_entitled): an admin cannot use approval to bypass the
-- package a gym is actually on.
-- ═══════════════════════════════════════════════════════════════════════

-- List requests, newest first, with what a reviewer needs on one row.
create or replace function public.admin_list_smart_access_requests(p_status text default null)
returns table (
  id uuid,
  organization_id uuid,
  gym_name text,
  status text,
  owner_note text,
  requested_at timestamptz,
  requested_by_email text,
  reviewed_at timestamptz,
  rejection_reason text,
  admin_notes text,
  entitled boolean,
  package_name text,
  integration_status text,
  integration_enabled boolean,
  has_ingest_token boolean,
  last_event_received_at timestamptz,
  last_successful_sync_at timestamptz,
  last_sync_error text
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
  if p_status is not null and p_status not in ('pending', 'approved', 'rejected', 'cancelled') then
    raise exception 'Unknown status' using errcode = '22023';
  end if;
  return query
  select r.id, r.organization_id, o.name, r.status, r.owner_note, r.requested_at,
         u.email::text, r.reviewed_at, r.rejection_reason, r.admin_notes,
         app.smart_access_entitled(r.organization_id),
         p.name,
         i.configuration_status, i.is_enabled, (c.integration_id is not null),
         i.last_event_received_at, i.last_successful_sync_at, i.last_sync_error
    from public.smart_access_requests r
    join public.organizations o on o.id = r.organization_id
    left join auth.users u on u.id = r.requested_by
    left join public.organization_subscriptions s on s.organization_id = r.organization_id
    left join public.platform_packages p on p.id = s.package_id
    left join public.biometric_integrations i on i.organization_id = r.organization_id and i.provider = 'essl'
    left join public.biometric_integration_credentials c on c.integration_id = i.id
   where p_status is null or r.status = p_status
   order by (r.status = 'pending') desc, r.requested_at desc
   limit 500;
end;
$$;

-- Approve or reject one pending request.
create or replace function public.admin_review_smart_access_request(
  p_request_id uuid,
  p_approve boolean,
  p_reason text,
  p_admin_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_req public.smart_access_requests%rowtype;
  v_reason text;
  v_notes text := nullif(btrim(coalesce(p_admin_notes, '')), '');
begin
  if not app.has_platform_permission('gyms.manage') then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  v_reason := app.require_reason(p_reason);
  if v_notes is not null and char_length(v_notes) > 2000 then
    raise exception 'Notes are limited to 2000 characters.' using errcode = '22023';
  end if;

  select * into v_req from public.smart_access_requests where id = p_request_id for update;
  if not found then
    raise exception 'Request not found' using errcode = 'P0002';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'Only a pending request can be reviewed.' using errcode = '22023';
  end if;

  if p_approve then
    if not app.smart_access_entitled(v_req.organization_id) then
      raise exception 'This gym''s current package does not include Smart Access.' using errcode = '22023';
    end if;
    update public.smart_access_requests
       set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(),
           admin_notes = coalesce(v_notes, admin_notes)
     where id = p_request_id;
    -- The integration starts disabled and unconfigured; nothing is live yet.
    insert into public.biometric_integrations (organization_id)
    values (v_req.organization_id)
    on conflict (organization_id, provider) do nothing;
  else
    if char_length(v_reason) > 500 then
      raise exception 'Keep the rejection reason under 500 characters.' using errcode = '22023';
    end if;
    update public.smart_access_requests
       set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(),
           rejection_reason = v_reason, admin_notes = coalesce(v_notes, admin_notes)
     where id = p_request_id;
  end if;

  perform app.log_admin_action(
    case when p_approve then 'smart_access.approve' else 'smart_access.reject' end,
    v_req.organization_id, 'smart_access_request', p_request_id::text,
    jsonb_build_object('status', v_req.status),
    jsonb_build_object('status', case when p_approve then 'approved' else 'rejected' end),
    v_reason, jsonb_build_object('admin_notes', v_notes)
  );
  return jsonb_build_object('id', p_request_id, 'status', case when p_approve then 'approved' else 'rejected' end);
end;
$$;

-- Configuration progress and the master switch for ONE gym's integration.
-- Enabling requires an approved request, entitlement, and a connected or
-- verified connection. Suspending always disables (safe shutdown: ingestion
-- stops server-side; nothing is sent to the device).
create or replace function public.admin_update_biometric_integration(
  p_organization_id uuid,
  p_configuration_status text,
  p_enabled boolean,
  p_reason text,
  p_integration_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_old public.biometric_integrations%rowtype;
  v_new public.biometric_integrations%rowtype;
  v_reason text;
  v_enabled boolean := p_enabled;
  v_name text := nullif(btrim(coalesce(p_integration_name, '')), '');
begin
  if not app.has_platform_permission('gyms.manage') then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  v_reason := app.require_reason(p_reason);
  if p_configuration_status not in ('pending_setup', 'configuring', 'connected', 'verified', 'failed', 'suspended') then
    raise exception 'Unknown configuration status' using errcode = '22023';
  end if;

  select * into v_old from public.biometric_integrations
   where organization_id = p_organization_id and provider = 'essl' for update;
  if not found then
    raise exception 'Approve this gym''s Smart Access request first.' using errcode = 'P0002';
  end if;

  if p_configuration_status in ('suspended', 'failed', 'pending_setup') then
    v_enabled := false;
  end if;
  if v_enabled then
    if p_configuration_status not in ('connected', 'verified') then
      raise exception 'Only a connected or verified integration can be enabled.' using errcode = '22023';
    end if;
    if not exists (select 1 from public.smart_access_requests
                    where organization_id = p_organization_id and status = 'approved') then
      raise exception 'This gym has no approved Smart Access request.' using errcode = '22023';
    end if;
    if not app.smart_access_entitled(p_organization_id) then
      raise exception 'This gym''s current package does not include Smart Access.' using errcode = '22023';
    end if;
  end if;

  update public.biometric_integrations
     set configuration_status = p_configuration_status,
         is_enabled = v_enabled,
         integration_name = coalesce(v_name, integration_name),
         last_sync_error = case when p_configuration_status = 'failed' then left(v_reason, 500) else last_sync_error end
   where id = v_old.id
  returning * into v_new;

  perform app.log_admin_action(
    'smart_access.integration_update', p_organization_id, 'biometric_integration', v_old.id::text,
    jsonb_build_object('configuration_status', v_old.configuration_status, 'is_enabled', v_old.is_enabled),
    jsonb_build_object('configuration_status', v_new.configuration_status, 'is_enabled', v_new.is_enabled),
    v_reason
  );
  return jsonb_build_object('configuration_status', v_new.configuration_status, 'is_enabled', v_new.is_enabled,
                            'active', app.smart_access_active(p_organization_id));
end;
$$;

-- Issue (or rotate) the connector's ingest token for ONE gym. The plaintext
-- is returned exactly once; only its SHA-256 is stored. Rotating invalidates
-- the previous token immediately.
create or replace function public.admin_issue_biometric_ingest_token(p_organization_id uuid, p_reason text)
returns text
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_reason text;
  v_integration uuid;
  v_token text;
begin
  if not app.has_platform_permission('gyms.manage') then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  v_reason := app.require_reason(p_reason);
  select id into v_integration from public.biometric_integrations
   where organization_id = p_organization_id and provider = 'essl';
  if v_integration is null then
    raise exception 'Approve this gym''s Smart Access request first.' using errcode = 'P0002';
  end if;

  -- Two v4 UUIDs (CSPRNG-backed) = 244 random bits, no pgcrypto needed.
  v_token := 'fdk_essl_' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

  insert into public.biometric_integration_credentials (integration_id, organization_id, token_hash, token_hint, issued_by)
  values (v_integration, p_organization_id, encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), right(v_token, 4), auth.uid())
  on conflict (integration_id) do update
    set token_hash = excluded.token_hash, token_hint = excluded.token_hint,
        issued_by = excluded.issued_by, issued_at = now();

  perform app.log_admin_action(
    'smart_access.issue_token', p_organization_id, 'biometric_integration', v_integration::text,
    null, jsonb_build_object('token_hint', right(v_token, 4)), v_reason
  );
  return v_token;
end;
$$;

-- Mark a package as including (or not) Smart Access. Turning it off is a
-- downgrade for every gym on that package: their premium reads and
-- ingestion stop at once, their records are kept.
create or replace function public.admin_set_package_smart_access(p_package_id uuid, p_included boolean, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_reason text;
  v_old boolean;
begin
  if not app.has_platform_permission('packages.manage') then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  v_reason := app.require_reason(p_reason);
  select includes_smart_access into v_old from public.platform_packages where id = p_package_id for update;
  if not found then
    raise exception 'Package not found' using errcode = 'P0002';
  end if;
  update public.platform_packages set includes_smart_access = p_included where id = p_package_id;
  perform app.log_admin_action(
    'package.smart_access', null, 'platform_package', p_package_id::text,
    jsonb_build_object('includes_smart_access', v_old), jsonb_build_object('includes_smart_access', p_included), v_reason
  );
  return jsonb_build_object('id', p_package_id, 'includes_smart_access', p_included);
end;
$$;

-- Packages with their Smart Access flag (for the toggle list).
create or replace function public.admin_list_smart_access_packages()
returns table (id uuid, code text, name text, billing_period text, status text, includes_smart_access boolean, gym_count bigint)
language plpgsql
stable
security definer
set search_path = public, app, pg_temp
as $$
begin
  if not app.has_platform_permission('packages.view') then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  return query
  select p.id, p.code, p.name, p.billing_period, p.status, p.includes_smart_access,
         (select count(*) from public.organization_subscriptions s where s.package_id = p.id)
    from public.platform_packages p
   order by p.status, p.sort_order, p.name;
end;
$$;

-- Recent sync jobs for ONE gym, failures first.
create or replace function public.admin_list_biometric_sync_jobs(p_organization_id uuid, p_limit integer default 20)
returns table (
  id uuid, sync_type text, status text, total_records integer, successful_records integer,
  failed_records integer, error_summary text, created_at timestamptz, completed_at timestamptz
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
  select j.id, j.sync_type, j.status, j.total_records, j.successful_records, j.failed_records,
         j.error_summary, j.created_at, j.completed_at
    from public.biometric_sync_jobs j
   where j.organization_id = p_organization_id
   order by j.created_at desc
   limit least(greatest(coalesce(p_limit, 20), 1), 100);
end;
$$;

-- Both revokes, then grant to authenticated (the permission check inside is
-- the real gate; a gym user calling these gets 'Not authorized').
do $$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'public.admin_list_smart_access_requests(text)',
    'public.admin_review_smart_access_request(uuid, boolean, text, text)',
    'public.admin_update_biometric_integration(uuid, text, boolean, text, text)',
    'public.admin_issue_biometric_ingest_token(uuid, text)',
    'public.admin_set_package_smart_access(uuid, boolean, text)',
    'public.admin_list_smart_access_packages()',
    'public.admin_list_biometric_sync_jobs(uuid, integer)'
  ] loop
    execute format('revoke execute on function %s from public, anon', v_fn);
    execute format('grant execute on function %s to authenticated', v_fn);
  end loop;
end;
$$;
