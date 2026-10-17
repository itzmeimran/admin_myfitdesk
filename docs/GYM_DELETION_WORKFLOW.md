# Gym deletion workflow

Implemented in shared admin migration `1027_gym_deletion_lifecycle.sql` and both applications. Scheduler upgrade `1028_gym_deletion_due_dispatch.sql` replaces periodic app polling. SQL is not applied or activated by this code change.

For standalone DEV/PROD SQL Editor scripts, deployment variable templates and clipboard commands, see [the copy-paste instructions](GYM_DELETION_COPY_PASTE.md). Generate these delivery copies with `node scripts/build-gym-deletion-sql.cjs` after changing the source SQL.

## Product behavior

- Admin: Gyms → row actions → Manage gym deletion, or Gym → Operations → Danger zone. Choose 3–7 days (default 7), supply a reason, type the exact gym name, then confirm “Are you sure?”. Production additionally requires `PRODUCTION`.
- Owner: Settings → Delete gym → Request deletion, confirm with the current password. The default recovery window is 7 days.
- Owner password confirmation uses the account's Auth login identifier, including internal identifiers for phone-enrolled owners, in an isolated verification client. It does not replace the active session. Recovery uses the selected workspace so identities shared across gyms can restore the intended gym.
- Requests immediately isolate the gym's tenant records. Existing gym/staff records needed to identify the user and reach recovery remain readable. Admin inspection remains available. Database writes are rejected for isolated tenant records even from background service clients; shared batch claim functions skip isolated gyms.
- Owners/admins can restore before the deadline. The database rejects late restores through both the new RPC and older direct-update/Recovery paths. Restoring preserves prior suspension and billing dates. Individual staff-account deletion remains separate.
- An active or uncertain AutoPay operation must first be cancelled and reconciled through the existing billing flow. Deletion refuses to erase the provider binding while a mandate may still collect money.
- Request/restore/claim/finish events arm one timer at the earliest recovery deadline or retry lease; no app call is made while idle or before work is due. An hourly database-only recovery job repairs missed timers after downtime. Pending HTTP responses are checked inside the database without additional app calls. A due request becomes `purging`. A database transaction collects the exact gym's rows and follows incoming foreign keys to dependent records. A cross-gym edge, unsupported schema dependency or unresolved FK cycle rolls back the entire database purge. The existing purge transaction locks tenant tables and can briefly delay writes to other gyms; this scheduler change does not remove those locks.
- Files are removed through Storage/S3 APIs using an exact `{organization UUID}/` prefix, including legacy/mirrored buckets. A preflight refuses folders referenced in another gym's records, as well as shared R2 folders still used in the other environment. Supabase Storage metadata is never deleted with SQL. Retained identities shared with another gym, platform admins or surviving records are preserved. Eligible exclusive identities are deleted with GoTrue, with an auth-table trigger rechecking external references under the deletion lock.
- Completion is recorded only after database, file and eligible-account cleanup succeeds. Failure leaves the gym isolated and arms a retry after a 15-minute lease. HTTP/transport failures use 5, 10, 20, 40 then 60-minute backoff. Only one HTTP request is tracked at a time, and active worker leases prevent concurrent deletion. Deletion history is at `/admin/gyms/deletions`, including cleanup that continues after the organization row is gone.
- Earlier deletion requests have no automatic deadline and are not enrolled. They remain restorable. Request/restore/claim serialize through row locks; duplicate requests cannot create multiple active jobs.

## Admin deletion visibility

Open **Gyms → Gym deletions**. Pending requests shows organizations with `deletion_requested_at`, including earlier requests without a cleanup job. Cleanup history shows all scheduled jobs, including restored gyms and cleanup that continues after the organization row disappears. Database deletions shows historical organization deletion audit records, including deletions before the automatic cleanup lifecycle was installed. Each view has database pagination and an exact record count.

Pending entries show the gym name, code, city, owner, recorded requester, reason and recovery deadline, with links to gym data and deletion controls. Historical audit entries confirm only database deletion, not external file or account cleanup. Completed lifecycle jobs confirm all cleanup stages; their minimal receipts deliberately no longer retain gym names or requester identities. Missing information is labelled instead of inventing a name or linking to a removed gym.

