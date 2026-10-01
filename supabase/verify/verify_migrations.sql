-- verify_migrations.sql — "did the migrations land as expected?"
--
-- READ-ONLY. Changes nothing, safe to run any number of times, on DEV or PROD.
-- Paste the whole file into the Supabase SQL Editor and run it.
--
-- Output: the top rows are one SUMMARY row per migration (LANDED / INCOMPLETE),
-- then every individual check, with failures listed first inside each group.
-- A migration that was never applied to this project shows INCOMPLETE with every
-- check MISSING — that is the "what do I still need to run here?" map.
--
-- What each check kind proves:
--   table            the table exists
--   rls              row level security is enabled AND forced on it
--   column           the column exists
--   index            the index exists
--   policy           the named RLS policy exists on that table
--   fn_admin         the function exists (exact signature), `anon` can NOT execute
--                    it and `authenticated` can (admin-gated RPCs check the caller
--                    inside the function)
--   fn_internal      the function exists and NEITHER anon nor authenticated can
--                    execute it (helpers only reachable through other functions)
--   fn_definer       SECURITY DEFINER with a pinned search_path
--   fnname_admin     same as fn_admin but matched by name (any overload) — used
--                    where the exact signature is not fixed here
--   fn_absent        the function was meant to be dropped and is gone
--   rows_min         the table holds at least N seed rows
--   cron             the pg_cron job is scheduled
--   trigger_min      at least N triggers match the name pattern
--   def_contains     the function body contains the given text (proves a
--                    CREATE OR REPLACE with new logic landed)

