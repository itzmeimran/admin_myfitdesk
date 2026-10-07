-- Shared database change, owned by the admin repository's serial sequence.
-- Requires 1022 and FitDeskApp 0089 (WhatsApp authentication).
-- Existing email invitations and CRM creation keep their current signatures.
begin;

alter table public.staff_invitations
  add column if not exists invitation_channel text not null default 'email'
    check (invitation_channel in ('email', 'whatsapp')),
  add column if not exists phone_auth_user_id uuid references auth.users(id) on delete restrict,
  add column if not exists phone_verified_at timestamptz;

alter table public.staff_invitations add constraint staff_invitations_phone_target_check
  check (invitation_channel <> 'whatsapp' or
    (role = 'owner' and invited_phone is not null and invited_phone ~ '^\+[1-9][0-9]{7,14}$'));
create unique index staff_invitations_pending_owner_phone_uq
  on public.staff_invitations(invited_phone)
  where invitation_channel = 'whatsapp' and status = 'pending';
create index staff_invitations_phone_auth_user_idx
  on public.staff_invitations(phone_auth_user_id) where invitation_channel = 'whatsapp';

-- Reserve a pending owner's phone across the existing team-creation flow.
-- RLS still authorizes the caller's table write; this private trigger needs
-- definer rights solely to check reservations outside that caller's gym.
create function app.enforce_reserved_owner_phone_identity()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.phone_e164 is null then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended(new.phone_e164,0));
  if exists(select 1 from public.staff_invitations i where
    i.invitation_channel='whatsapp' and i.invited_phone=new.phone_e164 and i.status='pending'
    and (i.phone_auth_user_id is null or i.phone_auth_user_id<>new.user_id)) then
    raise exception 'This mobile number is reserved for a pending gym owner invitation.' using errcode='23505';
  end if;
  return new;
end;
$$;
revoke all on function app.enforce_reserved_owner_phone_identity() from public,anon,authenticated;
create trigger enforce_reserved_owner_phone_identity before insert or update of phone_e164,user_id
  on public.staff_memberships for each row execute function app.enforce_reserved_owner_phone_identity();

-- Retain the shared gym/subscription/audit creation transaction. Internal
-- email identifiers follow the existing WhatsApp team-login convention.
create function public.admin_create_gym_owner_phone_invitation(
  p_gym_name text, p_owner_first_name text, p_owner_last_name text, p_phone text,
  p_address_line text default null, p_city text default null, p_state text default null,
  p_country text default null, p_postal_code text default null,
  p_default_timezone text default 'Asia/Kolkata', p_default_currency text default 'INR',
  p_billing_mode text default 'trial', p_trial_days integer default 14,
  p_package_id uuid default null, p_period_days integer default null, p_notes text default null
) returns jsonb language plpgsql security definer set search_path = public, app, pg_temp as $$
declare v_result jsonb; v_email text;
begin
  if not app.has_platform_permission('gyms.manage') then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if p_phone is null or p_phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'Enter a valid mobile number with its country code.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_phone, 0));
  if exists (select 1 from public.staff_memberships where
    regexp_replace(coalesce(phone_e164,''),'[^0-9]','','g') = substr(p_phone,2)) then
    raise exception 'This mobile number already belongs to a gym login. Use its existing account.';
  end if;
  if exists (select 1 from public.staff_invitations where invitation_channel = 'whatsapp'
    and invited_phone = p_phone and status = 'pending') then
    raise exception 'This mobile number already has a pending owner invitation. Resend or revoke it first.';
  end if;
  -- An invitation-specific identity also permits a fresh invite after revoke
  -- without reusing the revoked invitation's Auth account or outstanding codes.
  v_email := 'owner.' || gen_random_uuid()::text || '@staff.myfitdesk.internal';
  v_result := app.sales_create_gym_owner_invitation(
    p_gym_name, p_owner_first_name, p_owner_last_name, v_email, p_phone,
    p_address_line, p_city, p_state, p_country, p_postal_code,
    p_default_timezone, p_default_currency, p_billing_mode, p_trial_days,
    p_package_id, p_period_days, p_notes);
  update public.staff_invitations set invitation_channel = 'whatsapp'
    where id = (v_result->>'invitation_id')::uuid;
  update public.organizations set contact_email = null
    where id = (v_result->>'organization_id')::uuid;
  return v_result || jsonb_build_object('email',null,'phone',p_phone,'invitation_channel','whatsapp');
end;
$$;

