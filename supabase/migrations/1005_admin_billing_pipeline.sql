-- ═══════════════════════════════════════════════════════════════════════
-- Closes the last fully-mock section on Overview: the dark "Billing
-- pipeline" panel (HEALTH in features/overview/mock-data.ts), flagged
-- since the initial read-wiring pass as TODO(needs-service-role-or-new-rpc)
-- because payment_provider_events (the Razorpay webhook inbox) has zero
-- RLS policies — confirmed live: `select polname from pg_policy where
-- polrelid = 'public.payment_provider_events'::regclass` returns no rows,
-- so it's service-role-only by design, same as every other
-- RLS-enabled-no-policy table in this project (rate_limits,
-- platform_document_sequences, query_perf_events).
--
-- Only 2 of the panel's 4 rows actually need this table (webhook health);
-- the other 2 ("orders stuck as created", "refunds this month") are
-- already directly readable via platform_payments' existing admin-select
-- policy (1002) — same platform_payments read revenue/queries.ts's
-- getRevenueTiles() already does for its "Awaiting settlement"/"Net of
-- refunds" tiles, just recomputed on Overview's own render, not exposed
-- through this RPC. So this migration adds exactly one function, not four.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.admin_billing_pipeline()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_result jsonb;
begin
  if not app.is_platform_admin() then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;

  select jsonb_build_object(
    'webhooks_ok_24h', (
      select count(*) from payment_provider_events
      where received_at >= now() - interval '24 hours'
        and signature_verified = true
        and processing_error is null
    ),
    'signature_failures_24h', (
      select count(*) from payment_provider_events
      where received_at >= now() - interval '24 hours'
        and signature_verified = false
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke execute on function public.admin_billing_pipeline() from public, anon, authenticated;
grant execute on function public.admin_billing_pipeline() to authenticated;
