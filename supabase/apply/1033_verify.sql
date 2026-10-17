-- Read/no-op checks under a real platform admin's JWT; never persist writes.
begin;
select set_config('request.jwt.claim.sub', (
  select user_id::text from public.platform_admins where revoked_at is null limit 1
), true);
do $$
declare
  s public.staff_memberships;
  v_account jsonb;
begin
  if not app.has_platform_permission('gyms.manage') then raise exception 'Verification needs an active gym-managing platform admin'; end if;
  if has_function_privilege('anon', 'public.admin_gym_owner_account(uuid,uuid)', 'EXECUTE')
    or has_function_privilege('anon', 'public.admin_update_gym_owner_name(uuid,uuid,text,text)', 'EXECUTE') then
    raise exception 'Anonymous access must be denied';
  end if;
  select * into s from public.staff_memberships where role = 'owner' and access_status = 'active'
    and nullif(btrim(first_name), '') is not null order by created_at limit 1;
  if s.id is null then raise exception 'No active owner available for verification'; end if;
  v_account := public.admin_gym_owner_account(s.organization_id, s.id);
  if v_account->>'first_name' is distinct from s.first_name then raise exception 'Owner read mismatch'; end if;
  perform public.admin_update_gym_owner_name(s.organization_id, s.id, s.first_name, s.last_name);
  if exists(select 1 from public.staff_memberships where id=s.id and
    (first_name is distinct from s.first_name or coalesce(last_name,'') is distinct from coalesce(s.last_name,''))) then
    raise exception 'No-op changed the name';
  end if;
end;
$$;
rollback;