The page shows separate database, upload and login-account evidence, timestamps in IST, worker attempts and the last cleanup error. A historical gym ID is kept separate from a current gym reusing its code, with the current record's creation date and a separate link. An existing record with the exact historical ID is flagged for review instead of presented as currently deleted. Counts are deletion events or cleanup jobs, not a combined total of deleted/current gyms.

**Inspect cleanup now** is a permission-gated, read-only action for recorded database deletions. It checks the exact organization ID, recursively lists that UUID folder in Supabase Storage and the environment's explicitly verified R2 inventory (including retired/mirrored buckets), and checks account IDs recoverable from retained staff/invitation audit events. It shows file counts per bucket, account absence/reference/review counts and an inspection timestamp. Bucket failures, missing inventory and bounded scan limits produce incomplete results, never a successful cleanup claim. This inspection does not delete files/accounts, infer identity from reused contact details, reconstruct missing rosters, or independently scan every tenant database table. Referenced accounts may need retention; unreferenced observations require review of other surviving dependencies before deletion. Backups/CDN caches/provider records are outside the live folder check.

### DEV audit — 17 October 2026

Read-only audit of DEV `pgedlnxuuelmtpmbkdwm`: 0 pending requests, 1 completed automatic job, 7 historical database deletion events. Each historical organization ID is absent. Hunk Fitness's old ID `a4fb7057-7960-4d4e-95dc-3ffa942fbc8e` was deleted on 7 October, 11:11 IST. Current Hunk fitness ID `b7edc0d5-0cda-4e3a-9c0f-56510bb37790` was created on 16 October, 19:39 IST, reuses `HF-1026A`, and has a trial ending 30 October, 19:39 IST. Its trial status is consistent with its own dates.

| Historical gym | Stored file objects found | Recovered account IDs still present |
| --- | ---: | ---: |
| Fitness Zone | 0 | 1 |
| Demo Gym | 0 | 1 |
| Haider fitness | 1 | 1 |
| Mr Fit | 9 | 1 |
| Gold's Gym | 8 | 1 |
| Steel Fitness | 2 | 1 |
| Hunk Fitness | 0 | 1 |

The 20 stored objects include mirrored copies in R2; all three Supabase buckets were empty for these UUID folders. The recovered accounts had no current DEV staff membership or platform-admin reference, but this does not establish that every account is safe to delete or reconstruct the full historical roster. No database, auth or storage records were changed. Historical cleanup needs a separately confirmed operation after dependency review; the current Hunk fitness record is not a cleanup target.

Implementation verified with typecheck, touched-file lint, 17 focused visibility/inspection tests, the live DEV read-only queries above and static previews of the actual card/loading components at desktop and narrow widths. A signed-in, deployed Server Action/navigation check remains for rollout; no deployment or push was performed for this change.

These reads run in a server-only route helper after checking `gyms.view` against the selected environment's authenticated admin session. They use that environment's existing service credentials without expanding tenant RLS or database grants. This visibility change needs no SQL migration and does not change requests, deadlines, activation or cleanup behavior.

## Backups and deletion receipts

A minimal UUID/timestamp/state receipt survives final deletion; reasons, request actor and account IDs are erased. These receipts, lifecycle configuration and private scheduler journal are excluded from platform backups. The recovery worker reinstalls migrations 1027 and 1028 before leaving maintenance. Receipts isolate any gym reintroduced from an older backup; scheduled cleanup removes its restored records again.

Platform backups contain multiple gyms. They remain under the existing backup retention policy, rather than destroying unrelated gyms' recovery points. Existing public/CDN assets may remain readable during the recovery window and cached copies can outlive origin deletion. External providers' own historical records and independently retained logs are outside this live database/upload cleanup.

## Activation, separately per environment

