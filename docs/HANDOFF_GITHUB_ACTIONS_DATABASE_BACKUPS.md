# Handoff: GitHub Actions database dumps → private Cloudflare R2

## Purpose of this handoff

This file is for the separate ChatGPT session currently configuring GitHub Actions to create PostgreSQL dumps and upload them to Cloudflare R2. The application/control-plane work is already implemented in this repository. The GitHub Actions session should integrate with that work instead of creating a second backup system, duplicate metadata tables, or a competing retention model.

Repository: `itzmeimran/admin_myfitdesk`

Completed implementation commit on `main`: `b824a74` (`Add disaster recovery and database backups`)

Migration parser fix and this completed operational handoff: `7c45824` (`Fix disaster recovery migration and document backup setup`)

Primary implementation documentation: `docs/DISASTER_RECOVERY.md`

## What has already been completed

### Database/control plane

Migration `supabase/migrations/1017_disaster_recovery.sql` creates:

- `public.disaster_recovery_config`
- `public.database_backups`
- `public.database_restore_history`
- `public.system_alerts`
- `public.system_data_snapshots`
- extensions to the existing `public.admin_audit_log`
- platform-admin-only backup, restore, protection, deletion, maintenance, alert, and recycle-bin RPCs
- centralized critical-entity audit triggers
- maintenance-state RPC for later tenant-app integration
- forced RLS and explicit grants

The user reported this deployed error:

```text
Could not find the table 'public.database_backups' in the schema cache
```

That means migration `1017` was not yet applied to the Supabase project selected in the admin dashboard. The user is applying the SQL manually. Environment initialization must be run afterward:

```sql
insert into public.disaster_recovery_config (
  singleton,
  environment,
  database_identifier
)
values (
  true,
  'development', -- use 'production' only in the production database
  '<SUPABASE_PROJECT_REF>'
)
on conflict (singleton) do update
set environment = excluded.environment,
    database_identifier = excluded.database_identifier,
    updated_at = now();

notify pgrst, 'reload schema';
```

`database_identifier` should be the Supabase project reference: the subdomain portion of `https://<project-ref>.supabase.co`. It must exactly equal the GitHub secret `BACKUP_DATABASE_IDENTIFIER` for that environment.

### Admin application

System → Disaster Recovery is implemented with responsive desktop/tablet/mobile layouts and tabs for:

- Backups
- Restore History
- Audit Logs
- Deleted Records
- System Health

The application can queue a manual backup or restore through database RPCs. Optional server-only GitHub configuration can immediately dispatch a workflow. If dispatch is not configured, the request remains queued and is picked up by the next scheduled backup worker run.

### Worker

The existing worker is:

```text
scripts/disaster-recovery-worker.mjs
```

Do not replace it with a second implementation unless a concrete bug requires a focused change. It already implements:

- environment/database-identity validation
- `pg_dump --format=custom --no-owner --no-acl`
- application-managed `public` + `app` schemas
- exclusion of Supabase-managed schemas
- exclusion of the DR/admin control-plane tables
- SHA-256 calculation
- archive validation through `pg_restore --list`
- private R2 upload
- multipart uploads for large dumps
- R2 object-size and checksum-metadata verification
- metadata status transitions in `database_backups`
- hourly/daily/monthly promotion
- retention cleanup
- queued manual-backup processing
- lightweight data snapshots and alert generation
- guaranteed temporary-file cleanup
- restore workflow, including mandatory verified pre-restore backup

The pure retention/key/environment policies and tests are in:

```text
scripts/lib/disaster-recovery-policy.mjs
scripts/disaster-recovery-policy.test.mjs
```

Run them with:

```bash
npm run test:dr
```

### Existing workflows

The repository already contains:

```text
.github/workflows/database-backup.yml
.github/workflows/database-restore.yml
```

`database-backup.yml` runs at minute 7 every hour in UTC and supports `workflow_dispatch` inputs:

- `environment`: `development`, `production`, or `both`
- `backup_type`: `manual`, `scheduled`, or `pre_migration`
- `request_id`: optional UUID from `database_backups`

It installs PostgreSQL 17 client tools, runs `npm ci --ignore-scripts`, then executes:

```bash
node scripts/disaster-recovery-worker.mjs backup
```

`database-restore.yml` is manual-only and requires a queued `database_restore_history` UUID. Production restore uses the protected GitHub Environment `production-restore`.

## Required GitHub Environments

Use these environment names unless the workflow is deliberately updated everywhere consistently:

1. `development`
2. `production-backup`
3. `production-restore`

