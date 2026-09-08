-- ═══════════════════════════════════════════════════════════════════════
-- NOT YET APPLIED TO ANY LIVE PROJECT.
--
-- This migration targets the SAME Supabase project the production
-- FitDeskApp tenant app runs on (CLAUDE.md decision D-C / D-1) — it does
-- not touch any table FitDeskApp owns, but it runs against the same
-- database, so a mistake here is a production incident for the tenant app
-- too. It needs an explicit go-ahead from the product owner before it is
-- applied — do not run this against the live project as part of routine
-- development. Written and reviewed locally only; AdminMyFitdesk owns the
-- `1001_…` numeric range specifically so it can never collide with
-- FitDeskApp's own `supabase/migrations/` sequence (currently through
-- 0043+), per CLAUDE.md's D-1.
--
-- Scope: the minimum needed for a fail-closed platform-admin gate —
--   1. platform_admins        — who is allowed onto /admin (soft-revoke only,
--                                matching this product's "nothing is hard-
--                                deleted" convention — see FitDeskApp's
--                                0001_init.sql schema-facts comment).
--   2. app.is_platform_admin() — the real predicate, SECURITY DEFINER,
--                                pinned search_path, in the `app` schema —
--                                same convention FitDeskApp's own 0001_init.sql
--                                uses for its RLS-predicate helpers
--                                (app.current_user_org_ids, app.is_owner, …).
--   3. public.is_platform_admin() — a thin RPC-callable wrapper around #2.
--                                PostgREST (and therefore supabase-js's
--                                `.rpc()`) only exposes the `public` schema
--                                by default; `app.*` functions are reachable
--                                from SQL (RLS policies, this file) but not
--                                from `supabase.rpc(...)`. src/core/auth/
--                                get-platform-admin.ts calls
--                                `supabase.rpc("is_platform_admin")`, which
--                                resolves to this wrapper.
--   4. admin_audit_log         — append-only trail of admin actions, same
--                                shape/spirit as FitDeskApp's 0042 audit_log
--                                (see that migration's header for the "an
--                                audit trail a user can write to, edit or
--                                erase is not an audit trail" reasoning).
--                                No writer is wired to it yet — this
--                                migration only creates the table and its
--                                read policy; the first real admin action
--                                (extend/cancel a subscription, publish a
--                                package) should insert into it.
-- ═══════════════════════════════════════════════════════════════════════

create extension if not exists citext;

-- ─────────────────────────────────────────────────────────────────────────
-- platform_admins — who may reach /admin. One row per admin; `revoked_at`
-- soft-revokes without deleting the grant history (who granted whom, when).
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.platform_admins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete restrict,
  email citext not null,
  granted_by uuid references auth.users(id),
  granted_at timestamptz not null default now(),
  -- Soft-revoke only — matches FitDeskApp's "nothing is hard-deleted"
  -- schema convention (every FK on delete restrict, archive/request-only
  -- deletes throughout). A revoked row stays for the audit trail of who
  -- had access and when it ended; app.is_platform_admin() below only
  -- treats a row as live when this is null.
  revoked_at timestamptz
);

create index if not exists platform_admins_live_idx on public.platform_admins (user_id)
  where revoked_at is null;

-- ─────────────────────────────────────────────────────────────────────────
-- app.is_platform_admin() — the real predicate. SECURITY DEFINER so it can
-- read platform_admins regardless of the caller's own RLS visibility into
-- that table (see the no-insert/update/delete policy below — a non-admin
-- caller has no ambient access to this table at all), with search_path
-- pinned to prevent a schema-shadowing attack against a SECURITY DEFINER
-- function (same defensive pattern as every app.* predicate in
-- FitDeskApp's 0001_init.sql).
-- ─────────────────────────────────────────────────────────────────────────
create or replace function app.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.platform_admins
    where user_id = (select auth.uid())
      and revoked_at is null
  )
$$;

-- Postgres grants EXECUTE to PUBLIC on every newly created function by
-- default — an explicit `grant ... to authenticated` alone does not
-- revoke that implicit grant. Both revokes below are required to actually
-- lock this down, not belt-and-braces: FitDeskApp hit exactly this gap
-- twice (its 0038/0040 migrations), which is why every SECURITY DEFINER
-- function in this app follows the same revoke-both-then-grant shape.
revoke execute on function app.is_platform_admin() from public, anon, authenticated;
grant execute on function app.is_platform_admin() to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- public.is_platform_admin() — RPC-callable wrapper. Same SECURITY
-- DEFINER + pinned search_path + explicit revoke-then-grant treatment as
-- the real predicate; it does nothing except call it, so a caller who can
-- reach this can do nothing more than a caller of app.is_platform_admin()
-- directly could from SQL.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select app.is_platform_admin()
$$;

revoke execute on function public.is_platform_admin() from public, anon, authenticated;
grant execute on function public.is_platform_admin() to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- RLS on platform_admins — enabled AND forced (forced matters here even
-- though there's no admin-role bypass concept yet: it's what makes "no
-- policy for this command" airtight rather than relying on every future
-- caller happening to not be the table owner).
--
-- Select only, gated by the predicate itself (an admin may see the admin
-- list; nobody else can). Deliberately NO insert/update/delete policy for
-- any client role — granting or revoking platform-admin status is a
-- service-role-only operation (done from a trusted context, e.g. a
-- one-off script or a future super-admin-only server action that uses
-- src/core/db/service-client.ts), same pattern FitDeskApp's
-- organization_subscriptions table uses for its own no-client-write rule.
-- ─────────────────────────────────────────────────────────────────────────
alter table public.platform_admins enable row level security;
alter table public.platform_admins force row level security;

drop policy if exists platform_admins_select on public.platform_admins;
create policy platform_admins_select on public.platform_admins
  for select to authenticated
  using (app.is_platform_admin());

-- ─────────────────────────────────────────────────────────────────────────
-- admin_audit_log — append-only trail of what a platform admin did against
-- tenant data (extended a subscription, published a package, etc.). No
-- writer function exists yet in this migration; the first real mutating
-- admin action should insert here directly via the service-role client
-- (writes never go through a client-role policy — see below).
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.admin_audit_log (
  id bigserial primary key,
  admin_id uuid references auth.users(id),
  action text not null,
  target_organization_id uuid,
  detail jsonb,
  at timestamptz not null default now()
);

create index if not exists admin_audit_log_at_idx on public.admin_audit_log (at desc);
create index if not exists admin_audit_log_org_idx on public.admin_audit_log (target_organization_id, at desc);

alter table public.admin_audit_log enable row level security;
alter table public.admin_audit_log force row level security;

-- Select only, gated the same way as platform_admins — any platform admin
-- may read the whole trail (there's no per-admin scoping concept, same as
-- FitDeskApp's audit_log being owner-readable for the whole org rather
-- than per-actor). No insert/update/delete policy for any client role: an
-- audit trail a client-role token can write to, edit or erase is not an
-- audit trail (same reasoning as FitDeskApp's 0042 audit_log — the
-- SECURITY DEFINER trigger there is the only writer; here, since no
-- trigger source table exists yet, the only intended writer is the
-- service-role client, which bypasses RLS entirely and needs no policy).
drop policy if exists admin_audit_log_select on public.admin_audit_log;
create policy admin_audit_log_select on public.admin_audit_log
  for select to authenticated
  using (app.is_platform_admin());
