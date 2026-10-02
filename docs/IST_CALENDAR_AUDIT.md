# Admin IST calendar audit — 2026-10-02

The gym countdown previously divided the time until expiry by 24 hours and
floored the result. A subscription expiring at 14:47 IST therefore lost a day
at 14:47 each day. Several date displays also inherited the server/device
timezone; using the `en-IN` locale alone does not set a timezone.

## Implemented policy

- Admin calendar dates use `Asia/Kolkata` (IST), independent of host or gym timezone.
- Countdown, overdue days, trial day number, and its progress meter compare IST
  calendar dates. The expiry date shows zero days remaining until the stored
  expiry instant, then zero calendar days overdue until the next IST date.
- A page left open refreshes just after midnight IST. Returning to a background
  tab also catches up if the IST date changed.
- Revenue and overview month/quarter/year windows begin at midnight IST,
  including their previous comparison periods.
- Billing/activity date filters use IST day boundaries. Operations lock expiry
  inputs are explicitly labelled IST and converted from IST to UTC for storage.
- Admin timestamps, activity exports, directory exports, download filenames,
  and disaster-recovery date filters use IST calendar dates.
- Daily/monthly backup promotion and duplicate checks use IST. Scheduling can
  still be delayed by GitHub; the first scheduled run after midnight promotes
  the missing tier.

UTC ISO timestamps remain the representation of an instant in the database and
API. Backup object names/keys keep their existing UTC timestamp convention.
Elapsed durations such as request latency, backup age, relative “hours ago”, and
retention windows remain elapsed durations. API telemetry's existing hourly
storage buckets remain intact; their displayed timestamps already use IST.
Pure database `DATE` values are preserved as calendar dates. Gym/branch timezone
metadata remains editable; it no longer determines admin calendar displays.

Stored subscription expiry instants and access rules were not shifted to midnight.
Changing contractual expiry times would require a separate business-rule change.
The separate MyFitDesk web repository was not modified in this admin audit.

## Database delivery

`supabase/migrations/1020_admin_ist_calendar.sql` selects IST for the admin gym
overview/member reads and sets function-specific IST timezones for revenue weeks
and operations alert day calculations. It preserves function OIDs, permissions,
security mode, search paths, existing data, and historical migrations.

Apply **after** the existing `1002_admin_read_functions.sql`,
`1019_admin_gym_overview.sql`, `20260930060142_admin_member_support_view.sql`,
and `20260930170100_gym_operations_reads.sql` prerequisites. The file checks
for missing/unexpected functions and aborts the transaction if found. Its serial
filename does not imply it can run before those historical timestamp migrations.

Use the existing verified pre-migration backup procedure, then run either the
canonical migration or `docs/COPY_PASTE_ADMIN_IST_CALENDAR.sql` once in the target
environment's SQL editor. Run `supabase/verify/1020_admin_ist_calendar_verify.sql`
afterwards. No live database migration was applied during this audit.

## Verification

- `npm run test:ist`: actual app modules tested under UTC, IST, and US host zones;
  arbitrary expiry hours; midnight and month/year rollover; date filters/inputs;
  background-tab catch-up; static guard against host-local date formatting and
  constructors.
- `npm run test:dr`: backup scheduling, IST month rollover, duplicate promotion,
  retention, and existing recovery safeguards.
- `scripts/ist-sql-validation.cjs`: original SQL function bodies loaded in an
  isolated in-memory PostgreSQL runtime with minimal prerequisite tables. The
  migration runs twice, verification SQL passes, weekly buckets agree in three
  session timezones, and non-admin calls are rejected. OIDs, ACLs, security mode,
  and search paths are preserved. This validates the migration and timezone
  behavior; it is not a full production-data integration test.
- TypeScript and ESLint passed. A full production build passed with temporary
  DEV/PROD placeholder environment variables supplied only to that build
  process. The ordinary build is blocked by the pre-existing local `.env.local`
  containing only legacy single-project variables; real DEV/PROD Supabase
  configuration is still required. No environment file was edited and no live
  database request was made for the build.

The optional SQL harness accepts a path to an installed `@electric-sql/pglite`
module as its first argument and never connects to a remote database. For this
audit PGlite 0.3.14 was installed outside the repository in a temporary directory;
application dependencies were not changed.
