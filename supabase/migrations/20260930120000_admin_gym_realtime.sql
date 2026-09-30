-- ═══════════════════════════════════════════════════════════════════════
-- Admin → Gym Details realtime
--
-- WHY BROADCAST, NOT postgres_changes
-- Supabase `postgres_changes` delivers a row only if the *subscriber* passes
-- that table's RLS SELECT policy. Platform admins deliberately have NO select
-- policy on tenant tables (members, branches, staff_memberships, payments…) —
-- 1009's header explains why: a blanket admin policy would expose every raw
-- PII column over PostgREST. Adding those policies just to make realtime work
-- would undo that boundary.
--
-- Instead, AFTER statement triggers on the relevant tables call
-- realtime.send() with a *content-free* payload — {table, op, rows} — on a
-- PRIVATE per-gym topic `admin:gym:<organization_id>`. No names, emails,
-- phones or amounts ever travel over the channel; the browser only learns
-- "members changed for this gym" and re-reads through the same curated,
-- admin-gated RPCs the pages already use. Access to the topic is enforced by
-- an RLS policy on realtime.messages (platform admins only).
--
-- A second topic, `admin:gyms`, carries only organization / subscription
-- changes (the sidebar's gym count and the Gyms directory).
--
-- SAFETY OF THE TENANT WRITE PATH
-- These triggers sit on live tenant tables. The trigger function swallows
-- every exception, so a Realtime hiccup can never fail or roll back a gym's
-- own write. They are statement-level (transition tables): a 1,000-row bulk
-- import produces ONE message per gym, not 1,000.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. The sender ─────────────────────────────────────────────────────
create or replace function app.emit_gym_change()
returns trigger
language plpgsql
security definer
set search_path = public, app, realtime, pg_temp
as $$
declare
  v_org_col text := coalesce(TG_ARGV[0], 'organization_id');
  r record;
begin
  begin
    for r in
      select to_jsonb(c)->>v_org_col as org_id, count(*) as n
      from changed_rows c
      group by 1
    loop
      continue when r.org_id is null;

      perform realtime.send(
        jsonb_build_object('t', TG_TABLE_NAME, 'op', TG_OP, 'n', r.n),
        'change',
        'admin:gym:' || r.org_id,
        true
      );

      -- Directory-level topic: only what changes the sidebar count / Gyms list.
      if TG_TABLE_NAME in ('organizations', 'organization_subscriptions') then
        perform realtime.send(
          jsonb_build_object('t', TG_TABLE_NAME, 'op', TG_OP, 'n', r.n),
          'change',
          'admin:gyms',
          true
        );
      end if;
    end loop;
  exception when others then
    -- Never let a realtime problem break the write that triggered it.
    null;
  end;
  return null;
end;
$$;

revoke execute on function app.emit_gym_change() from public, anon, authenticated;

-- ── 2. Triggers ───────────────────────────────────────────────────────
-- Transition tables cannot be shared across events, so each table gets three
-- triggers (insert / update / delete), all through the same function. The
-- helper keeps this list to one readable line per table and is idempotent.
create or replace function pg_temp.add_gym_realtime_triggers(p_table text, p_org_col text default 'organization_id')
returns void
language plpgsql
as $$
begin
  if to_regclass('public.' || p_table) is null then
    raise notice 'skipping %, table does not exist', p_table;
    return;
  end if;

  execute format('drop trigger if exists zz_gym_rt_ins on public.%I', p_table);
  execute format('drop trigger if exists zz_gym_rt_upd on public.%I', p_table);
  execute format('drop trigger if exists zz_gym_rt_del on public.%I', p_table);

  execute format($f$create trigger zz_gym_rt_ins after insert on public.%I
    referencing new table as changed_rows
    for each statement execute function app.emit_gym_change(%L)$f$, p_table, p_org_col);
  execute format($f$create trigger zz_gym_rt_upd after update on public.%I
    referencing new table as changed_rows
    for each statement execute function app.emit_gym_change(%L)$f$, p_table, p_org_col);
  execute format($f$create trigger zz_gym_rt_del after delete on public.%I
    referencing old table as changed_rows
    for each statement execute function app.emit_gym_change(%L)$f$, p_table, p_org_col);
end;
$$;

-- Identity / directory
select pg_temp.add_gym_realtime_triggers('organizations', 'id');
select pg_temp.add_gym_realtime_triggers('gyms');
select pg_temp.add_gym_realtime_triggers('organization_subscriptions');
-- Members
select pg_temp.add_gym_realtime_triggers('members');
select pg_temp.add_gym_realtime_triggers('member_subscriptions');
-- Branches & team
select pg_temp.add_gym_realtime_triggers('branches');
select pg_temp.add_gym_realtime_triggers('staff_memberships');
select pg_temp.add_gym_realtime_triggers('staff_invitations');
-- Money
select pg_temp.add_gym_realtime_triggers('payments');
select pg_temp.add_gym_realtime_triggers('platform_payments');
-- WhatsApp
select pg_temp.add_gym_realtime_triggers('whatsapp_messages');
select pg_temp.add_gym_realtime_triggers('whatsapp_credit_balances');
select pg_temp.add_gym_realtime_triggers('whatsapp_credit_transactions');
select pg_temp.add_gym_realtime_triggers('whatsapp_credit_purchases');
select pg_temp.add_gym_realtime_triggers('whatsapp_integrations');
-- Integrations / settings shown on Overview
select pg_temp.add_gym_realtime_triggers('payment_gateway_integrations');
select pg_temp.add_gym_realtime_triggers('notification_preferences');
select pg_temp.add_gym_realtime_triggers('owner_whatsapp_automation_settings');
-- Admin-side records
select pg_temp.add_gym_realtime_triggers('admin_gym_notes');
select pg_temp.add_gym_realtime_triggers('admin_audit_log', 'target_organization_id');

-- ── 3. Who may listen ─────────────────────────────────────────────────
-- Private channels are authorized by RLS on realtime.messages. Only an
-- active platform admin may RECEIVE, and only on the two admin topics —
-- never a gym owner, never anon, never another tenant's session. There is no
-- INSERT policy: clients cannot publish, only the SECURITY DEFINER sender
-- above can.
drop policy if exists "platform admins receive gym realtime" on realtime.messages;
create policy "platform admins receive gym realtime"
  on realtime.messages
  for select
  to authenticated
  using (
    public.is_platform_admin()
    and (
      realtime.topic() = 'admin:gyms'
      or realtime.topic() like 'admin:gym:%'
    )
  );
