# Book Demo implementation and shared CRM contract

Scope: keep `/book-demo` in AdminMyFitdesk and preserve the approved UI. CRM and WhatsApp inbox screens are separate tasks.

Implementation order:
1. Shared lead and activity storage, immutable request history, working hours and holidays, forced RLS and restricted RPCs.
2. Public Server Action: validated and normalized inputs, shared IP/contact rate limits, honeypot, idempotent transactional submit and lead matching.
3. Public availability endpoint and calendar/day loading, retries, stale-response protection and submit-time recheck.
4. Optional visitor/owner emails, configurable marketing/support links, focused validation/database/action checks and UI smoke check.

## Contract for the CRM and WhatsApp sessions

Migration **1021_book_demo_foundation.sql** owns these tables. Reuse them rather than introducing another platform lead store (the tenant application's `leads` table is a different domain):

- `platform_sales_leads`: UUID `id`, `gym`, `contact`, normalized E.164 `phone`, lower-case `email`, `city`, `state`, `branches`, `members`, `source`, `stage`, `owner` (auth user UUID or NULL = platform-admin pool), `demo_status`, `preferred_at` (UTC instant representing an IST appointment), `possible_existing_lead`, timestamps. New website requests use `Website Demo`, `demo_req`, `Awaiting confirmation`.
- `platform_sales_activities`: lead FK, `kind`, `title`, JSON `detail`, optional actor UUID and timestamp. A repeated contact adds a request/activity and flags all matching leads; it does not overwrite the existing lead's contact, owner or stage. If phone/email match different leads, attach to the phone match first and flag both for human review. This is a possible match, never an automatic merge.
- `platform_demo_requests`: one row per submission with the full submitted payload, `requested_date` (IST date), `time_index` (0–17), `requested_at` (UTC), status, `confirmed_at`, lead FK and idempotency UUID. Only `Scheduled` / `Rescheduled` consume capacity. Pending requests do not reserve times.
- `platform_demo_working_hours`: weekday 0–6, first/last slot indexes, per-slot capacity. Seed: Mon–Sat 10:00–18:30 IST, capacity 1; Sunday closed.
- `platform_demo_day_overrides`: IST date, closure flag and optional capacity override; use for holidays.

Public data is limited to date statuses and open slot indexes. No contact, assignee, appointment row or capacity count is exposed. Service RPCs are invoker functions granted only to `service_role`. Admin reads/mutations use authenticated, platform-owner-gated RPCs with a pinned search path and IST timezone:

- `admin_demo_requests(p_limit, p_offset)` returns paginated requests joined to leads (bounded to 100). CRM can add its scope-aware lead query in a later migration.
- `admin_set_demo_status(p_request_id, p_status, p_confirmed_at)` confirms/reschedules/completes/cancels; locks the capacity boundary, updates lead demo state and adds activity + audit atomically. Staff confirmation must use this RPC, not direct table updates. The inbox's lead-create/merge actions should use the same normalized identities and locking protocol as `submit_website_demo`.
- `app.assign_website_demo_owner()` is the single pluggable assignment rule: oldest active platform owner, otherwise NULL pool. Requires the existing platform-settings migration.

The CRM sample's `duplicateOf` needs an adapter: a repeated website request intentionally creates no second lead. Render `possible_existing_lead` as the review flag and inspect the request payload plus activity `matching_lead_ids`; do not manufacture a duplicate row. Lead ids are UUIDs, so replace the sample's numeric id types during CRM wiring. When several requests belong to a lead, its summary prioritizes a confirmed appointment, then an awaiting request, then the most recent finished request.

No direct anon/authenticated table privileges or policies. Do not add client policies as a shortcut. Future sales roles/scopes must be enforced inside each new CRM RPC as well as in the UI.

## Deployment and remaining checks

DEV: `pgedlnxuuelmtpmbkdwm`. Apply 1021 manually in the SQL Editor after the admin prerequisites and tenant rate-limiter migration 0039/0040. PROD: `clbphruocsqsmklmrloq`; explicit approval required. No remote schema or migration history is modified by this implementation.

`BOOK_DEMO_ENVIRONMENT` pins public traffic independently of the admin cookie. Defaults to prod on a Vercel production deployment, dev elsewhere. Configure explicitly for other hosts. `MARKETING_ORIGIN` defaults to `https://www.myfitdesk.app`; `BOOK_DEMO_SUPPORT_EMAIL` retains the handoff's `hello@myfitdesk.com` until the actual mailbox is configured. `BOOK_DEMO_SALES_EMAIL` is optional and has no guessed recipient. SMTP is optional; failure must never undo a saved request. CAPTCHA is deferred per the handoff until spam warrants it. No analytics or third-party trackers are introduced.

The SQL verification file runs in a rolled-back transaction with fixture rows and role switches. Local SQL execution is required before delivery; live post-apply verification as a real admin and a real browser submission remain necessary before production activation.

Local result (2026-10-04): typecheck, targeted ESLint and seven action/validation/environment checks passed. PGlite executed the migration and every new SQL/plpgsql function, including owner/non-admin/public role switches, duplicate phone/email matches, replay safety, capacity, cancellation, holidays, audit and rollback. HTTP smoke check: `/book-demo` returns 200 with two shared dropdowns and no native selects; malformed availability dates return 400, and unavailable DB/limiter returns 503 with generic copy. Preview used process-only dummy credentials because this checkout lacks its required Supabase environment variables; `.env.local` was not changed. Interactive visual/mobile checks were blocked by the browser tool reporting that created tabs do not belong to this chat's session. No full build/regression suite or live submit was run.

Verification commands: `npm run typecheck`, targeted ESLint, `npm run test:book-demo`, and `node scripts/test-book-demo-db.mjs <installed-pglite-module-path>` (or omit the path when PGlite is installed in this repo). The SQL harness imports only the supplied test dependency, never another app's code.

Public IP handling uses Vercel's protected forwarding header per its [request-header documentation](https://vercel.com/docs/headers/request-headers#x-vercel-forwarded-for). An untrusted self-hosted header never selects a new bucket.

Database access follows the Supabase [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) and [function security](https://supabase.com/docs/guides/database/functions) guidance.
