-- Operational configuration, not a schema migration. Run once in PROD only.
-- Requires the existing pg_cron, pg_net and Vault integrations.
-- Vercel admin_myfitdesk CRON_SECRET must match this project's cron_secret.
-- First verify an authenticated request returns 200 with dispatched=true.
-- One PROD timer dispatches the existing worker for PROD only.
-- No plaintext token is saved in SQL, cron.job, or this repository.
begin;
do $prerequisites$
begin
  if not exists (
    select 1 from public.disaster_recovery_config
    where singleton and environment='production'
      and database_identifier='clbphruocsqsmklmrloq'
  ) then
    raise exception 'This scheduler must run only in the MyFitDesk PROD project';
  end if;
  if not exists (
    select 1 from vault.decrypted_secrets
    where name='cron_secret' and length(btrim(decrypted_secret))>=32
  ) then
    raise exception 'Configure the existing matching cron_secret in Vault first';
  end if;
  if exists (
    select 1 from cron.job
    where jobname='dispatch-database-backups' and username<>current_user
  ) then
    raise exception 'A backup timer is already owned by another database role';
  end if;
end $prerequisites$;

-- pg_cron defaults to GMT: minute 30 is the top of each hour in IST.
-- Same-name scheduling updates this job rather than creating duplicates.
select cron.schedule('dispatch-database-backups','30 * * * *',$command$
  select net.http_get(
    url := 'https://admin.myfitdesk.app/api/cron/backup',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (
        select btrim(decrypted_secret) from vault.decrypted_secrets
        where name='cron_secret'
      )
    ),
    timeout_milliseconds := 60000
  );
$command$);
commit;

select jobid,jobname,schedule,active,username from cron.job
where jobname='dispatch-database-backups';