with c(migration, kind, target, arg) as (values

-- ── 1009–1015  gym detail, subscriptions, onboarding (older, still required) ──
('1009-1015 gym detail & subscriptions','fnname_admin','admin_gyms_list',null),
('1009-1015 gym detail & subscriptions','fnname_admin','admin_gym_detail',null),
('1009-1015 gym detail & subscriptions','fnname_admin','admin_gym_members',null),
('1009-1015 gym detail & subscriptions','fnname_admin','admin_gym_billing_history',null),
('1009-1015 gym detail & subscriptions','fnname_admin','admin_gym_audit_log',null),
('1009-1015 gym detail & subscriptions','fnname_admin','admin_gym_configuration',null),
('1009-1015 gym detail & subscriptions','fnname_admin','admin_suspend_organization',null),
('1009-1015 gym detail & subscriptions','fnname_admin','admin_extend_subscription',null),
('1009-1015 gym detail & subscriptions','fnname_admin','admin_schedule_subscription_package',null),
('1009-1015 gym detail & subscriptions','fnname_admin','admin_create_gym_owner_invitation',null),
('1009-1015 gym detail & subscriptions','column','public.organizations','suspended_at'),

-- ── 1016  auto-cancel stale Razorpay orders ──
('1016 auto_cancel_stale_payments','cron','expire-stale-platform-payments',null),
('1016 auto_cancel_stale_payments','fn_internal','public.expire_stale_payment_orders()',null),

-- ── 1017  disaster recovery ──
('1017 disaster_recovery','table','public.disaster_recovery_config',null),
('1017 disaster_recovery','table','public.database_backups',null),
('1017 disaster_recovery','table','public.database_restore_history',null),
('1017 disaster_recovery','table','public.system_alerts',null),
('1017 disaster_recovery','table','public.system_data_snapshots',null),
('1017 disaster_recovery','rls','public.database_backups',null),
('1017 disaster_recovery','rls','public.system_alerts',null),
('1017 disaster_recovery','rows_min','public.disaster_recovery_config','1'),
('1017 disaster_recovery','fnname_admin','admin_queue_database_backup',null),
('1017 disaster_recovery','fnname_admin','admin_resolve_system_alert',null),

-- ── 1018  WhatsApp credits & manual renewal ──
('1018 whatsapp_credits_manual_renewal','fnname_admin','admin_grant_whatsapp_credits',null),
('1018 whatsapp_credits_manual_renewal','fnname_admin','admin_whatsapp_credit_gyms',null),
('1018 whatsapp_credits_manual_renewal','fnname_admin','admin_record_manual_subscription_renewal',null),

-- ── 1019  gym overview ──
('1019 admin_gym_overview','table','public.admin_gym_notes',null),
('1019 admin_gym_overview','rls','public.admin_gym_notes',null),
('1019 admin_gym_overview','fn_admin','public.admin_gym_overview(uuid)',null),
('1019 admin_gym_overview','fn_admin','public.admin_gym_whatsapp_messages(uuid,text,integer,integer)',null),
('1019 admin_gym_overview','fn_admin','public.admin_add_gym_note(uuid,text,text)',null),

-- ── 20260930120000  gym realtime ──
('20260930120000 admin_gym_realtime','fn_internal','app.emit_gym_change()',null),
('20260930120000 admin_gym_realtime','trigger_min','zz_gym_rt_%','60'),
('20260930120000 admin_gym_realtime','policy','realtime.messages','platform admins receive gym realtime'),

-- ── 20260930140000  API performance ──
('20260930140000 api_performance','table','public.api_request_events',null),
('20260930140000 api_performance','table','public.api_metrics_hourly',null),
('20260930140000 api_performance','table','public.api_monitor_settings',null),
('20260930140000 api_performance','rls','public.api_request_events',null),
('20260930140000 api_performance','rows_min','public.api_monitor_settings','1'),
('20260930140000 api_performance','fnname_admin','admin_api_overview',null),
('20260930140000 api_performance','cron','api-metrics-rollup',null),
('20260930140000 api_performance','cron','api-metrics-prune',null),

-- ── 20260930160000  member avatars ──
('20260930160000 admin_member_avatars','fn_admin','public.admin_gym_member_avatars(uuid,uuid[])',null),

-- ── 20260930170000  gym operations foundation (Command Center, part 1) ──
('20260930170000 gym_operations_foundation','table','public.organization_operation_locks',null),
('20260930170000 gym_operations_foundation','table','public.feature_flag_definitions',null),
('20260930170000 gym_operations_foundation','table','public.organization_feature_flags',null),
('20260930170000 gym_operations_foundation','rls','public.organization_operation_locks',null),
('20260930170000 gym_operations_foundation','rls','public.feature_flag_definitions',null),
('20260930170000 gym_operations_foundation','rls','public.organization_feature_flags',null),
('20260930170000 gym_operations_foundation','policy','public.organization_operation_locks','organization_operation_locks_admin_select'),
('20260930170000 gym_operations_foundation','policy','public.feature_flag_definitions','feature_flag_definitions_admin_select'),
('20260930170000 gym_operations_foundation','policy','public.organization_feature_flags','organization_feature_flags_admin_select'),
('20260930170000 gym_operations_foundation','rows_min','public.feature_flag_definitions','5'),
('20260930170000 gym_operations_foundation','column','public.admin_gym_notes','updated_at'),
('20260930170000 gym_operations_foundation','column','public.admin_gym_notes','updated_by'),
('20260930170000 gym_operations_foundation','column','public.admin_gym_notes','deleted_at'),
('20260930170000 gym_operations_foundation','column','public.admin_gym_notes','deleted_by'),
('20260930170000 gym_operations_foundation','column','public.system_alerts','organization_id'),
('20260930170000 gym_operations_foundation','column','public.system_alerts','title'),
('20260930170000 gym_operations_foundation','column','public.system_alerts','dedupe_key'),
('20260930170000 gym_operations_foundation','column','public.system_alerts','acknowledged_at'),
('20260930170000 gym_operations_foundation','column','public.system_alerts','acknowledged_by'),
('20260930170000 gym_operations_foundation','column','public.system_alerts','resolution_note'),
('20260930170000 gym_operations_foundation','index','system_alerts_org_open_dedupe_idx',null),
('20260930170000 gym_operations_foundation','fn_admin','public.admin_set_operation_lock(uuid,text,boolean,text,timestamp with time zone)',null),
('20260930170000 gym_operations_foundation','fn_admin','public.admin_set_feature_flag(uuid,text,boolean,text)',null),
('20260930170000 gym_operations_foundation','fn_admin','public.admin_update_gym_note(uuid,text)',null),
('20260930170000 gym_operations_foundation','fn_admin','public.admin_delete_gym_note(uuid)',null),
('20260930170000 gym_operations_foundation','fn_admin','public.admin_set_alert_status(uuid,text,text)',null),
('20260930170000 gym_operations_foundation','fn_admin','public.admin_adjust_whatsapp_credits(uuid,integer,text)',null),
('20260930170000 gym_operations_foundation','fn_admin','public.admin_retry_failed_whatsapp(uuid,text)',null),
('20260930170000 gym_operations_foundation','fn_admin','public.admin_revoke_org_sessions(uuid,text,text)',null),
('20260930170000 gym_operations_foundation','fn_admin','public.organization_operation_locked(uuid,text)',null),
('20260930170000 gym_operations_foundation','fn_admin','public.organization_feature_enabled(uuid,text)',null),
('20260930170000 gym_operations_foundation','fn_internal','app.current_environment()',null),
('20260930170000 gym_operations_foundation','fn_internal','app.require_reason(text)',null),
('20260930170000 gym_operations_foundation','fn_internal','app.log_admin_action(text,uuid,text,text,jsonb,jsonb,text,jsonb)',null),
('20260930170000 gym_operations_foundation','fn_internal','app.org_lock_active(uuid,text)',null),
('20260930170000 gym_operations_foundation','fn_definer','public.admin_set_operation_lock(uuid,text,boolean,text,timestamp with time zone)',null),
('20260930170000 gym_operations_foundation','fn_definer','public.admin_adjust_whatsapp_credits(uuid,integer,text)',null),
('20260930170000 gym_operations_foundation','fn_definer','public.admin_revoke_org_sessions(uuid,text,text)',null),
('20260930170000 gym_operations_foundation','fn_definer','public.organization_operation_locked(uuid,text)',null),

-- ── 20260930170100  gym operations reads (Command Center, part 2) ──
('20260930170100 gym_operations_reads','fn_admin','public.admin_gym_reconciliation(uuid)',null),
('20260930170100 gym_operations_reads','fn_admin','public.admin_gym_data_health(uuid)',null),
('20260930170100 gym_operations_reads','fn_admin','public.admin_gym_jobs(uuid)',null),
('20260930170100 gym_operations_reads','fn_admin','public.admin_gym_webhooks(uuid)',null),
('20260930170100 gym_operations_reads','fn_admin','public.admin_gym_whatsapp_ops(uuid)',null),
('20260930170100 gym_operations_reads','fn_admin','public.admin_gym_credit_history(uuid,integer,integer)',null),
('20260930170100 gym_operations_reads','fn_admin','public.admin_gym_locks(uuid)',null),
('20260930170100 gym_operations_reads','fn_admin','public.admin_gym_feature_flags(uuid)',null),
('20260930170100 gym_operations_reads','fn_admin','public.admin_gym_notes_list(uuid)',null),
('20260930170100 gym_operations_reads','fn_admin','public.admin_gym_alerts(uuid,boolean,integer)',null),
('20260930170100 gym_operations_reads','fn_admin','public.admin_refresh_gym_alerts(uuid)',null),
('20260930170100 gym_operations_reads','fn_admin','public.admin_gym_access(uuid)',null),
('20260930170100 gym_operations_reads','fn_admin','public.admin_gym_ops_summary(uuid)',null),
('20260930170100 gym_operations_reads','fn_admin','public.admin_gym_timeline(uuid,text,text,text,text,timestamp with time zone,timestamp with time zone,text,integer,integer)',null),
('20260930170100 gym_operations_reads','fn_admin','public.admin_export_gym_dataset(uuid,text,text)',null),
('20260930170100 gym_operations_reads','fn_admin','public.admin_log_activity_export(uuid,jsonb,integer)',null),
('20260930170100 gym_operations_reads','fn_internal','app.org_webhook_events(uuid,timestamp with time zone)',null),
('20260930170100 gym_operations_reads','fn_internal','app.recon_check(text,text,text,text,jsonb)',null),
('20260930170100 gym_operations_reads','fn_internal','app.org_recon_findings(uuid)',null),
('20260930170100 gym_operations_reads','fn_internal','app.org_data_health(uuid)',null),
('20260930170100 gym_operations_reads','fn_internal','app.org_job_stats(uuid)',null),
('20260930170100 gym_operations_reads','fn_internal','app.org_webhook_summary(uuid)',null),
('20260930170100 gym_operations_reads','fn_internal','app.org_alert_candidates(uuid)',null),
('20260930170100 gym_operations_reads','fn_internal','app.sync_org_alerts(uuid)',null),
('20260930170100 gym_operations_reads','fn_internal','app.sync_all_org_alerts()',null),
('20260930170100 gym_operations_reads','fn_internal','app.timeline_category(text,text)',null),
('20260930170100 gym_operations_reads','fn_definer','public.admin_gym_timeline(uuid,text,text,text,text,timestamp with time zone,timestamp with time zone,text,integer,integer)',null),
('20260930170100 gym_operations_reads','fn_definer','public.admin_export_gym_dataset(uuid,text,text)',null),
('20260930170100 gym_operations_reads','fn_definer','public.admin_gym_access(uuid)',null),
('20260930170100 gym_operations_reads','cron','sync-gym-operational-alerts',null),

-- ── 20260930180000  platform settings, roles & admin lifecycle ──
('20260930180000 platform_settings','table','public.platform_roles',null),
('20260930180000 platform_settings','table','public.platform_role_permissions',null),
('20260930180000 platform_settings','table','public.platform_settings',null),
('20260930180000 platform_settings','rls','public.platform_roles',null),
('20260930180000 platform_settings','rls','public.platform_settings',null),
('20260930180000 platform_settings','rows_min','public.platform_roles','4'),
('20260930180000 platform_settings','rows_min','public.platform_role_permissions','1'),
('20260930180000 platform_settings','column','public.platform_admins','role'),
('20260930180000 platform_settings','column','public.platform_admins','status'),
('20260930180000 platform_settings','column','public.platform_admins','invited_at'),
('20260930180000 platform_settings','column','public.platform_admins','activated_at'),
('20260930180000 platform_settings','column','public.platform_admins','suspended_at'),
('20260930180000 platform_settings','def_contains','app.is_platform_admin()','status'),
('20260930180000 platform_settings','fnname_admin','admin_my_access',null),
('20260930180000 platform_settings','fnname_admin','admin_invite_platform_admin',null),
('20260930180000 platform_settings','fnname_admin','claim_platform_admin_invitation',null),
('20260930180000 platform_settings','fnname_admin','admin_set_platform_admin_role',null),
('20260930180000 platform_settings','fnname_admin','admin_set_platform_admin_status',null),
('20260930180000 platform_settings','fnname_admin','admin_access_history',null),
('20260930180000 platform_settings','fn_absent','admin_grant_platform_admin',null),
('20260930180000 platform_settings','fn_absent','admin_revoke_platform_admin',null),

-- ── 20261001090000  member actors (Added by / Recorded by) ──
('20261001090000 admin_member_actors','fnname_admin','admin_gym_member_actors',null),
('20261001090000 admin_member_actors','fnname_admin','admin_gym_member_subscription_actors',null)
),

