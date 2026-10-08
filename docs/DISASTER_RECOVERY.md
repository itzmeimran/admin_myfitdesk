# MyFitDesk disaster recovery

## What this system provides

MyFitDesk creates encrypted-at-rest PostgreSQL custom-format logical backups in a dedicated private Cloudflare R2 bucket. GitHub Actions is the long-running worker; Vercel only authenticates the platform administrator, validates/queues an operation, and optionally dispatches the workflow.

Recovery points are hourly. This is **not PostgreSQL point-in-time recovery (PITR)** and does not archive WAL. If the available backups are 10:00, 11:00, and 12:00 and an incident occurs at 11:47, the latest safe recovery point may be 11:00. Supabase PITR remains the recommended additional control for production.

Backups contain application-managed `public` and `app` schemas. They exclude Supabase-managed `auth`, `storage`, `realtime`, extension schemas, migration history, and the recovery control-plane tables. This prevents an in-place application-data restore from replacing Supabase infrastructure, platform-admin access, backup metadata, alerts, or the restore job coordinating the operation. Storage objects are not part of a database dump; existing public/private asset buckets are untouched.

## Schedule and retention

The workflow is scheduled at minutes 7 and 37 of every hour, in UTC (two chances per hour because GitHub's cron is best-effort; the worker skips a run when a scheduled hourly backup already exists within 50 minutes):

- hourly: every run, retained for 48 hours;
- daily: promoted on the first scheduled run after midnight IST, retained for 30 days;
- monthly: promoted on the first scheduled run on day 1 in IST, retained for 12 months;
- pre-restore and pre-migration: retained for at least 30 days;
- manual: retained indefinitely until an administrator requests deletion;
- any backup with `protected = true`: never removed automatically.

Scheduled backups run only for production. Development backups are created explicitly through Create backup or a manual/pre-migration workflow dispatch. The scheduled worker creates one local dump and uploads it to each tier due in that run. Development and production always use different key prefixes (`development/...` and `production/...`) and separate GitHub Environment database secrets. The worker refuses to run unless both the configured environment and `BACKUP_DATABASE_IDENTIFIER` match the target database's `disaster_recovery_config` row.

## Reliable hourly trigger

GitHub's `schedule:` cron is **best-effort**: runs start late or are dropped, most often on quiet repositories. Audit of the live PROD project (2026-09-30) found scheduled hourly backups landing every 4–8 hours at irregular minutes, and no daily backup at all for 2026-09-29 — the day's 00:07 run started at 01:44 and daily promotion was tied to UTC hour 0. No backup had failed; the runs simply were not started.

Fixes in this repository:

- **Catch-up promotion.** The worker promotes a daily on the first scheduled run of any IST date that has none, and a monthly on the first run of day 1 in IST. The SQL duplicate check uses the same IST date. Backup filenames/storage keys retain their UTC timestamp convention; the admin screen displays and filters them in IST.
- **De-duplication.** A plain hourly run is skipped if a scheduled hourly backup already exists inside the last 50 minutes, so two triggers in one hour give one backup.
- **`GET /api/cron/backup`.** Dispatches the scheduled backup workflow for production only. Requires `Authorization: Bearer $CRON_SECRET`; refuses everything (503) when `CRON_SECRET` is unset. It also needs the existing `BACKUP_GITHUB_*` variables. The workflow independently excludes DEV for scheduled triggers.
- **The UI reports reality.** A banner and System Health tiles show the last scheduled run, hourly runs in the last 24 h, and the longest gap, computed from real backup rows.

**One thing must be done outside the code:** something has to call `/api/cron/backup` every hour. Set `CRON_SECRET` in Vercel, then use any of: Vercel Cron (`0 * * * *` — sub-daily schedules need a plan that allows them; a Hobby deployment with an hourly cron in `vercel.json` fails to deploy), cron-job.org, or Supabase pg_cron + pg_net. Keep the GitHub schedule as a fallback. Until this is wired up, hourly cadence is still at GitHub's discretion.

### Active Supabase hourly trigger (2026-10-08)

The `admin_myfitdesk` Vercel production deployment now has `CRON_SECRET`. The operator configured it to match the existing MyFitDesk PROD Vault `cron_secret` and redeployed. An authenticated pg_net request to the canonical admin endpoint returned HTTP 200 with `{"dispatched":true}` and started GitHub Actions run `37762217856`, which completed successfully.

PROD hosts one active pg_cron job, `dispatch-database-backups` (job 38), with schedule `30 * * * *`. The verified cron timezone is GMT, so dispatch occurs at the top of each IST hour; worker startup and completion occur afterward. The user subsequently requested **production-only scheduled backups**: the route targets production and the workflow excludes DEV for both cron events and scheduled dispatches. Do not create a timer in DEV. GitHub's schedule remains a fallback and the existing worker de-duplicates recent hourly backups. The initial verification run started for both environments before this preference was provided.

Reproducible operational configuration is in `supabase/apply/activate_hourly_backups.sql`; read-only checks are in `supabase/apply/verify_hourly_backups.sql`. This configures existing infrastructure without a schema migration or migration-history changes. Cron commands look up the secret from Vault at execution time and do not contain the plaintext token. If the shared secret is rotated, update both the tenant and admin deployments and the PROD Vault value together.

A successful cron SQL run means the HTTP request was enqueued, not that the backup completed. Check the request's `net._http_response` status, GitHub job results, and ready/verified backup rows. The dashboard's trailing 24-hour count and longest gap will still reflect earlier missed hours until they leave that window.

## Private R2 bucket

Create a **new bucket** such as `myfitdesk-database-backups`. Do not reuse the logo/public CDN bucket or the tenant private-assets bucket.

Required configuration:

1. Keep public access, custom domains, and `r2.dev` access disabled.
2. Create a bucket-scoped R2 API token with Object Read & Write for this bucket only.
3. R2 automatically encrypts every object and its metadata at rest with AES-256. Do not send S3's ordinary `x-amz-server-side-encryption` header: R2's S3 compatibility layer does not support it.
4. Configure lifecycle rules only if they do not conflict with the database retention policy. Application retention is authoritative because it keeps R2 and database metadata consistent.
5. Never place any R2 value in `NEXT_PUBLIC_*` variables.

## Database setup

Apply `supabase/migrations/1017_disaster_recovery.sql` to **development first**. Do not apply migrations from this repository automatically to production.

Then initialize exactly one row in each database, using a stable identifier such as the Supabase project ref:

```sql
insert into public.disaster_recovery_config (singleton, environment, database_identifier)
values (true, 'development', '<DEV_PROJECT_REF>')
on conflict (singleton) do update
set environment = excluded.environment,
    database_identifier = excluded.database_identifier,
    updated_at = now();
```

Use `production` and the production identifier in the production database. Never copy the development row into production unchanged.

Migration 1017 creates backup metadata, restore history, alerts, data snapshots, maintenance state, RLS, admin-only RPCs, a safe maintenance-status RPC, recycle-bin RPCs, and centralized audit triggers. It does not add duplicate delete columns to business entities. The current product already uses:

- `deleted_at`: members, member subscriptions, inventory products;
- `deletion_requested_at`: organizations and staff memberships;
- status/archive semantics: plans and branches;
- immutable/refund/reject semantics: payments (payments are deliberately excluded from the recycle bin).

## GitHub configuration

Create GitHub Environments named `development`, `production-backup`, and `production-restore`. Put the same production-scoped values in both production environments. Configure required reviewers on `production-restore` only; putting approval on the scheduled backup environment would block hourly backups.

Add these secrets separately to each environment:

| Secret | Purpose |
| --- | --- |
| `BACKUP_DATABASE_IDENTIFIER` | Must exactly match that database's config row |
| `BACKUP_SUPABASE_DB_URL` | Direct connection or session pooler URL; never transaction mode |
| `BACKUP_R2_ACCOUNT_ID` | Cloudflare account ID |
| `BACKUP_R2_ACCESS_KEY_ID` | Dedicated bucket-scoped key |
| `BACKUP_R2_SECRET_ACCESS_KEY` | Dedicated bucket-scoped secret |
| `BACKUP_R2_BUCKET` | New private backup bucket |
| `BACKUP_R2_ENDPOINT` | `https://<account-id>.r2.cloudflarestorage.com` |

The workflow installs PostgreSQL 17 client tools. Keep the client major version equal to or newer than the Supabase server major version.

Optional Vercel/server-only variables let the admin app dispatch Actions automatically:

```text
BACKUP_GITHUB_TOKEN=<fine-grained token, this repo, Actions write only>
BACKUP_GITHUB_REPOSITORY=<owner/repository>
BACKUP_GITHUB_REF=main
```

Without them, requests remain visibly queued. An operator runs the relevant workflow manually using the queued UUID. No database or R2 secret belongs in Vercel for backup execution.

## Backup workflow

`database-backup.yml` supports hourly scheduling and `workflow_dispatch` for `manual`, `scheduled`, or `pre_migration` runs. It:

1. validates database/environment identity;
2. runs `pg_dump --format=custom --no-owner --no-acl` for `public` and `app`;
3. excludes the recovery/admin control plane;
4. validates the archive with `pg_restore --list`;
5. computes SHA-256 and file size;
6. uploads to private R2 and verifies object size;
7. marks metadata ready/verified;
8. enforces retention and explicit deletion requests;
9. records lightweight count snapshots and anomaly alerts;
10. removes all temporary files in a `finally` block.

Failed dumps/uploads create failed metadata and a critical alert. Secrets are passed through process environment variables, never shell arguments, and command output is sanitized/truncated before storage.

## Manual and pre-migration backups

Use **Create backup** in System → Disaster Recovery. The request is rate-limited in the database and dispatched server-side when GitHub integration is configured.

Before a dangerous migration, either dispatch `database-backup.yml` with `backup_type=pre_migration`, or run this in a trusted worker environment containing the GitHub secrets:

```bash
npm run backup:pre-migration
```

`createPreMigrationBackup()` rejects on failure so a deployment script can stop before the schema migration. Do not add it to every deployment until runtime/cost and failure policy have been agreed.

## Restore workflow and safety

Only a signed-in platform administrator can queue a restore. The database additionally requires an authentication token issued within the last 15 minutes. Production requires the exact phrase `RESTORE PRODUCTION`; development requires `RESTORE DEVELOPMENT`. The backup must be ready, verified, and from the same environment.

The worker performs real stages (there are no fake percentages):

1. Preparing restore
2. Creating safety backup
3. Downloading backup
4. Verifying checksum
5. Restoring database
6. Verifying database
7. Completing
8. Completed

Before every restore it creates and verifies a `pre_restore` backup of the current database. If that backup fails, restore aborts before maintenance mode or `pg_restore`. The worker then enables maintenance, downloads only the stored key for the selected metadata row, recomputes SHA-256, and blocks/marks corrupted on mismatch.

Restore uses `pg_restore --clean --if-exists --exit-on-error --single-transaction --no-owner --no-acl` against application-managed schemas. Afterward it verifies that the core tables discovered in the current schema (`organizations`, `gyms`, `branches`, `members`, `member_subscriptions`, `payments`, `membership_plans`, `staff_memberships`) can be queried and counted, and checks for unvalidated application foreign keys.

On success, maintenance mode is disabled. On any failure after maintenance is enabled, maintenance stays enabled, the safety backup remains, restore history is marked failed, and a critical alert is created. A platform administrator can disable maintenance from System Health only after investigation.

## Tenant-app maintenance guard

This repository is the separate platform-admin deployment and must not edit FitDeskApp without explicit approval. Migration 1017 provides a minimal `get_maintenance_status()` RPC (boolean + user-facing message only). FitDeskApp must call it at its authenticated layout/request boundary, allow the platform-admin recovery application to remain independent, and render:

> MyFitDesk is temporarily undergoing maintenance. Please try again shortly.

Until that small tenant-app integration is deployed, the database records maintenance accurately but cannot replace screens served by the separate tenant deployment. Do not claim maintenance enforcement is complete before this integration is verified.

## Safe development test

1. Apply migration 1017 to development and insert the development config row.
2. Create/configure the private R2 bucket and development GitHub Environment secrets.
3. Dispatch `database-backup.yml` for `development` + `manual`.
4. Confirm the metadata moves `creating → ready`, verification is `verified`, size/checksum are populated, and the object exists under `development/manual/...`.
5. Download through the worker only and run `pg_restore --list`; never make the bucket public.
6. Protect the backup, run retention, and confirm it remains.
7. Request deletion for an unprotected throwaway backup and confirm both object removal and `status=deleted`.

## Development restore rehearsal

Use a disposable/development Supabase project that has the same migrations:

1. Take a manual backup and record known row counts/test marker rows.
2. Make a reversible development-only data change.
3. Sign out/in to ensure recent authentication, select the backup, type `RESTORE DEVELOPMENT`, and queue the restore.
4. Dispatch/approve `database-restore.yml` for development if automatic dispatch is not configured.
5. Watch actual stages in Restore History.
6. Verify a ready `pre_restore` backup exists before the restore stage.
7. Verify marker data/counts, FK validation, maintenance clearing, restore audit row, and no open restore-failure alert.
8. Separately test a copied file with a changed checksum: restore must stop before `pg_restore`, mark the backup corrupted, and create a critical alert.

## Emergency manual recovery

Prefer the normal worker because it preserves safety backup, checksum, history, alerts, and maintenance behavior. If GitHub Actions is unavailable:

1. declare an incident and enable maintenance mode;
2. create a current emergency dump first;
3. retrieve the selected private object using bucket-scoped credentials;
4. compare `sha256sum` with `database_backups.checksum_sha256`;
5. validate using `pg_restore --list`;
6. use the exact `pg_restore` flags from `scripts/disaster-recovery-worker.mjs` against a development clone first;
7. query every core table and validate constraints;
8. document the manual action in `admin_audit_log` and resolve maintenance only after verification.

Do not improvise a full Supabase-infrastructure restore from this application dump. For project-wide recovery involving Auth/Storage/managed schemas, use Supabase Dashboard backup/PITR or Supabase support.

## Never test directly on production

- Never perform a first restore rehearsal in production.
- Never corrupt/replace an R2 object to test checksum alarms in production.
- Never test retention with production prefixes until development object deletion is verified.
- Never use development credentials/identifiers in the production GitHub Environment.
- Never use a transaction-pooler connection for `pg_dump`/`pg_restore`.
- Never expose the R2 bucket or add backup credentials to `NEXT_PUBLIC_*`.
- Never restore Supabase-managed schemas from this logical dump.
- Never disable production maintenance after a failed restore until database integrity is independently checked.
