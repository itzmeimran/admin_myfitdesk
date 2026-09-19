-- Lets a platform admin set or clear a gym's logo_url. organizations has no
-- admin UPDATE policy (only the tenant owner's), so a direct .update() from
-- the admin session silently changes zero rows; every other admin write in
-- this app is a SECURITY DEFINER RPC + audit row, and this follows suit.
-- p_logo_url null clears the logo.
create or replace function public.admin_update_gym_logo(
  p_organization_id uuid,
  p_logo_url text
) returns void
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
begin
  if not app.is_platform_admin() then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;

  update organizations
  set logo_url = nullif(trim(p_logo_url), ''), updated_at = now()
  where id = p_organization_id;
  if not found then
    raise exception 'Gym not found' using errcode = 'no_data_found';
  end if;

  insert into admin_audit_log (admin_id, action, target_organization_id, detail)
  values (
    auth.uid(), 'organization.update_logo', p_organization_id,
    jsonb_build_object('removed', nullif(trim(p_logo_url), '') is null)
  );
end;
$$;

revoke execute on function public.admin_update_gym_logo(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_update_gym_logo(uuid, text) to authenticated;
