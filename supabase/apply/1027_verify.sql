-- Read-only installation/activation checks. Run in each intended project.
select default_days,enabled from public.gym_deletion_config;
select to_regprocedure('public.admin_request_gym_deletion(uuid,integer,text,text)') is not null as request_installed,
  to_regprocedure('public.restore_gym_deletion(uuid)') is not null as restore_installed,
  to_regprocedure('public.purge_gym_database(uuid,uuid)') is not null as purge_installed;
select has_function_privilege('authenticated','public.purge_gym_database(uuid,uuid)','execute') as must_be_false,
  has_function_privilege('service_role','public.purge_gym_database(uuid,uuid)','execute') as must_be_true,
  has_column_privilege('authenticated','public.gym_deletion_jobs','lease_token','select') as worker_token_must_be_private;
select n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname in ('public','app') and c.relkind='r' and c.relname not in ('gym_deletion_jobs','admin_audit_log','system_alerts','audit_log')
and exists(select 1 from pg_attribute a where a.attrelid=c.oid and a.attname in ('organization_id','org_id') and a.atttypid='uuid'::regtype and not a.attisdropped)
and not exists(select 1 from pg_trigger t where t.tgrelid=c.oid and t.tgname='guard_isolated_gym' and not t.tgisinternal);
-- The last query must return no rows. Repeat after adding tenant tables.
select state,count(*),count(*) filter(where last_error is not null) as needs_attention from public.gym_deletion_jobs group by state;