1. Obtain a verified pre-migration platform backup. Apply migrations 1027 and 1028 to DEV (`pgedlnxuuelmtpmbkdwm`) first. If 1027 is already installed, apply only the standalone scheduler upgrade. PROD is `clbphruocsqsmklmrloq`; use explicit project selection. Do not change historical migration history. New installations default to deletion disabled; upgrades preserve configuration and deadlines.
2. Deploy the admin worker/UI and matching FitDeskApp recovery/queue changes. Admin delivery branch is `main`; FitDeskApp delivery branch is `dev`. Migration is shared; do not allocate another web migration.
3. Configure the admin deployment's **environment-specific** secrets:
   - `GYM_DELETION_CRON_SECRET_DEV` / `GYM_DELETION_CRON_SECRET_PROD`: independently generated secrets of at least 32 characters.
   - `GYM_DELETION_R2_BUCKETS_DEV` / `GYM_DELETION_R2_BUCKETS_PROD`: JSON arrays of `{ "accountId": "...", "bucket": "...", "accessKeyId": "...", "secretAccessKey": "..." }`. Include every asset bucket, including retired/mirrored copies. Supply `[]` only if that environment truly used Supabase Storage exclusively. Never include database backup buckets.
   - `GYM_DELETION_STORAGE_CONFIRMED_DEV` / `GYM_DELETION_STORAGE_CONFIRMED_PROD`: `true` only after verifying the complete bucket inventory and organization-first key layout, including legacy objects. If a deployment uses R2, both inventories must be available. A shared bucket's folder is refused while the same organization UUID exists in the peer database. This prevents DEV clones from erasing PROD assets.
   - Existing environment-specific Supabase service credentials must be configured. Service clients are pinned explicitly; no admin cookie controls cron requests.
4. In that database's Vault, set `gym_deletion_worker_url` to the canonical admin origin plus `/api/cron/gym-deletions?environment=dev` (or `prod`), and `gym_deletion_cron_secret` to the matching deployment secret. Use the direct canonical host so authorization is not lost through redirects. Use the existing `vercel_protection_bypass` secret for protected DEV deployments.
5. Make an authenticated **GET** to the worker URL and check readiness. Run `supabase/apply/1027_verify.sql`, `supabase/apply/1028_verify.sql` and database advisors. Perform the two-gym rehearsal against disposable DEV fixtures, exercising the installed schema and real owner/admin permissions. Verify uploaded files and a shared identity too; do not shorten any real gym's recovery deadline.
6. Run the updated `supabase/apply/1027_activate.sql` only after those checks. It validates Vault entries and enables requests. Future requests arm their deadlines; idle activation makes no HTTP call. Verify journal results and cron health before relying on automation. The worker processes one gym per request; a due backlog drains on successive minute-resolution timer runs. The hourly safety check makes no app call without due work. Serverless plan limits must permit the configured 300-second duration.

To stop new requests and worker claims, set `gym_deletion_config.enabled=false` through an authorized SQL operation. This does not restore gyms or reset deadlines. Do not disable cleanup casually after requests have been accepted.

When adding a tenant table, rerun the isolation installer/verification. Every tenant record must have a UUID organization column or a real FK path to one; unstructured references in third-party payloads or orphaned assets require inventory review. Unknown cross-schema FK dependencies stop cleanup instead of expanding its scope.

## Local verification

- `node --test scripts/gym-deletion-visibility.test.cjs`: permission checks before elevated reads, requester/data links, IST deadlines, expired recovery windows, partial cleanup and historical deletion labels.
- `node --test scripts/gym-deletion-inspection.test.cjs`: read-only inspection, exact UUID scoping, paginated folder traversal, missing inventory, recoverable account checks and authorization.
- `node scripts/gym-deletion-sql-test.cjs <path-to-PGlite>`: real PostgreSQL execution of both migrations twice, owner Settings requests through tenant RLS (7 days), admin request validation (3–7 days), rejection of staff/cross-gym requests, AutoPay guard, restore, expired deadline, direct/indirect RLS and write isolation, shared queue exclusion, lease exclusion, FK closure, cross-gym rollback, unchanged second-gym snapshots, preference/OTP/account protection, retry, old-backup tombstones and scheduler activation/configuration validation. Extension APIs are stubbed locally: focused scheduler checks cover idle/future HTTP exclusion, event timers, coalescing, bounded transport backoff, leases, missed responses, timer repair and upgrade idempotence. Live pg_cron execution still needs a DEV rehearsal.
- `node --test scripts/gym-deletion-worker.test.cjs`: exact folder boundaries, foreign path rejection, database/storage failure handling, finalization order and preservation of shared users.
- Typechecks and touched-file lint in both repositories. These checks do not replace the disposable-gym rehearsal on the installed Supabase schema.
