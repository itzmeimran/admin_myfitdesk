-- 1030: lets a platform admin set a gym's optional tagline.
--
-- The column and its CHECK (<= 120 chars, never blank) come from the tenant
-- app's migration 0112 (organizations.tagline); this file only adds the admin
-- write path. A separate small RPC rather than a new argument on
-- admin_update_organization_profile(): that function's signature is granted and
-- called from the generated types, and changing it would mean dropping and
-- recreating it. Reads need no new function — platform admins already have an
-- admin-gated SELECT policy on organizations (1002).
--
-- Requires 0112 to be applied to the same project first.

create or replace function public.admin_set_organization_tagline(
  p_organization_id uuid,
  p_tagline text
) returns void
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_before text;
  v_after text := nullif(btrim(p_tagline), '');
begin
  if not app.is_platform_admin() then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;
  if v_after is not null and char_length(v_after) > 120 then
    raise exception 'Keep the tagline under 120 characters.';
  end if;

  select tagline into v_before from organizations where id = p_organization_id;
  if not found then
    raise exception 'Gym not found' using errcode = 'no_data_found';
  end if;

  -- Nothing to do (and nothing to audit) when the value is unchanged.
  if v_before is not distinct from v_after then
    return;
  end if;

  update organizations set tagline = v_after, updated_at = now()
  where id = p_organization_id;

  insert into admin_audit_log (admin_id, action, target_organization_id, detail)
  values (
    auth.uid(), 'organization.update_tagline', p_organization_id,
    jsonb_build_object('before', v_before, 'after', v_after)
  );
end;
$$;

revoke execute on function public.admin_set_organization_tagline(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_set_organization_tagline(uuid, text) to authenticated;