Configure required reviewers on `production-restore` only. Do not put reviewer approval on `production-backup`, because that would block hourly scheduled backups.

The production database/R2 values are intentionally duplicated between `production-backup` and `production-restore`. This separation is an operational safety boundary, not a second production database.

## Required GitHub secrets

These are required for each GitHub Environment that executes the worker:

```text
BACKUP_DATABASE_IDENTIFIER
BACKUP_SUPABASE_DB_URL
BACKUP_R2_ACCOUNT_ID
BACKUP_R2_ACCESS_KEY_ID
BACKUP_R2_SECRET_ACCESS_KEY
BACKUP_R2_BUCKET
```

Optional because the worker derives the standard endpoint from the account ID:

```text
BACKUP_R2_ENDPOINT
```

Important details:

- `BACKUP_SUPABASE_DB_URL` must be a direct connection or session-pooler connection, never transaction-pooler mode.
- `BACKUP_DATABASE_IDENTIFIER` must exactly match `public.disaster_recovery_config.database_identifier` in the target database.
- Development GitHub secrets must point only to the DEV database.
- Production environments must point only to the PROD database.
- Use a dedicated private backup bucket/token; do not reuse the public asset/CDN bucket.
- The R2 token should have Object Read & Write permission scoped only to the backup bucket.
- Keep `r2.dev` and custom-domain public access disabled.
- Do not print secrets or the database URL in logs.

If the other session already created secrets with different names, either create aliases with the names above or update the workflow environment mapping. Do not maintain two sets of worker code with different secret contracts.

## Optional Vercel variables

These are needed only if clicking **Create Backup** or **Restore** in the admin app should immediately dispatch GitHub Actions:

```text
BACKUP_GITHUB_TOKEN
BACKUP_GITHUB_REPOSITORY=itzmeimran/admin_myfitdesk
BACKUP_GITHUB_REF=main
```

`BACKUP_GITHUB_TOKEN` should be a fine-grained token restricted to this repository with Actions read/write permission.

Database URLs and R2 credentials must not be put in Vercel. They belong only in GitHub Environment secrets.

## Backup behavior the GitHub session must preserve

### Schedule and retention

- Hourly: every hour, keep for 48 hours.
- Daily: one promoted at 00:07 UTC, keep for 30 days.
- Monthly: one promoted at 00:07 UTC on day 1, keep for 12 months.
- Pre-restore: keep for at least 30 days.
- Pre-migration: keep for at least 30 days.
- Manual: keep indefinitely until explicitly deleted.
- Protected backups: never delete automatically.

One scheduled dump is reused for every tier due in that run; do not run three separate `pg_dump` processes at midnight.

### R2 object layout

Expected prefixes:

```text
development/hourly/YYYY/MM/DD/dev-hourly-YYYY-MM-DD-HH-MM.dump
development/daily/dev-daily-YYYY-MM-DD-HH-MM.dump
development/monthly/dev-monthly-YYYY-MM-DD-HH-MM.dump

production/hourly/YYYY/MM/DD/prod-hourly-YYYY-MM-DD-HH-MM.dump
production/daily/prod-daily-YYYY-MM-DD-HH-MM.dump
production/monthly/prod-monthly-YYYY-MM-DD-HH-MM.dump
```

Manual, pre-restore, and pre-migration objects use their own environment-prefixed folders. DEV and PROD objects must never share a prefix.

### Dump scope

The worker dumps application-managed `public` and `app` schemas. It must not dump or restore Supabase-managed `auth`, `storage`, `realtime`, extension, or migration-history schemas.

The worker also excludes these control-plane tables so an application-data restore cannot erase its own job/history/security state:

```text
public.disaster_recovery_config
public.database_backups
public.database_restore_history
public.system_alerts
public.system_data_snapshots
public.platform_admins
public.admin_audit_log
```

Do not remove those exclusions without a reviewed replacement architecture.

### Metadata contract

A backup is not complete merely because an R2 object exists. The worker must also update the corresponding `database_backups` row with:

- `storage_key`
- `filename`
- `file_size_bytes`
- `checksum_sha256`
- `completed_at`
- `duration_ms`
- `status = 'ready'`
- `verification_status = 'verified'`
- `verified_at`

On dump/upload/verification failure, it must set `status = 'failed'`, retain a sanitized error, and create a system alert. If an existing GitHub Action only uploads a file to R2, it is not integrated with the admin system and must be adapted to use this worker/contract.

## Next steps for the GitHub Actions session

Complete these in order:

1. Pull `main` and confirm commit `b824a74` is present.
2. Inspect the existing `database-backup.yml` and worker before changing anything.
3. Ensure migration `1017` has been applied to DEV and the DEV config row exists.
4. Create/verify the `development` GitHub Environment and required secrets.
5. Confirm `BACKUP_DATABASE_IDENTIFIER` equals the DEV Supabase project ref stored in the config row.
6. Confirm the dedicated R2 bucket is private and the token is bucket-scoped.
7. Run `database-backup.yml` manually with:
   - environment: `development`
   - backup type: `manual`
   - request ID: blank
8. Confirm the Action installs PostgreSQL 17 and completes without logging secrets.
9. Verify the R2 object exists under `development/manual/...`.
10. Verify the database metadata row is `ready` + `verified`, with matching size/checksum/storage key.
11. Open System → Disaster Recovery in the DEV admin environment and confirm the backup appears.
12. Run the policy tests and application validation.
13. Only after DEV succeeds, configure `production-backup` with production-scoped secrets.
14. Do not run a production restore. Restore testing must happen in development later.

Useful DEV verification SQL:

```sql
select
  id,
  environment,
  backup_type,
  storage_key,
  file_size_bytes,
  checksum_sha256,
  status,
  verification_status,
  created_at,
  completed_at,
  error_message
from public.database_backups
order by created_at desc
limit 10;

select environment, database_identifier, maintenance_mode
from public.disaster_recovery_config;

select severity, type, message, created_at
from public.system_alerts
where resolved_at is null
order by created_at desc;
```

## GitHub configuration and DEV backup completed

GitHub Environments now configured:

- `development`
- `production-backup`
- `production-restore`

Each environment has these secret names configured (values intentionally omitted):

- `BACKUP_DATABASE_IDENTIFIER`
- `BACKUP_SUPABASE_DB_URL`
- `BACKUP_R2_ACCOUNT_ID`
- `BACKUP_R2_ACCESS_KEY_ID`
- `BACKUP_R2_SECRET_ACCESS_KEY`
- `BACKUP_R2_BUCKET`

`production-restore` has `@itzmeimran` configured as a required reviewer. No production restore was triggered.

The first DEV backup was run with:

- environment: `development`
- backup type: `manual`
- request ID: blank
- GitHub Actions run: `36337267669`
- Run URL: `https://github.com/itzmeimran/admin_myfitdesk/actions/runs/36337267669`

Verified result:

- database row ID: `25854276-09a5-4136-9bd5-487bcbbb5419`
- status: `ready`
- verification status: `verified`
- storage key: `development/manual/2026/09/dev-manual-2026-09-27-17-33.dump`
- size: `605922` bytes
- SHA-256: `85fc3d1327f165001b65d916ef5c9be8028d8c63295b9d84a7d794228e198c8d`
- DEV database identifier: `pgedlnxuuelmtpmbkdwm`
- open system alerts after the run: `0`

The worker's successful `HeadObject` size/metadata checks and the matching `ready` + `verified` database row confirm that the object exists in R2 and matches the local dump checksum.

## Validation completed before the original implementation push

Before the implementation was pushed:

- TypeScript passed.
- ESLint passed.
- DR policy tests passed: 7/7.
- Node syntax checks passed for both worker scripts.
- Next.js production build passed with non-secret placeholder build variables.
- The first real DEV backup was subsequently run and verified as documented above.

## Repository-state warning

The current local workspace also contains unrelated subscription/package work and Supabase local files that predate this handoff. They are not part of the disaster-recovery commit. Do not stage, overwrite, or commit them as part of GitHub Actions work unless the user explicitly asks.

Known unrelated local paths include:

```text
CLAUDE.md
src/core/db/database.types.ts
src/features/gyms/ManageSubscriptionSheet.tsx
src/features/gyms/actions.ts
supabase/.gitignore
supabase/apply/
supabase/config.toml
supabase/migrations/1014_admin_schedule_subscription_package.sql
```

There is also a safety stash preserving the pre-rebase local state. Do not delete stashes during the GitHub Actions task.

## What the GitHub Actions session must hand back

Return a written handoff containing:

1. Files changed.
2. Commit hash/branch, if anything was pushed.
3. GitHub Environment names created or used.
4. Secret names configured or renamed—never secret values.
5. Exact workflow inputs used for the DEV test.
6. GitHub Actions run URL or run ID.
7. Final R2 object key, size, and checksum.
8. Matching `database_backups` row ID/status/verification status.
9. Any workflow or worker errors and the fix applied.
10. Whether the admin UI displayed the backup.
11. Anything still required before enabling production scheduling.
12. Confirmation that no production restore was triggered.

That return handoff can be given back to this session so both implementations stay synchronized.
