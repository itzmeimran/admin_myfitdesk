-- ═══════════════════════════════════════════════════════════════════════
-- Auto-cancel stale Razorpay orders — the "orders stuck as created" case
-- admin_billing_pipeline (1005) and admin_overview_stats (1002/1006) have
-- flagged as a metric for a while (created_at < now() - interval '1 hour')
-- but never actually resolved: a checkout the gym owner opens and abandons
-- (closes the modal, never completes) leaves a platform_payments row sat at
-- status='created' forever — exactly what happened to Steel Fitness's ₹599
-- order, cleared by hand via a one-off SQL script before this existed.
--
-- This migration turns that into a real system rather than a recurring
-- manual fix:
--   1. platform_payments.status gains a 5th value, 'cancelled' — distinct
--      from 'failed' (an attempt that was actually declined/errored) and
--      'refunded' (money that was captured and given back). "Cancelled"
--      means: nothing was ever charged, the attempt just never finished.
--   2. expire_stale_payment_orders() — flips any 'created' row older than
--      1 hour (same threshold the existing "stuck" metric already used,
--      reused rather than inventing a second definition) to 'cancelled',
--      logging one admin_audit_log row per payment (admin_id = null, i.e.
--      "System" — audit.ts already renders a null admin_id that way).
--      Deliberately NOT admin-gated and NOT granted to any client role
--      (public/anon/authenticated) — this is meant to run only as a
--      scheduled job, never reachable through the app's own RPC surface.
--   3. A pg_cron job runs it every 15 minutes, so a stuck order is swept up
--      well within the metric's own 1-hour "stuck" window rather than
--      sitting there until an admin notices.
--
-- Same DEV/PROD split as every other migration — this needs to be run
-- against BOTH Supabase projects separately; pg_cron jobs are per-project,
-- not shared. If `create extension pg_cron` fails with a permissions
-- error, enable it first via the Dashboard → Database → Extensions page,
-- then re-run this file.
-- ═══════════════════════════════════════════════════════════════════════

-- platform_payments.status's CHECK constraint lives in FitDeskApp's own
-- migrations, not this repo, so its exact name isn't known here — this
-- looks it up by inspecting the constraint's actual definition (the one
-- whose check expression mentions "status") rather than guessing a name,
-- then replaces it with a 5-value version.
do $$
declare
  v_constraint_name text;
begin
  select con.conname into v_constraint_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'platform_payments'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%status%'
  limit 1;

  if v_constraint_name is not null then
    execute format('alter table public.platform_payments drop constraint %I', v_constraint_name);
  end if;
end $$;

alter table public.platform_payments
  add constraint platform_payments_status_check
  check (status in ('created', 'succeeded', 'failed', 'refunded', 'cancelled'));

-- ─────────────────────────────────────────────────────────────────────────
-- expire_stale_payment_orders — the sweep itself. Returns the number of
-- rows it cancelled, purely so a manual run from the SQL editor (or a
-- pg_cron run's own log) shows something useful; the app never calls this.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.expire_stale_payment_orders()
returns integer
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_count integer := 0;
  r record;
begin
  for r in
    update platform_payments
    set
      status = 'cancelled',
      provider_metadata = coalesce(provider_metadata, '{}'::jsonb)
        || jsonb_build_object('auto_cancelled', true, 'auto_cancelled_at', now())
    where status = 'created'
      and created_at < now() - interval '1 hour'
    returning id, organization_id, amount_minor, currency, provider, provider_order_id
  loop
    v_count := v_count + 1;
    insert into admin_audit_log (admin_id, action, target_organization_id, detail)
    values (
      null, 'payment.auto_cancel_stale', r.organization_id,
      jsonb_build_object(
        'payment_id', r.id,
        'amount_minor', r.amount_minor,
        'currency', r.currency,
        'provider', r.provider,
        'provider_order_id', r.provider_order_id
      )
    );
  end loop;

  return v_count;
end;
$$;

-- No client role — this must never be reachable via PostgREST/supabase.rpc,
-- only via the pg_cron job below (which runs as the job's own role,
-- unaffected by these grants) or a superuser running it by hand.
revoke execute on function public.expire_stale_payment_orders() from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- Schedule it. Idempotent: unschedules any prior job of the same name
-- before scheduling, so re-running this migration (or applying it to both
-- DEV and PROD from the same file) never ends up with duplicate jobs.
-- ─────────────────────────────────────────────────────────────────────────
create extension if not exists pg_cron with schema extensions;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'expire-stale-platform-payments') then
    perform cron.unschedule('expire-stale-platform-payments');
  end if;
end $$;

select cron.schedule(
  'expire-stale-platform-payments',
  '*/15 * * * *',
  $$select public.expire_stale_payment_orders();$$
);