-- Tenant delivery endpoint checks the admin's own JWT against this same
-- project. No service credential crosses application boundaries.
create function public.admin_get_owner_phone_delivery(p_invitation_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, app, pg_temp as $$
declare v_row public.staff_invitations%rowtype;
begin
  if not app.has_platform_permission('gyms.manage') then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  select * into v_row from public.staff_invitations where id = p_invitation_id
    and invitation_channel = 'whatsapp' and role = 'owner';
  if not found or v_row.status <> 'pending' or v_row.expires_at <= now() then
    raise exception 'This phone invitation is no longer pending or has expired.';
  end if;
  return jsonb_build_object('email',v_row.email,'phone',v_row.invited_phone,
    'first_name',v_row.invited_first_name,'last_name',v_row.invited_last_name);
end;
$$;

-- Recover safely after an interrupted Auth-create call. Only an identity
-- stamped by the server with this invitation id can ever be linked.
create function public.link_gym_owner_phone_identity(p_invitation_id uuid)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_row public.staff_invitations%rowtype; v_user_id uuid;
begin
  select * into v_row from public.staff_invitations where id = p_invitation_id
    and invitation_channel = 'whatsapp' and role = 'owner' for update;
  if not found or v_row.status <> 'pending' or v_row.expires_at <= now() then
    raise exception 'This phone invitation is no longer pending or has expired.';
  end if;
  select id into v_user_id from auth.users where email = v_row.email
    and raw_app_meta_data->>'gym_owner_phone_invitation_id' = p_invitation_id::text;
  if v_user_id is not null then
    update public.staff_invitations set phone_auth_user_id = v_user_id where id = v_row.id;
  end if;
  return v_user_id;
end;
$$;

-- Service-only, called AFTER an OTP has been checked and atomically consumed.
-- Enrollment, lifecycle checks, activation and auditing are one transaction.
-- Ordinary team OTP logins use the same active/disabled gates as before.
create function public.complete_phone_login(p_user_id uuid, p_phone text)
returns boolean language plpgsql security definer set search_path = public, app, pg_temp as $$
declare v_row public.staff_invitations%rowtype; v_has_access boolean;
begin
  if p_user_id is null or p_phone is null then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_phone, 0));
  select * into v_row from public.staff_invitations where
    phone_auth_user_id = p_user_id and invited_phone = p_phone
    and invitation_channel = 'whatsapp' and role = 'owner' and status = 'pending'
    order by created_at desc limit 1 for update;
  if found then
    if v_row.expires_at <= now() then return false; end if;
    if exists(select 1 from public.staff_memberships where organization_id = v_row.organization_id
      and user_id = p_user_id) then return false; end if;
    if not exists(select 1 from auth.users where id = p_user_id and email = v_row.email
      and raw_app_meta_data->>'gym_owner_phone_invitation_id' = v_row.id::text) then return false; end if;
    insert into public.staff_memberships(organization_id,user_id,branch_id,role,email,
      first_name,last_name,phone_e164,access_status,invited_at,activated_at,must_change_password)
    values(v_row.organization_id,p_user_id,null,'owner',v_row.email,
      v_row.invited_first_name,v_row.invited_last_name,p_phone,'active',v_row.created_at,now(),false);
    update public.staff_invitations set status='accepted',accepted_at=now(),phone_verified_at=now()
      where id=v_row.id;
    insert into public.admin_audit_log(admin_id,action,target_organization_id,detail)
      values(v_row.invited_by,'invitation.phone_verified',v_row.organization_id,
        jsonb_build_object('invitation_id',v_row.id,'user_id',p_user_id));
    return true;
  end if;
  update public.staff_memberships set access_status='active',activated_at=now()
    where user_id=p_user_id and phone_e164=p_phone and access_status='invite_pending'
      and deletion_requested_at is null;
  select exists(select 1 from public.staff_memberships where user_id=p_user_id
    and phone_e164=p_phone and access_status='active' and deletion_requested_at is null) into v_has_access;
  return v_has_access;
end;
$$;

-- Serialize issuance with enrollment/provisioning to avoid competing resends.
create or replace function public.issue_auth_otp(p_user_id uuid,p_phone_number text,
  p_otp_hash text,p_expires_at timestamptz,p_max_attempts integer default 5)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_phone_number,0));
  update public.auth_otp_codes set consumed_at=now()
    where phone_number=p_phone_number and consumed_at is null;
  insert into public.auth_otp_codes(user_id,phone_number,otp_hash,expires_at,max_attempts)
    values(p_user_id,p_phone_number,p_otp_hash,p_expires_at,p_max_attempts) returning id into v_id;
  return v_id;
end;
$$;

