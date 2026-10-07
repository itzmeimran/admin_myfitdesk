-- Local PostgreSQL tests only: extension API signatures with no real network.
create schema vault;
create schema cron;
create schema net;
create table vault.secrets(id uuid primary key default gen_random_uuid(),name text unique,secret text);
create view vault.decrypted_secrets as select name,secret as decrypted_secret from vault.secrets;
create function vault.create_secret(value text,name text,description text) returns uuid language sql as $$ insert into vault.secrets(name,secret) values(name,value) returning id $$;
create function vault.update_secret(secret_id uuid,value text,new_name text,description text) returns void language sql as $$ update vault.secrets set secret=value,name=new_name where id=secret_id $$;
create table cron.job(jobid bigserial primary key,jobname text,schedule text,command text,active boolean default true,username text default current_user,unique(jobname,username));
create function cron.schedule(job_name text,schedule text,command text) returns bigint language sql as $$
  insert into cron.job(jobname,schedule,command) values(job_name,schedule,command)
  on conflict(jobname,username) do update set schedule=excluded.schedule,command=excluded.command,active=true returning jobid
$$;
create function cron.alter_job(job_id bigint,schedule text default null,command text default null,database text default null,username text default null,active boolean default null) returns void language sql as $$
  update cron.job j set schedule=coalesce($2,j.schedule),command=coalesce($3,j.command),username=coalesce($5,j.username),active=coalesce($6,j.active) where j.jobid=$1
$$;
create table net._http_response(id bigint,status_code integer,timed_out boolean,error_msg text,created timestamptz default clock_timestamp(),content text);
create table net.calls(id bigserial primary key,url text,body jsonb,created timestamptz default clock_timestamp());
create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) returns bigint language sql as $$ insert into net.calls(url,body) values(url,body) returning id $$;
