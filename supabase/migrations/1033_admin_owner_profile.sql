-- 1033: owner identity editing and accurate account verification in gym settings.
-- Optional organization contact fields are not authentication evidence.
-- WhatsApp OTP uses custom auth, so a missing auth.users.phone_confirmed_at
-- does not mean the membership's mobile number cannot receive login codes.
-- consumed_at is deliberately NOT used: failed deliveries, lockouts and resends
-- also consume codes. No authentication/verification flags are changed here.

create or replace function public.admin_gym_owner_account(p_organization_id uuid, p_staff_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = public, app, pg_temp
as $$
declare
  s public.staff_memberships;
  u auth.users;
  v_email text;
  v_phone text;
  v_phone_verified boolean;
  v_otp_available boolean;
begin
  if auth.uid() is null or not app.has_platform_permission('gyms.view') then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;
  select * into s from public.staff_memberships
  where id = p_staff_id and organization_id = p_organization_id and role = 'owner';
  if not found then raise exception 'Owner not found' using errcode = 'no_data_found'; end if;
  select * into u from auth.users where id = s.user_id;
  v_email := coalesce(nullif(u.email::text, ''), nullif(s.email::text, ''));
  if v_email ilike '%@staff.myfitdesk.internal' then v_email := null; end if;
  v_phone := nullif(s.phone_e164, '');
  v_phone_verified := v_phone is not null and (
    (nullif(u.phone, '') = ltrim(v_phone, '+') or nullif(u.phone, '') = v_phone)
      and u.phone_confirmed_at is not null
    or exists (
      select 1 from public.staff_invitations i
      where i.organization_id = p_organization_id and i.role = 'owner'
        and i.invitation_channel = 'whatsapp' and i.status = 'accepted'
        and i.invited_phone = v_phone and i.phone_verified_at is not null
        and lower(i.email::text) = lower(u.email::text)
    )
  );
  -- Same unique-user/access checks as the tenant's WhatsApp OTP issuer.
  v_otp_available := v_phone is not null and s.access_status in ('invite_pending', 'active')
    and s.deletion_requested_at is null and (
      select count(distinct sm.user_id) = 1 from public.staff_memberships sm
      where sm.phone_e164 = v_phone and sm.access_status in ('invite_pending', 'active')
        and sm.deletion_requested_at is null
    );
  return jsonb_build_object(
    'first_name', s.first_name, 'last_name', s.last_name,
    'email', v_email,
    'email_verified', v_email is not null and lower(v_email) = lower(u.email::text) and u.email_confirmed_at is not null,
    'phone', v_phone, 'phone_verified', coalesce(v_phone_verified, false),
    'whatsapp_otp_available', coalesce(v_otp_available, false)
  );
end;
$$;

create or replace function public.admin_update_gym_owner_name(
  p_organization_id uuid, p_staff_id uuid, p_first_name text, p_last_name text
) returns void
language plpgsql security definer
set search_path = public, app, pg_temp
as $$
declare
  s public.staff_memberships;
  v_first text := nullif(btrim(p_first_name), '');
  v_last text := coalesce(btrim(p_last_name), '');
begin
  if auth.uid() is null or not app.has_platform_permission('gyms.manage') then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;
  if v_first is null or char_length(v_first) > 100 or char_length(v_last) > 100 then
    raise exception 'Enter an owner first name and keep each name under 100 characters.';
  end if;
  select * into s from public.staff_memberships
  where id = p_staff_id and organization_id = p_organization_id and role = 'owner'
  for update;
  if not found then raise exception 'Owner not found' using errcode = 'no_data_found'; end if;
  if s.first_name is not distinct from v_first and coalesce(s.last_name, '') = v_last then return; end if;
  update public.staff_memberships set first_name = v_first, last_name = v_last
  where id = s.id and organization_id = p_organization_id;
  insert into public.admin_audit_log(admin_id, action, target_organization_id, detail)
  values(auth.uid(), 'owner.update_name', p_organization_id, jsonb_build_object(
    'staff_id', s.id, 'before', jsonb_build_object('first_name', s.first_name, 'last_name', s.last_name),
    'after', jsonb_build_object('first_name', v_first, 'last_name', v_last)));
end;
$$;

revoke all on function public.admin_gym_owner_account(uuid, uuid) from public, anon, authenticated;
revoke all on function public.admin_update_gym_owner_name(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.admin_gym_owner_account(uuid, uuid) to authenticated;
grant execute on function public.admin_update_gym_owner_name(uuid, uuid, text, text) to authenticated;
notify pgrst, 'reload schema';