-- Keep the existing JSON contract; add channel-specific display values.
create or replace function public.admin_get_gym_owner_invitation(p_organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,app,pg_temp as $$
declare v_row public.staff_invitations%rowtype; v_effective text;
begin
  if not app.is_platform_admin() then raise exception 'Not authorized' using errcode='42501'; end if;
  select * into v_row from public.staff_invitations where organization_id=p_organization_id
    and role='owner' order by created_at desc limit 1;
  if not found then return null; end if;
  v_effective:=case when v_row.status='accepted' then 'active' when v_row.status='revoked' then 'revoked'
    when v_row.expires_at<=now() then 'expired' when v_row.email_verified_at is not null then 'email_verified'
    else 'invited' end;
  return to_jsonb(v_row) || jsonb_build_object('effective_status',v_effective,
    'invited_at',v_row.created_at,'email',case when v_row.invitation_channel='email' then v_row.email else null end);
end;
$$;

create or replace function public.admin_resend_gym_owner_invitation(p_invitation_id uuid)
returns jsonb language plpgsql security definer set search_path=public,app,pg_temp as $$
declare v_row public.staff_invitations%rowtype;
begin
  if not app.has_platform_permission('gyms.manage') then raise exception 'Not authorized' using errcode='42501'; end if;
  select * into v_row from public.staff_invitations where id=p_invitation_id and role='owner' for update;
  if not found then raise exception 'Invitation not found.'; end if;
  if v_row.status<>'pending' then raise exception 'This invitation is no longer pending.'; end if;
  update public.staff_invitations set expires_at=now()+interval '7 days',email_verified_at=null,
    resend_count=resend_count+1,last_resent_at=now() where id=v_row.id;
  insert into public.admin_audit_log(admin_id,action,target_organization_id,detail)
    values(auth.uid(),'invitation.resent',v_row.organization_id,jsonb_build_object('invitation_id',v_row.id,
      'invitation_channel',v_row.invitation_channel));
  return jsonb_build_object('email',case when v_row.invitation_channel='email' then v_row.email else null end,
    'organization_id',v_row.organization_id,'organization_name',v_row.organization_name_snapshot,
    'invitation_channel',v_row.invitation_channel,'phone',v_row.invited_phone);
end;
$$;

-- Row lock prevents a concurrent revocation from overwriting acceptance.
create or replace function public.admin_revoke_gym_owner_invitation(p_invitation_id uuid)
returns void language plpgsql security definer set search_path=public,app,pg_temp as $$
declare v_row public.staff_invitations%rowtype;
begin
  if not app.has_platform_permission('gyms.manage') then raise exception 'Not authorized' using errcode='42501'; end if;
  select * into v_row from public.staff_invitations where id=p_invitation_id and role='owner' for update;
  if not found then raise exception 'Invitation not found.'; end if;
  if v_row.status<>'pending' then raise exception 'Only a pending invitation can be revoked.'; end if;
  update public.staff_invitations set status='revoked',revoked_at=now() where id=v_row.id;
  update public.auth_otp_codes set consumed_at=now() where user_id=v_row.phone_auth_user_id
    and phone_number=v_row.invited_phone and consumed_at is null;
  insert into public.admin_audit_log(admin_id,action,target_organization_id,detail)
    values(auth.uid(),'invitation.revoked',v_row.organization_id,jsonb_build_object('invitation_id',v_row.id));
end;
$$;

revoke all on function public.admin_revoke_gym_owner_invitation(uuid) from public,anon,authenticated;
grant execute on function public.admin_revoke_gym_owner_invitation(uuid) to authenticated;
revoke all on function public.admin_create_gym_owner_phone_invitation(text,text,text,text,text,text,text,text,text,text,text,text,integer,uuid,integer,text) from public,anon,authenticated;
grant execute on function public.admin_create_gym_owner_phone_invitation(text,text,text,text,text,text,text,text,text,text,text,text,integer,uuid,integer,text) to authenticated;
revoke all on function public.admin_get_owner_phone_delivery(uuid) from public,anon,authenticated;
grant execute on function public.admin_get_owner_phone_delivery(uuid) to authenticated;
revoke all on function public.link_gym_owner_phone_identity(uuid) from public,anon,authenticated;
grant execute on function public.link_gym_owner_phone_identity(uuid) to service_role;
revoke all on function public.complete_phone_login(uuid,text) from public,anon,authenticated;
grant execute on function public.complete_phone_login(uuid,text) to service_role;
revoke all on function public.issue_auth_otp(uuid,text,text,timestamptz,integer) from public,anon,authenticated;
grant execute on function public.issue_auth_otp(uuid,text,text,timestamptz,integer) to service_role;
revoke all on function public.admin_get_gym_owner_invitation(uuid) from public,anon,authenticated;
grant execute on function public.admin_get_gym_owner_invitation(uuid) to authenticated;
revoke all on function public.admin_resend_gym_owner_invitation(uuid) from public,anon,authenticated;
grant execute on function public.admin_resend_gym_owner_invitation(uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
