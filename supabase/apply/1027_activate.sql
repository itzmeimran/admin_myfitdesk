-- Run separately in the intended project AFTER installing 1027 AND 1028,
-- deploying and rehearsing. Idle/future jobs do not invoke the app worker.
-- Vault values must already exist; never paste tokens into source control.
-- gym_deletion_worker_url: canonical admin URL ending in
--   /api/cron/gym-deletions?environment=dev (or environment=prod)
-- gym_deletion_cron_secret: same as GYM_DELETION_CRON_SECRET_DEV/PROD
-- Optional vercel_protection_bypass for protected development deployments.
begin;
do $$
declare worker_url text; worker_secret text; expected_mode text;
begin
  if to_regclass('app.gym_deletion_dispatch') is null then
    raise exception 'Install gym deletion scheduler migration 1028 before activation';
  end if;
  select decrypted_secret into worker_url from vault.decrypted_secrets where name='gym_deletion_worker_url';
  select decrypted_secret into worker_secret from vault.decrypted_secrets where name='gym_deletion_cron_secret';
  select case environment when 'development' then 'dev' when 'production' then 'prod' end into expected_mode from public.disaster_recovery_config where singleton;
  if worker_url is null or worker_url !~ '^https://[^/]+/api/cron/gym-deletions\?environment=(dev|prod)$' or length(coalesce(worker_secret,''))<32 then raise exception 'Configure and verify the environment-specific worker before activation'; end if;
  if expected_mode is null or worker_url not like '%?environment='||expected_mode then raise exception 'Deletion scheduler points to the wrong environment'; end if;
end $$;
update public.gym_deletion_config set enabled=true where singleton;
-- Dispatch only if work is already due; otherwise arm its deadline or stay idle.
select app.dispatch_gym_deletion_worker();
commit;
