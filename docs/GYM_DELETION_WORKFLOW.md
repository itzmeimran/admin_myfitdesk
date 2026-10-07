# Gym deletion workflow

Implemented in shared admin migration `1027_gym_deletion_lifecycle.sql` and both applications. Not applied or activated by this change.

For standalone DEV/PROD SQL Editor scripts, deployment variable templates and clipboard commands, see [the copy-paste instructions](GYM_DELETION_COPY_PASTE.md). Generate these delivery copies with `node scripts/build-gym-deletion-sql.cjs` after changing the source SQL.

## Product behavior

- Admin: Gyms → row actions → Manage gym deletion, or Gym → Operations → Danger zone. Choose 3–7 days (default 7), supply a reason, type the exact gym name, then confirm “Are you sure?”. Production additionally requires `PRODUCTION`.
- Owner: Settings → Delete gym → Request deletion, confirm with the current password. The default recovery window is 7 days.
- Owner password confirmation uses the account's Auth login identifier, including internal identifiers for phone-enrolled owners, in an isolated verification client. It does not replace the active session. Recovery uses the selected workspace so identities shared across gyms can restore the intended gym.
- Requests immediately isolate the gym's tenant records. Existing gym/staff records needed to identify the user and reach recovery remain readable. Admin inspection remains available. Database writes are rejected for isolated tenant records even from background service clients; shared batch claim functions skip isolated gyms.
- Owners/admins can restore before the deadline. The database rejects late restores through both the new RPC and older direct-update/Recovery paths. Restoring preserves prior suspension and billing dates. Individual staff-account deletion remains separate.
- An active or uncertain AutoPay operation must first be cancelled and reconciled through the existing billing flow. Deletion refuses to erase the provider binding while a mandate may still collect money.
- Every 15 minutes, a scheduler calls the environment-specific worker. A due request becomes `purging`. A database transaction collects the exact gym's rows and follows incoming foreign keys to dependent records. A cross-gym edge, unsupported schema dependency or unresolved FK cycle rolls back the entire database purge.
- Files are removed through Storage/S3 APIs using an exact `{organization UUID}/` prefix, including legacy/mirrored buckets. A preflight refuses folders referenced in another gym's records, as well as shared R2 folders still used in the other environment. Supabase Storage metadata is never deleted with SQL. Retained identities shared with another gym, platform admins or surviving records are preserved. Eligible exclusive identities are deleted with GoTrue, with an auth-table trigger rechecking external references under the deletion lock.
- Completion is recorded only after database, file and eligible-account cleanup succeeds. Failure leaves the gym isolated and retries after a 15-minute lease. Deletion history is at `/admin/gyms/deletions`, including cleanup that continues after the organization row is gone.
- Earlier deletion requests have no automatic deadline and are not enrolled. They remain restorable. Request/restore/claim serialize through row locks; duplicate requests cannot create multiple active jobs.

## Backups and deletion receipts

A minimal UUID/timestamp/state receipt survives final deletion; reasons, request actor and account IDs are erased. These receipts and the lifecycle configuration are excluded from platform backups. The recovery worker reinstalls the current isolation migration before leaving maintenance. Receipts isolate any gym reintroduced from an older backup; scheduled cleanup removes its restored records again.

Platform backups contain multiple gyms. They remain under the existing backup retention policy, rather than destroying unrelated gyms' recovery points. Existing public/CDN assets may remain readable during the recovery window and cached copies can outlive origin deletion. External providers' own historical records and independently retained logs are outside this live database/upload cleanup.

## Activation, separately per environment

1. Obtain a verified pre-migration platform backup. Apply migration 1027 to DEV (`pgedlnxuuelmtpmbkdwm`) first. PROD is `clbphruocsqsmklmrloq`; use explicit project selection. Do not change historical migration history. The script is safe to rerun and defaults to deletion disabled without overwriting an existing configuration.
2. Deploy the admin worker/UI and matching FitDeskApp recovery/queue changes. Admin delivery branch is `main`; FitDeskApp delivery branch is `dev`. Migration is shared; do not allocate another web migration.
3. Configure the admin deployment's **environment-specific** secrets:
   - `GYM_DELETION_CRON_SECRET_DEV` / `GYM_DELETION_CRON_SECRET_PROD`: independently generated secrets of at least 32 characters.
   - `GYM_DELETION_R2_BUCKETS_DEV` / `GYM_DELETION_R2_BUCKETS_PROD`: JSON arrays of `{ "accountId": "...", "bucket": "...", "accessKeyId": "...", "secretAccessKey": "..." }`. Include every asset bucket, including retired/mirrored copies. Supply `[]` only if that environment truly used Supabase Storage exclusively. Never include database backup buckets.
   - `GYM_DELETION_STORAGE_CONFIRMED_DEV` / `GYM_DELETION_STORAGE_CONFIRMED_PROD`: `true` only after verifying the complete bucket inventory and organization-first key layout, including legacy objects. If a deployment uses R2, both inventories must be available. A shared bucket's folder is refused while the same organization UUID exists in the peer database. This prevents DEV clones from erasing PROD assets.
   - Existing environment-specific Supabase service credentials must be configured. Service clients are pinned explicitly; no admin cookie controls cron requests.
4. In that database's Vault, set `gym_deletion_worker_url` to the canonical admin origin plus `/api/cron/gym-deletions?environment=dev` (or `prod`), and `gym_deletion_cron_secret` to the matching deployment secret. Use the direct canonical host so authorization is not lost through redirects. Use the existing `vercel_protection_bypass` secret for protected DEV deployments.
5. Make an authenticated **GET** to the worker URL and check readiness. Run `supabase/apply/1027_verify.sql` and database advisors. Perform the two-gym rehearsal against disposable DEV fixtures, exercising the installed schema and real owner/admin permissions. Verify uploaded files and a shared identity too; do not shorten any real gym's recovery deadline.
6. Run `supabase/apply/1027_activate.sql` only after those checks. It validates Vault entries, installs the 15-minute pg_cron/pg_net dispatch and enables requests. Verify successful HTTP worker responses and cron health before relying on automation. The job processes one gym per request; a backlog drains over successive runs. Serverless plan limits must permit the configured 300-second duration.

To stop new requests and worker claims, set `gym_deletion_config.enabled=false` through an authorized SQL operation. This does not restore gyms or reset deadlines. Do not disable cleanup casually after requests have been accepted.

When adding a tenant table, rerun the isolation installer/verification. Every tenant record must have a UUID organization column or a real FK path to one; unstructured references in third-party payloads or orphaned assets require inventory review. Unknown cross-schema FK dependencies stop cleanup instead of expanding its scope.

## Local verification

- `node scripts/gym-deletion-sql-test.cjs <path-to-PGlite>`: real PostgreSQL execution of the migration twice, owner Settings requests through tenant RLS (7 days), admin request validation (3–7 days), rejection of staff/cross-gym requests, AutoPay guard, restore, expired deadline, direct/indirect RLS and write isolation, shared queue exclusion, lease exclusion, FK closure, cross-gym rollback, unchanged second-gym snapshots, preference/OTP/account protection, retry, old-backup tombstones and scheduler activation/configuration validation.
- `node --test scripts/gym-deletion-worker.test.cjs`: exact folder boundaries, foreign path rejection, database/storage failure handling, finalization order and preservation of shared users.
- Typechecks and touched-file lint in both repositories. These checks do not replace the disposable-gym rehearsal on the installed Supabase schema.
