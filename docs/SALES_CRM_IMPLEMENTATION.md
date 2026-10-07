# Sales CRM implementation

Implemented at `/admin/sales`, preserving the handoff UI. The sample store and role/data preview controls have been removed.

## Database setup

**Rollout update (2026-10-04):** the user authorized the WhatsApp dependency scripts in both environments. Migration 1021 was already present; 1022 and 1023 were applied together in one transaction per project after verified pre-migration backups. The corrected `1022_verify.sql` (including required platform-admin fixture emails) passed in a DEV rollback rehearsal and again against the committed DEV functions, exercising the real deployed onboarding helper. PROD received schema/privilege and real-owner read checks; fixture tests were kept in DEV. Remote history was not changed. See [WHATSAPP_INBOX_IMPLEMENTATION.md](WHATSAPP_INBOX_IMPLEMENTATION.md) for the backup run and activation limits. Do not reapply the installed migrations.

Apply **1021_book_demo_foundation.sql**, then **1022_sales_crm.sql** in the DEV SQL Editor. The latter extends `platform_sales_leads` and `platform_sales_activities`; it creates follow-up and assignment records, not another lead store. Historical migration files and remote history are unchanged. 1023 (WhatsApp inbox) depends on these migrations.

Run `supabase/apply/1022_verify.sql` in DEV after applying. It creates temporary fixture accounts/leads, exercises owner/manager/rep/non-sales-admin access under the authenticated database role, and rolls back all rows. Do not run these files on production without explicit approval and the repository's pre-migration backup procedure.

## Behavior

**Pending 1025 update (2026-10-04):** manual lead entry, separately confirmed trial gym creation/linking, and paid-only conversion are implemented locally. See [the implementation and activation checklist](SALES_MANUAL_LEADS_AND_CONFIRMATIONS.md). After 1025, trial creation retains follow-ups; use its verification scripts instead of the historical 1022 trial-move check.

- One `admin_sales_command` transaction per write, including timeline and `app.write_admin_audit`. Server Actions validate input and permissions; SQL independently enforces ownership/team visibility, reassignment permissions and validation. Tables have forced RLS and no authenticated direct access; functions pin their search path and revoke PUBLIC/anon execution.
- Real paginated reads, server search/filtering, loading/errors, retry and Load more. Summaries, attention badge, coverage and analytics aggregate the complete authorized scope. Analytics period and scope selectors are wired. The sidebar and phone menu include Sales with the same SQL attention rule. Reads refresh every minute and after writes.
- Detail reads are independently scoped. Opening a duplicate outside the viewer's scope reveals no matching contact details; an owner can review it, or the salesperson can record why it should remain separate.
- Dynamic IST date values; demo times share `features/demo-requests/slots.ts`. Confirmation, rescheduling and suggestion check working hours, overrides and capacity under the same day lock as public requests. Suggestions do not reserve slots. One current demo per lead.
- Returning public requests create a flagged reviewable lead referencing the existing match, instead of overwriting or hiding requests on a closed lead. The public request UUID remains idempotent. Merge preserves both timelines, follow-ups, assignments and request history; the incoming lead is soft-deleted. Converted leads cannot be merged.
- Follow-up due state is derived from the timestamp. Revisit creates an open follow-up, and completing it reopens a Later lead. Closed/converted leads remain excluded from Needs attention, per the handoff. The follow-up remains visible in its drawer.
- Conversion links a real gym or runs the existing onboarding implementation inside the CRM transaction. Migration 1022 extracts the existing invitation implementation into a private shared helper; the public `admin_create_gym_owner_invitation` wrapper still requires `gyms.manage`, while CRM conversion requires `sales.manage` plus access to the lead. This preserves one invitation system and grants sales staff no general gym-management access. The invitation uses the existing branded email and `/invite/accept` flow. Email failure preserves conversion and instructs the admin to resend. Retry cannot create another gym. Expected plan is sales intent; invitation creates a trial and linking preserves the existing subscription.
- Settings → Admins exposes Sales Manager/Sales Rep roles from the database. The admin drawer adds Sales team management, with the existing production confirmation and audit rules. Give managers and reps the same team name for team visibility.

## Product decisions

Identified gyms are CRM leads; coverage does not claim imported prospects. Analytics is available to all sales roles within their scope. Access follows the current assignment; former owners do not retain lead access. Reminders are in-app follow-ups only; no scheduled owner/salesperson email or WhatsApp sender was added without a recipient decision. Optional private realtime broadcasts are not added; minute refresh and mutation refresh keep reads current.

## Verification and limits

`scripts/test-sales-crm-db.mjs` runs both migrations on local PostgreSQL via PGlite with real fixture rows and authenticated role/JWT contexts. It covers all commands, denied cross-team reads/writes, no direct table access/anonymous RPC execution, earliest follow-up recomputation, close/revisit/reopen validation, merge history, slot conflicts/release, duplicate invite retry, website request idempotency/duplicate review, analytics/coverage and audit. The existing 1012 invitation function is stubbed in this isolated harness; its full deployed integration must be checked in DEV. No remote migration has been applied by this CRM task.

Run with an installed PGlite module:

```powershell
node scripts/test-sales-crm-db.mjs <path-to-pglite/dist/index.js>
node --test scripts/sales-crm.test.mjs
node node_modules/typescript/bin/tsc --noEmit
```

Verified: full-project TypeScript check, lint for CRM and touched shared files, the local SQL harness (including the rollback verification script), and focused IST schedule/month-end/empty-report checks. A parallel WhatsApp edit briefly caused type errors; the final full-project check passed after that work settled.

The local screen check could not render the app because this checkout lacks the required `NEXT_PUBLIC_SUPABASE_URL_DEV`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY_DEV`, `NEXT_PUBLIC_SUPABASE_URL_PROD`, and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY_PROD` configuration. Production, a real authenticated browser, SMTP delivery and a full release regression remain deployment checks. The original layout was preserved; no full build/regression cycle was requested.
