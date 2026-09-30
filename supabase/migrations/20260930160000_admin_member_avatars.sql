-- Platform-admin read of member profile-picture object keys.
--
-- members.avatar_path / avatar_url already exist (tenant schema); this adds no
-- column and changes no RLS policy. It exposes ONE curated, read-only,
-- admin-gated function returning just the storage key for a batch of members
-- of one gym, so the Members table (a page of rows) and the member drawer
-- (one row) both resolve pictures with a single RPC call instead of one per
-- member. The key is turned into a short-lived presigned URL server-side by
-- the app; the object itself never becomes publicly addressable.
--
-- avatar_path (bare key `{org}/members/{member}.webp`) is preferred;
-- avatar_url is only a legacy fallback (it holds the same bare key or an old
-- full URL), mirroring FitDeskApp's own `avatar_path ?? avatar_url` rule.

create or replace function public.admin_gym_member_avatars(
  p_organization_id uuid,
  p_member_ids uuid[]
)
returns table (
  member_id uuid,
  avatar_key text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.is_platform_admin() then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;

  return query
  select m.id, coalesce(m.avatar_path, m.avatar_url)
  from public.members m
  where m.organization_id = p_organization_id
    and m.id = any (p_member_ids[1:200])
    and coalesce(m.avatar_path, m.avatar_url) is not null;
end;
$$;

revoke execute on function public.admin_gym_member_avatars(uuid, uuid[])
  from public, anon, authenticated;
grant execute on function public.admin_gym_member_avatars(uuid, uuid[])
  to authenticated;
