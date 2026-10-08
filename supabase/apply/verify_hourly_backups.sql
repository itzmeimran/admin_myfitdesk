-- Read-only status. A successful cron SQL run only enqueues HTTP;
-- verify the matching HTTP response and GitHub worker/backup rows as well.
select jobid,jobname,schedule,active,username from cron.job
where jobname='dispatch-database-backups';

select r.status,r.return_message,r.start_time,r.end_time
from cron.job_run_details r join cron.job j using(jobid)
where j.jobname='dispatch-database-backups'
order by r.start_time desc limit 10;

select backup_type,status,verification_status,created_at,completed_at
from public.database_backups where trigger_type='scheduled'
order by created_at desc limit 12;

-- To pause: select cron.alter_job(<verified jobid>,active:=false);
-- Do not install a timer in DEV: scheduled backups are PROD-only.
