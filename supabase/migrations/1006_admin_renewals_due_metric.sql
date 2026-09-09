-- ═══════════════════════════════════════════════════════════════════════
-- P2 #6 (CLAUDE.md plan): Overview's "Renewals due in 7 days" KPI tile has
-- shown a flagged placeholder ("—" / "Not tracked yet") since the Real
-- numbers everywhere milestone — admin_overview_stats had trials_ending_7d
-- (trial-specific, already surfaced by the attention band) but nothing for
-- a paying subscription's own upcoming renewal. This adds exactly that one
-- new jsonb key; no other behaviour changes.
--
-- Definition: subscriptions whose derived state is 'active' or 'grace' and
-- whose current_period_end falls within the next 7 days. In practice this
-- only ever matches 'active' rows — a 'grace' row's current_period_end is
-- by definition already in the past (that's what makes it grace), so the
-- `>= now()` bound excludes it — but the state check is kept explicit and
-- self-documenting rather than relying on that arithmetic coincidence, and
-- 'trialing' is excluded so this can't double-count trials_ending_7d.
--
-- CREATE OR REPLACE is safe here: admin_overview_stats's signature (args
-- and jsonb return type) is unchanged, only the function body gains one
-- more key in the jsonb_build_object call — no DROP FUNCTION needed, unlike
-- 1004's admin_gym_directory column addition which did change a TABLE
-- return shape.
-- ═══════════════════════════════════════════════════════════════════════
create or replace function public.admin_overview_stats(
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_prev_start timestamptz,
  p_prev_end timestamptz
)
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
    'tenant_counts', (
      select jsonb_object_agg(state, cnt) from (
        select app.derive_subscription_state(os.status, os.current_period_end, os.grace_days) as state, count(*) as cnt
        from organization_subscriptions os
        group by 1
      ) t
    ),
    'total_gyms', (select count(*) from organizations),
    'new_signups_current', (select count(*) from organizations where created_at >= p_period_start and created_at < p_period_end),
    'new_signups_previous', (select count(*) from organizations where created_at >= p_prev_start and created_at < p_prev_end),
    'total_branches', (select count(*) from branches where status = 'active'),
    'total_members', (select count(*) from members where deleted_at is null),
    'platform_revenue_current_minor', (
      select coalesce(sum(amount_minor), 0) from platform_payments
      where status = 'succeeded' and paid_at >= p_period_start and paid_at < p_period_end
    ),
    'platform_revenue_previous_minor', (
      select coalesce(sum(amount_minor), 0) from platform_payments
      where status = 'succeeded' and paid_at >= p_prev_start and paid_at < p_prev_end
    ),
    'mrr_minor', (
      select coalesce(sum(case when pk.billing_period = 'yearly' then pk.price_minor / 12 else pk.price_minor end), 0)
      from organization_subscriptions os
      join platform_packages pk on pk.id = os.package_id
      where os.status not in ('cancelled')
        and app.derive_subscription_state(os.status, os.current_period_end, os.grace_days) in ('active', 'grace')
    ),
    'trials_ending_7d', (
      select count(*) from organization_subscriptions os
      where os.status = 'trialing' and os.current_period_end < now() + interval '7 days' and os.current_period_end >= now()
    ),
    'renewals_due_7d', (
      select count(*) from organization_subscriptions os
      where app.derive_subscription_state(os.status, os.current_period_end, os.grace_days) in ('active', 'grace')
        and os.current_period_end >= now()
        and os.current_period_end < now() + interval '7 days'
    ),
    'in_grace_count', (
      select count(*) from organization_subscriptions os
      where app.derive_subscription_state(os.status, os.current_period_end, os.grace_days) = 'grace'
    ),
    'read_only_count', (
      select count(*) from organization_subscriptions os
      where app.derive_subscription_state(os.status, os.current_period_end, os.grace_days) = 'read_only'
    ),
    'failed_charges_current', (
      select jsonb_build_object('count', count(*), 'amount_minor', coalesce(sum(amount_minor), 0))
      from platform_payments where status = 'failed' and created_at >= p_period_start and created_at < p_period_end
    ),
    'awaiting_settlement', (
      select jsonb_build_object('count', count(*), 'amount_minor', coalesce(sum(amount_minor), 0))
      from platform_payments where status = 'created' and created_at < now() - interval '1 hour'
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke execute on function public.admin_overview_stats(timestamptz, timestamptz, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.admin_overview_stats(timestamptz, timestamptz, timestamptz, timestamptz) to authenticated;
