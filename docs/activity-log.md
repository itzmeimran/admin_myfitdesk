# Gym Activity Log

The Activity tab reads the same seven sources as the existing timeline: mirrored
admin/tenant audit events, remaining tenant audit events, failed WhatsApp messages,
failed webhooks, gateway subscription payments, alerts and failed broadcasts.
Existing mirror exclusions prevent duplicate audit entries. No writer, trigger,
audit record or retention rule changes.

Apply `supabase/migrations/1029_admin_gym_activity_read.sql` after the existing gym
operations and platform settings migrations, alongside the matching admin app.
It also relies on the existing shared tenant actor-role migration. The migration
was prepared and tested locally; it was not applied to a remote database.
`supabase/apply/1029_verify.sql` supplies read-only installation checks.

The new `admin_gym_activity` RPC retains the original timeline RPC for other
consumers. It requires an active platform admin with `gyms.view`, scopes every
source and member/actor lookup to the requested organization, filters the full
dataset before pagination, uses event IDs to break timestamp ties, and returns
the total independently of the page. Member histories group by their recorded
member UUID before top-level pagination; `event_total` still reports the original
event count. Expanded groups use the same filters with `p_member_id` and fetch 25
original events at a time, retaining access to every event. CSV exports continue
to contain individual events. It does not expand existing permissions.
Snapshot record names and actor names can be searched independently. Names/roles
are shown from recorded evidence or available staff records; missing people are
identified as unavailable, without being relabelled System. Gym-app audit records
do not distinguish web from mobile. Webhook failures retain the existing rolling
365-day source window; filters cover the entire dataset exposed by that source.

Secret-shaped fields are redacted recursively in the RPC result before
PostgREST sends it. Photo fields retain presence rather than object paths or
URLs. Change keys are calculated from original snapshots first, so replacing a
photo still reads as a change. The server presentation boundary and technical
details repeat the sanitization. URLs are hidden in summaries, details and CSV.
Unknown fields, IDs and safe technical metadata stay in expandable details.
Missing before/after snapshots are explicitly described, not reconstructed.

The user requested one entry for each member, including Kai Green's four events.
This grouping uses the recorded member UUID, not timestamps or names, so different
members with the same name remain separate. It represents that member's activity
history; it does not claim that all the actions were one confirmed workflow.
Each original event keeps its own title, actor, timestamp and details control.
There is no shared operation/correlation ID in `app.write_audit`,
`app.write_platform_critical_audit` or `app.log_admin_action`. Confirmed-workflow
summaries such as "added with a monthly membership" would still require one
operation ID emitted by all steps. This implementation does not alter logging
to introduce one. A request ID alone is not treated as workflow evidence.

Live members link to the organization's filtered roster (including its deleted
roster for soft-deleted members), where their existing record drawer is available.
Hard-deleted or unresolved records keep snapshot names when available. Gym links
require an existing organization record. Tenant-only records without a valid
admin destination do not receive guessed links. Completed gym purges remove the
gym details route and its tenant audit history under the existing deletion policy;
the UI does not fabricate a completed-deletion event for those gyms.

`npm run test:activity` runs the focused formatter, redaction, API parameter and
rendered disclosure checks. The migration was additionally executed in an
isolated PostgreSQL fixture to verify isolation, permissions, name/actor/category/
date/status filters, stable pagination, empty-page totals, actor attribution,
member grouping across the full dataset and paged access to every original event.

To rerun the SQL fixture without adding application dependencies, install
`@electric-sql/pglite@0.3.14` into a temporary tools directory, set
`ACTIVITY_PGLITE_MODULE` to the absolute file URL of its `dist/index.js`, and run
`npm run test:activity:sql`. The fixture creates an in-memory PostgreSQL database;
it does not read credentials or contact Supabase. Desktop, tablet and mobile
layouts and keyboard expansion were also checked with synthetic events rendered
through the actual Activity components and reusable filters.

Files changed: `src/app/admin/gyms/[id]/activity/page.tsx`, `timeline-feed.tsx`,
`actions.ts`, `loading.tsx`, and `export/route.ts` in that Activity directory;
`src/features/gyms/ops/{queries,timeline-format,types}.ts`,
`src/core/db/database.types.ts`, `src/components/SearchBox.tsx`,
`scripts/activity-log.test.cjs`, `scripts/activity-log-sql.test.mjs`,
`package.json`, `AGENTS.md`, this document, and the 1029 migration/verification SQL.
