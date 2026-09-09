-- ═══════════════════════════════════════════════════════════════════════
-- CLAUDE.md's Plan, P2 #8: Settings page. Of the 4 candidate features the
-- design's own placeholder copy names (grace-period default, invoice
-- prefix, webhook endpoints, admin accounts), the product owner chose the
-- admin roster only — the other three stay out of scope, undecided.
--
-- 1001_platform_admins.sql deliberately gave platform_admins no client-role
-- write policy of any kind ("granting or revoking platform-admin status is
-- a service-role-only operation"), same reasoning 1002 originally used for
-- platform_packages before 1003 replaced that blanket policy with narrow
-- audited RPCs. This migration does the same thing here: no write policy is
-- added to platform_admins (it still has none), only three SECURITY
-- DEFINER RPCs, each admin-gated and each landing an admin_audit_log row.
--
-- Real scope boundary, not a bug: admin_grant_platform_admin can only grant
-- access to an email that ALREADY has a Supabase Auth account. Creating a
-- brand-new auth user requires GoTrue's Admin API (password hashing, email
-- confirmation flags, etc.) — that's a service-role-only capability no
-- plain Postgres function can reach, which is exactly why
-- scripts/grant-platform-admin.mjs exists and continues to be the only way
-- to onboard a person who has never signed in before. This UI covers
-- everything after that: granting an existing account, revoking, and
-- reactivating a previously revoked one (reactivating is just granting
-- again — the upsert clears revoked_at either way).
-- ═══════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- admin_list_platform_admins() — the roster table. Joins back to auth.users
-- twice: once (implicitly, via platform_admins.email) for the row itself,
-- once for granted_by's email so the roster can show "granted by whom"
-- without exposing a bare uuid. is_self lets the UI disable the Revoke
-- button on the caller's own row — see admin_revoke_platform_admin's guard
-- below for why that matters.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.admin_list_platform_admins()
returns table (
  user_id uuid,
  email text,
  granted_by_email text,
  granted_at timestamptz,
  revoked_at timestamptz,
  is_self boolean
)
language sql
stable
security definer
set search_path = public, app, pg_temp
as $$
  select
    pa.user_id,
    pa.email::text,
    granter.email,
    pa.granted_at,
    pa.revoked_at,
    pa.user_id = auth.uid()
  from platform_admins pa
  left join auth.users granter on granter.id = pa.granted_by
  where app.is_platform_admin()
  order by pa.revoked_at is not null, pa.granted_at desc
$$;

revoke execute on function public.admin_list_platform_admins() from public, anon, authenticated;
grant execute on function public.admin_list_platform_admins() to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- admin_grant_platform_admin(p_email) — grants (or reactivates) admin
-- access for an EXISTING auth user, looked up case-insensitively. Upserts
-- on user_id so reactivating a revoked admin is the same call as granting a
-- new one; granted_at is refreshed to now() on reactivation so the roster
-- reflects the actual new grant date, not the original one.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.admin_grant_platform_admin(
  p_email text
) returns void
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_user_id uuid;
  v_email text;
begin
  if not app.is_platform_admin() then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;

  select id, email into v_user_id, v_email
  from auth.users
  where lower(email) = lower(trim(p_email))
  limit 1;

  if v_user_id is null then
    raise exception 'No account found for that email — they need to sign in at /login at least once (created via scripts/grant-platform-admin.mjs) before they can be granted admin access.'
      using errcode = 'no_data_found';
  end if;

  insert into platform_admins (user_id, email, granted_by, granted_at, revoked_at)
  values (v_user_id, v_email, auth.uid(), now(), null)
  on conflict (user_id) do update
    set email = excluded.email, granted_by = excluded.granted_by, granted_at = now(), revoked_at = null;

  insert into admin_audit_log (admin_id, action, target_organization_id, detail)
  values (auth.uid(), 'admin.grant', null, jsonb_build_object('user_id', v_user_id, 'email', v_email));
end;
$$;

revoke execute on function public.admin_grant_platform_admin(text) from public, anon, authenticated;
grant execute on function public.admin_grant_platform_admin(text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- admin_revoke_platform_admin(p_user_id) — soft-revoke only, matching
-- platform_admins' own no-hard-delete design (1001's comment). Refuses to
-- let an admin revoke their own access: there is no recovery UI yet (no
-- signup flow, no "reset via email" on this app — see get-platform-admin.ts
-- fail-closed docblock), so a self-revoke would either strand the caller or,
-- if they were the only admin, strand the whole product with no client-role
-- path back in. Same conservative instinct as this app's other guards
-- (admin_restore_subscription refusing a non-cancelled row, etc.) — flag
-- and block the footgun rather than allow it and hope.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.admin_revoke_platform_admin(
  p_user_id uuid
) returns void
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
begin
  if not app.is_platform_admin() then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'You cannot revoke your own admin access.' using errcode = 'invalid_parameter_value';
  end if;

  update platform_admins
  set revoked_at = now()
  where user_id = p_user_id and revoked_at is null;

  if not found then
    raise exception 'Admin not found, or already revoked' using errcode = 'no_data_found';
  end if;

  insert into admin_audit_log (admin_id, action, target_organization_id, detail)
  values (auth.uid(), 'admin.revoke', null, jsonb_build_object('user_id', p_user_id));
end;
$$;

revoke execute on function public.admin_revoke_platform_admin(uuid) from public, anon, authenticated;
grant execute on function public.admin_revoke_platform_admin(uuid) to authenticated;