r as (
  select c.migration, c.kind, c.target, c.arg,
    coalesce(case c.kind
      when 'table' then to_regclass(c.target) is not null
      when 'rls' then exists (select 1 from pg_class k where k.oid = to_regclass(c.target) and k.relrowsecurity and k.relforcerowsecurity)
      when 'column' then exists (select 1 from information_schema.columns i
                                  where i.table_schema = split_part(c.target, '.', 1)
                                    and i.table_name = split_part(c.target, '.', 2) and i.column_name = c.arg)
      when 'index' then exists (select 1 from pg_indexes x where x.indexname = c.target)
      when 'policy' then exists (select 1 from pg_policies p
                                  where p.schemaname || '.' || p.tablename = c.target and p.policyname = c.arg)
      when 'fn_admin' then to_regprocedure(c.target) is not null
                           and not has_function_privilege('anon', to_regprocedure(c.target), 'execute')
                           and has_function_privilege('authenticated', to_regprocedure(c.target), 'execute')
      when 'fn_internal' then to_regprocedure(c.target) is not null
                           and not has_function_privilege('anon', to_regprocedure(c.target), 'execute')
                           and not has_function_privilege('authenticated', to_regprocedure(c.target), 'execute')
      when 'fn_definer' then exists (select 1 from pg_proc p
                                      where p.oid = to_regprocedure(c.target) and p.prosecdef
                                        and exists (select 1 from unnest(coalesce(p.proconfig, '{}')) s where s like 'search_path=%'))
      when 'fnname_admin' then
           exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                    where n.nspname = 'public' and p.proname = c.target)
           and not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                    where n.nspname = 'public' and p.proname = c.target
                      and has_function_privilege('anon', p.oid, 'execute'))
      when 'fn_absent' then not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                    where n.nspname = 'public' and p.proname = c.target)
      when 'rows_min' then
           case when to_regclass(c.target) is null then false
                else (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %s', c.target), false, true, '')))[1]::text::int >= c.arg::int end
      when 'cron' then
           case when to_regclass('cron.job') is null then false
                else (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from cron.job where jobname = %L', c.target), false, true, '')))[1]::text::int > 0 end
      when 'trigger_min' then (select count(*) from pg_trigger t where t.tgname like c.target and not t.tgisinternal) >= c.arg::int
      when 'def_contains' then position(c.arg in pg_get_functiondef(to_regprocedure(c.target))) > 0
      else false
    end, false) as ok
  from c
),

summary as (
  select migration, 'SUMMARY'::text as kind,
         count(*) filter (where ok)::text || ' of ' || count(*)::text || ' checks pass' as target,
         case when bool_and(ok) then 'LANDED' else 'INCOMPLETE' end as status,
         0 as grp
  from r group by migration
)

select migration, kind, target, status
from (
  select migration, kind, target, status, grp, 0 as fail_first from summary
  union all
  select migration, kind, target || coalesce('  →  ' || arg, ''),
         case when ok then 'ok' else 'MISSING / WRONG' end, 1,
         case when ok then 1 else 0 end
  from r
) x
order by grp, migration, fail_first, kind, target;
