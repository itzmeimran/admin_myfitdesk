-- Read-only scheduler checks. No secrets or worker tokens are returned.
select default_days,enabled from public.gym_deletion_config where singleton;
select jobname,schedule,active from cron.job
where jobname in ('purge-expired-gyms','recover-gym-deletion-dispatch') order by jobname;
select wake_at,request_id,requested_at,retry_not_before,failures,last_status,last_error
from app.gym_deletion_dispatch where singleton;
select has_table_privilege('authenticated','app.gym_deletion_dispatch','select') as journal_access_must_be_false,
  has_function_privilege('authenticated','app.dispatch_gym_deletion_worker()','execute') as dispatch_access_must_be_false;
-- The deadline job is inactive when disabled/idle; the hourly DB-only recovery
-- job remains active. A future calendar schedule is expected for pending work.
