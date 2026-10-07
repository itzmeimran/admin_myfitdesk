-- Run separately in the intended project AFTER deploying and rehearsing.
-- Vault values must already exist; never paste tokens into source control.
-- gym_deletion_worker_url: canonical admin URL ending in
--   /api/cron/gym-deletions?environment=dev (or environment=prod)
-- gym_deletion_cron_secret: same as GYM_DELETION_CRON_SECRET_DEV/PROD
-- Optional vercel_protection_bypass for protected development deployments.
begin;
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;
create or replace function app.dispatch_gym_deletion_worker() returns void
language plpgsql security definer set search_path=pg_catalog,public,app as $$
declare worker_url text; worker_secret text; bypass text; headers jsonb; expected_mode text;
begin
  if not (select enabled from public.gym_deletion_config where singleton) then return; end if;
  select decrypted_secret into worker_url from vault.decrypted_secrets where name='gym_deletion_worker_url';
  select decrypted_secret into worker_secret from vault.decrypted_secrets where name='gym_deletion_cron_secret';
  select decrypted_secret into bypass from vault.decrypted_secrets where name='vercel_protection_bypass';
  select case environment when 'development' then 'dev' when 'production' then 'prod' end into expected_mode from public.disaster_recovery_config where singleton;
  if worker_url is null or worker_url !~ '^https://[^/]+/api/cron/gym-deletions\?environment=(dev|prod)$' or length(coalesce(worker_secret,''))<32 then raise exception 'Gym deletion scheduler is not configured'; end if;
  if expected_mode is null or worker_url not like '%?environment='||expected_mode then raise exception 'Deletion scheduler points to the wrong environment'; end if;
  headers:=jsonb_build_object('Authorization','Bearer '||worker_secret,'Content-Type','application/json');
  if bypass is not null then headers:=headers||jsonb_build_object('x-vercel-protection-bypass',bypass); end if;
  perform net.http_post(url:=worker_url,headers:=headers,body:='{}'::jsonb,timeout_milliseconds:=300000);
end $$;
revoke all on function app.dispatch_gym_deletion_worker() from public,anon,authenticated,service_role;
do $$ begin
  if not exists(select 1 from vault.decrypted_secrets where name='gym_deletion_worker_url') or not exists(select 1 from vault.decrypted_secrets where name='gym_deletion_cron_secret' and length(decrypted_secret)>=32) then
    raise exception 'Configure and verify the environment-specific worker before activation';
  end if;
  if exists(select 1 from cron.job where jobname='purge-expired-gyms') then perform cron.unschedule('purge-expired-gyms'); end if;
  perform cron.schedule('purge-expired-gyms','*/15 * * * *','select app.dispatch_gym_deletion_worker()');
end $$;
update public.gym_deletion_config set enabled=true where singleton;
select app.dispatch_gym_deletion_worker();
commit;
