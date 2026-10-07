-- DEV only. Disposable enrollment fixture; all writes are rolled back.
-- Does not send WhatsApp messages or create a login session.
begin;
set local lock_timeout='8s';
set local statement_timeout='60s';
do $$
declare v_admin uuid;
begin
  if not exists(select 1 from public.disaster_recovery_config where singleton
    and environment='development' and database_identifier='pgedlnxuuelmtpmbkdwm') then
    raise exception 'Runtime rehearsal is DEV only.';
  end if;
  select user_id into v_admin from public.platform_admins where role='platform_owner'
    and status='active' and revoked_at is null limit 1;
  if v_admin is null then raise exception 'An active platform owner is required.'; end if;
  if exists(select 1 from public.staff_memberships where phone_e164='+16505550199')
    or exists(select 1 from public.staff_invitations where invited_phone='+16505550199') then
    raise exception 'Fixture phone is already in use; choose a different fixture.';
  end if;
  perform set_config('request.jwt.claim.sub',v_admin::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_admin,'role','authenticated')::text,true);
end;
$$;
set local role authenticated;
do $$
declare v_result jsonb; v_org uuid;
begin
  v_result:=public.admin_create_gym_owner_phone_invitation(
    p_gym_name=>'OTP rollback fixture '||gen_random_uuid()::text,
    p_owner_first_name=>'Fixture',p_owner_last_name=>'',p_phone=>'+16505550199');
  v_org:=(v_result->>'organization_id')::uuid;
  if v_result->>'email' is not null or v_result->>'invitation_channel'<>'whatsapp' then
    raise exception 'Incorrect creation response.';
  end if;
  perform public.admin_get_owner_phone_delivery((v_result->>'invitation_id')::uuid);
  perform set_config('test.owner_phone_invitation_id',v_result->>'invitation_id',true);
  perform set_config('test.owner_phone_organization_id',v_org::text,true);
end;
$$;
reset role;
do $$
declare v_id uuid:=current_setting('test.owner_phone_invitation_id')::uuid;
  v_org uuid:=current_setting('test.owner_phone_organization_id')::uuid;
  v_user uuid:=gen_random_uuid(); v_email text;
begin
  if exists(select 1 from public.staff_memberships where organization_id=v_org) then
    raise exception 'Owner enrolled before OTP verification.';
  end if;
  if (select contact_email from public.organizations where id=v_org) is not null then
    raise exception 'Internal identity leaked into contact email.';
  end if;
  select email into v_email from public.staff_invitations where id=v_id;
  insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data,email_confirmed_at)
    values(v_user,v_email,jsonb_build_object('gym_owner_phone_invitation_id',v_id),'{}',now());
  perform set_config('test.owner_phone_user_id',v_user::text,true);
end;
$$;
set local role service_role;
do $$
declare v_id uuid:=current_setting('test.owner_phone_invitation_id')::uuid;
  v_user uuid:=current_setting('test.owner_phone_user_id')::uuid;
begin
  if public.link_gym_owner_phone_identity(v_id) is distinct from v_user then
    raise exception 'Identity linkage failed.';
  end if;
  if public.complete_phone_login(v_user,'+16505550199') is distinct from true then
    raise exception 'Phone owner enrollment failed.';
  end if;
  if public.complete_phone_login(v_user,'+16505550199') is distinct from true then
    raise exception 'Repeat passwordless login failed.';
  end if;
end;
$$;
reset role;
do $$
declare v_id uuid:=current_setting('test.owner_phone_invitation_id')::uuid;
  v_user uuid:=current_setting('test.owner_phone_user_id')::uuid;
begin
  if not exists(select 1 from public.staff_invitations where id=v_id and status='accepted'
    and phone_verified_at is not null and accepted_at is not null) then
    raise exception 'Verified enrollment was not recorded.';
  end if;
  if not exists(select 1 from public.staff_memberships where user_id=v_user and role='owner'
    and access_status='active' and not must_change_password) then
    raise exception 'Passwordless owner membership was not activated.';
  end if;
  update public.staff_memberships set access_status='disabled' where user_id=v_user;
end;
$$;
set local role service_role;
do $$
begin
  if public.complete_phone_login(current_setting('test.owner_phone_user_id')::uuid,'+16505550199')
    is distinct from false then raise exception 'Disabled owner login was allowed.'; end if;
end;
$$;
reset role;
select 'PASS: create, pending enrollment, identity link, verify, repeat login, disabled access; fixtures rolled back' as verification;
rollback;
