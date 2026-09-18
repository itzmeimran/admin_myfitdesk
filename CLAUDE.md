# AdminMyFitdesk — Project Notes

Platform back-office (admin dashboard) for **MyFitDesk**, a multi-tenant gym-management SaaS. This is a **separate Next.js app and repo** from the tenant-facing product — deployed separately on Vercel, sharing only the Supabase project. Code is copied from the main app where useful; nothing from this repo goes into the main app's repo, and vice versa, without explicit sign-off.

Reference app (read-only source of truth for conventions/schema, do not edit): `C:\Users\user\Documents\my vault\FitDeskApp` (local clone of `myfitdesk`, branch `main`, audited at HEAD `ec83af3`).

---

## Key decisions (confirmed with the product owner)

| # | Decision |
| --- | --- |
| D-A | Admin Panel = the **MyFitDesk platform back-office** (the team operating the SaaS), not a gym-owner-facing feature. |
| D-B | **Completely separate app/repo** (`AdminMyFitdesk`), separate Vercel deployment. Reuse FitDeskApp's design tokens, components, and patterns **by copying**, not by importing across repos. No code mixes into the `myfitdesk` repo without asking first. |
| D-C | Admin authorization = a new **`platform_admins` table** + `app.is_platform_admin()` SECURITY DEFINER predicate driving new RLS policies on the same live Supabase project — not a bare service-role key. |
| D-E | 2026-09-08: Reconfirmed D-B after a task briefing ambiguously said "implement into the existing MyFitDesk application." Resolved: that phrase means *reuse MyFitDesk's tokens/components/conventions*, not *literally build inside the FitDeskApp repo*. This repo stays separate. |
| D-1 (resolved 2026-09-08) | `1001_platform_admins.sql` **applied to the live project** via the Supabase MCP (user explicitly authorized). Verified post-apply: both tables created, RLS forced on both, both `is_platform_admin()` variants exist, `anon` cannot call the RPC / `authenticated` can, no new security regressions beyond the intended one (advisor flags `public.is_platform_admin()` as authenticated-callable — expected, matches this project's existing RPC pattern). `platform_admins` is currently **empty** — nobody can reach `/admin` yet until a row is inserted (service-role only, by design). |
| D-2 (2026-09-09) | **Explicit, scoped exception to D-B**, confirmed with the user for the Dynamic Plans task specifically: both AdminMyFitdesk and FitDeskApp get code changes (buyer-facing display, checkout, offer validation can't be built from one repo alone). Still additive-only in FitDeskApp — see "Milestone: Dynamic Plans" below — not a blanket lifting of D-B for future tasks. |
| D-3 (2026-09-09) | Dynamic Plans is **additive alongside the legacy Packages system, not a replacement** — user's mid-task correction after the initial full-rewrite plan draft. `platform_billing_settings.billing_model` is a global admin-flippable switch (`/admin/settings`); both admin surfaces (`/admin/packages` legacy, `/admin/plans` dynamic) and both buyer-facing code paths in FitDeskApp coexist permanently. |
| D-4 (2026-09-09, Gyms redesign) | Three decisions made explicitly with the product owner before building the Gym Detail page, in a concurrent session to the Dynamic Plans work above: **(a)** reversed the platform-admin PII boundary 1002 established — Members/Staff tabs show real names/emails/phones, not counts-only, via new curated `SECURITY DEFINER` functions (never a blanket RLS policy — see 1009's header). **(b)** Impersonation ("login as gym owner") explicitly **skipped this pass** — it needs new session-minting infrastructure this app doesn't have; not even a disabled placeholder, since there's nothing to be a placeholder in front of. **(c)** "Suspend gym" is a genuinely **new hard-suspend concept** (`organizations.suspended_at`), not a relabeling of Cancel/Restore subscription — it's billing-independent. Its enforcement stops at this app: it flags the org and every admin screen reflects it, but it does **not** make FitDeskApp's own session/RLS layer deny a suspended org's staff from logging in — that's tenant-app follow-up work, out of scope per D-B. |

---

## Completed

- **Full source-first audit of FitDeskApp** — architecture, auth/authz (3 enforcement layers: RLS, `getSessionContext()`, UI helpers), all 42 migrations / full DB schema (tenancy plane + platform-billing plane), feature inventory (members, plans, subscriptions, payments, reports, integrations, notifications, platform billing), design tokens ("Clay & Rust" — see below), and the open items in `AUDIT-BACKLOG.md` (39 defects, several of which an admin surface would remediate — notably **M-12** unsurfaced failed webhooks, **L-3** unbounded telemetry tables).
  - Headline finding: **there is no platform back-office of any kind today.** `platform_packages` has a read policy and no write policy (catalogue changes today = a migration). `organization_subscriptions` has no write policy for any client role (extending/cancelling a tenant today = raw SQL). No `platform_admin`/`super_admin`/`/admin` concept exists anywhere in the codebase.
- **Claude Design reference imported** via the `DesignSync` MCP tool (`get_project` / `list_files` / `get_file`) from project `43a4f435-31a5-4def-a028-d225742ef5e1` ("Scope and section questions", type `PROJECT_TYPE_PROJECT`), file `MyFitDesk Platform Admin.dc.html` (+ `support.js`, which is just the generic `.dc.html` canvas rendering runtime — no app-specific content, safe to ignore).
  - The canvas has **5 sections**: **Overview** (dashboard home), **Gyms** (tenant directory), **Packages** (catalogue), **Revenue** (platform billing), **Settings**.
  - Fully parsed: **Overview** page — sidebar nav, header (search + alerts), loading/empty/error states, "Needs attention today" alert strip, 5 KPI tiles, 12-week revenue trend bar chart, package-mix breakdown with progress bars, "Accounts at risk" table (desktop) / card list (mobile), "Hitting package limits" panel, "New this week" signups list, dark "Billing pipeline" panel.
  - **Gyms / Packages / Revenue / Settings pages, and the underlying mock-data JS (`<script data-dc-script>`) that defines every entity's exact field shape**: extraction delegated to a background agent (writing to `…/scratchpad/design-audit.md`) — **not yet folded into this file**. Check that file / the agent's completion notification before starting implementation of those 4 pages.

- **Full app scaffold built** (2026-09-08): `globals.css` (Clay & Rust tokens + the design's 4 documented admin extensions), root `layout.tsx`, copied/adapted `Sheet`/`Toast`/`SubmitButton`/`AsyncButton`/`ButtonLabel`/`ErrorState` + `error.tsx`/`global-error.tsx`/`not-found.tsx`, plain email+password `/login` (`features/auth/actions.ts`), the fail-closed admin gate (`core/auth/get-platform-admin.ts` + `app/admin/layout.tsx` — calls `supabase.rpc("is_platform_admin")`, denies on any error/non-true result, shows a clear "not set up yet" screen), the shell (`admin-sidebar.tsx` + `admin-chrome.tsx`, wide/narrow split at `md` (768px) matching the design's own `wide`/`narrow` render flag — not the separately-documented 1024px figure, see admin-sidebar.tsx's docblock), and all 5 pages (Overview/Gyms/Packages/Revenue/Settings) on local `features/<domain>/mock-data.ts` modules matching the design's mock arrays. Gyms' status filter + search and Packages' Monthly/Yearly toggle are real client-side state; everything the design itself left unwired (Export CSV, Invite gym owner, pagination, Load more, per-package Edit/Archive/Restore, Download CSV, header search/alerts) renders disabled with `title="Not implemented yet"`.
- **`supabase/migrations/1001_platform_admins.sql` written, NOT applied** — `platform_admins`, `app.is_platform_admin()` + a `public.is_platform_admin()` RPC wrapper (PostgREST only exposes `public`; the real predicate stays in `app` per FitDeskApp's own convention), `admin_audit_log`. Needs explicit go-ahead before running against the live project (D-1).
- `npm install` / `npx tsc --noEmit` / `npx eslint .` / `npm run build` all pass clean.

## Real data wiring (in progress, 2026-09-08)

- **`supabase/migrations/1002_admin_read_functions.sql` applied to the live project.** Draws the boundary: platform-plane tables (`organizations`, `organization_subscriptions`, `platform_payments`, `platform_packages`) get direct admin-gated RLS policies (readable/writable the normal way, through `core/db/server-client.ts`) since that's MyFitDesk's own business data, not customer PII. Tenant-plane operational data (`members`, `branches`, `staff_memberships`) stays exactly as protected as before — admin gets **counts only**, via new `SECURITY DEFINER` functions (`admin_gym_directory`, `admin_package_mix`, `admin_overview_stats`, `admin_gyms_near_cap`, `admin_revenue_trend`) that never return a row of member/staff PII.
  - One real bug caught and fixed before it shipped: `admin_package_mix()`'s original version counted phantom MRR for zero-subscriber tiers (a `LEFT JOIN` CASE read the always-present `platform_packages` side instead of checking whether a subscription actually matched) — caught by hand-verifying the function's output against live data, not by any static check.
  - One advisor finding fixed: `app.derive_subscription_state()` was missing a pinned `search_path` (the one helper function that isn't itself `SECURITY DEFINER` — still deserves the same defense-in-depth as everything else here).
  - Post-fix `get_advisors` is clean: no new findings beyond the expected/intended ones (each `admin_*` RPC being authenticated-callable, same category as a dozen pre-existing FitDeskApp functions).
- **Gyms page fully wired to real data** — `src/features/gyms/queries.ts` (`listGyms()`) reads `admin_gym_directory()` and maps it into the exact same `Gym` shape `mock-data.ts` used, so `gyms-view.tsx` needed zero changes. New shared helpers: `core/money/format.ts`'s `formatMinorWhole()` (whole-rupee display, matching the design's amount strings exactly) and `core/dates/format.ts` (`formatShortDate`, `daysBetween` — this app's own date-string convention, not copied from FitDeskApp since its date formatting is shaped differently). `npx tsc --noEmit` clean.
- **Packages, Revenue, Overview wiring — done and independently re-verified 2026-09-08.** All 5 pages now read real data except Overview's "Billing pipeline" panel (stays mock — `payment_provider_events` has no admin-read policy by design; see `TODO(needs-service-role-or-new-rpc)` in `features/overview/queries.ts`). Writes (New Package submit, Edit/Archive/Restore, Export CSV, Invite gym owner) are still exactly as built before — disabled or toast-only, out of scope for this pass on purpose.
  - New: `src/features/{packages,revenue,overview}/queries.ts`, `src/core/dates/format.ts`.
  - Real gaps left as explicit `TODO(...)` comments rather than papered over: "Renewals due in 7 days" tile has no backing metric yet (`admin_overview_stats` only has trial-specific `trials_ending_7d`); Packages' `featured` tier has no real column (omitted rather than guessed); two narrative sentences the mock had ("One Growth refund on cancellation", "asked about a 4th branch on 2 Sep") were replaced with factual equivalents since they aren't derivable from real data.
  - One extension beyond the original design: `InvoiceStatus` gained a 4th value, `"Pending"` (a real `platform_payments` row can sit at `status='created'`, which the design's Succeeded/Failed/Refunded vocabulary has no state for) — `status-style.ts` got a matching pill tone.
  - **I independently re-ran `tsc --noEmit` / `eslint` / `npm run build` myself after the agent's own report** (all clean) rather than trusting its self-report alone, and spot-read every new/changed file — the `admin_package_mix()` phantom-MRR bug earlier in this file is exactly the kind of thing a "trust the agent" pass would have missed.
  - **Also discovered mid-session and resolved:** a prior background agent had run `git init`/commit/push to a real GitHub remote (`github.com/itzmeimran/admin_myfitdesk`) without being asked — caught by checking `git status`/`git remote -v`, verified no secrets were ever committed (`.env.local` never appears in any commit), flagged to and confirmed-owned by the user. Take-away for future sessions: check `git log`/`git remote -v` right after any agent that might plausibly run `git` commands, don't wait until it surfaces on its own.

## Plan — prioritized, as of 2026-09-08

Superseding the old flat TODO list below (kept in git history if needed). Re-check this against actual state before resuming work in a future session — items get checked off here as they land, not left to rot in a "Completed" narrative log.

**P0 — foundation cleanup** (do these before building more on top)
1. ✅ **Done 2026-09-09.** Regenerated `database.types.ts` via `mcp__supabase__generate_typescript_types` and removed every `supabase.rpc as unknown as (...)` cast — `core/auth/get-platform-admin.ts` and all of `features/{gyms,packages,revenue,overview}/queries.ts` now call `supabase.rpc(...)` directly against the real generated types. Two follow-on findings, both fixed inline: (a) codegen only narrows native Postgres enums, not `text` columns with a CHECK constraint — `platform_payments.status` came back as plain `string` where the old hand-authored types had it as a 4-value literal union, breaking `revenue/queries.ts`'s `STATUS_MAP` lookup; fixed with a narrow `as keyof typeof STATUS_MAP` cast at the one call site, documented why. (b) codegen also doesn't mark nullable function args as nullable — `admin_create_package`/`admin_update_package`'s `p_max_branches/members/staff` (integer, no NOT NULL) typed as plain `number`, so passing this app's `null` = "unlimited" sentinel needed a narrow `as number` cast in `packages/actions.ts`, not a client-wide cast. Verified over the real network with a throwaway service-role script (not just `tsc`/`eslint`/`build`, per the this-binding incident's lesson below) — all 6 admin RPCs reached the live DB through a normal `supabase.rpc(...)` call with no client-side error, and the admin-gating behaved as expected (empty arrays / "Not authorized" for a non-admin service-role caller, never a JS exception).
2. **Known environment limitation, not an app bug, still unresolved:** the Next dev server launched through the Browser preview tool (`preview_start`) has no outbound network access to `https://pgedlnxuuelmtpmbkdwm.supabase.co` at all (`fetch failed`, status 0) — the identical call from a plain Bash-invoked `node` script works fine. So real-data browser QA (real login, real dashboard render) can't happen through that tool; only mock-data visual QA and direct-script/MCP verification are currently possible. Ask the user whether their environment can allowlist a host for that sandbox before assuming this is fixable from inside the app.
2b. **New, urgent: apply and verify `1009_admin_gym_detail.sql`.** Written 2026-09-09 (see "Milestone: Gyms redesign" below) in a session with no Supabase MCP tool and no `.env.local` at all — it has never been applied or run against real data, unlike every other migration in this file. Before trusting the new Gyms list or Gym Detail page in production: apply via MCP with explicit go-ahead (same D-1 process), run `get_advisors` (the RLS-vs-curated-RPC correction made during this session's own self-review should be double-checked live, not just reasoned about), and re-run the same real-`.rpc()`-call verification style the this-binding incident established — static checks alone already burned this project once.

**P1 — write paths** (the actual "Manage" capability this whole panel exists for; currently every mutation is a disabled button or a toast)
3. ✅ **Packages CRUD — done and verified 2026-09-08.** See "Milestone: Packages CRUD" below.
4. ✅ Audit logging on every package write — done as part of the same milestone (built into the RPCs, not bolted on after).
5. ✅ **Subscription management on the Gyms directory — done and verified 2026-09-09.** See "Milestone: Subscription management" below.

**P2 — remaining page completeness**
6. ✅ **Done 2026-09-09.** "Renewals due in 7 days" Overview tile now backed by real data — see "Milestone: Renewals due in 7 days metric" below.
7. ✅ **"Billing pipeline" panel — done and verified 2026-09-09.** See "Milestone: Real numbers everywhere" below.
8. ✅ **Partially done 2026-09-09.** Product owner chose admin roster UI of the 4 candidates — see "Milestone: Admin roster UI" below. Grace-period default, invoice prefix, and webhook endpoints remain undecided and unbuilt. (The Gyms redesign session, running concurrently, separately added a real "Edit gym" form to each gym's own Settings tab at `/admin/gyms/[id]/settings` — a different, gym-scoped settings surface from this platform-wide `/admin/settings` page.)
9. ✅ **Done 2026-09-09**, merging two concurrent sessions' work: real server-side pagination/search/filter/sort for the Gyms list (see "Milestone: Gyms redesign" below — replaces client-side "Load more" entirely) AND Export CSV, ported from its original client-side implementation (see "Milestone: Gyms Export CSV" below) into the new server-paginated page so it exports every gym matching the current filters, not just one page. ~~Invite gym owner remains the one deliberately deferred placeholder~~ — **built 2026-09-18, see "Milestone: Gym Owner Onboarding" below.**
10. ✅ **Overview's period toggle (This month/Quarter/Year) — done and verified 2026-09-09.** See "Milestone: Real numbers everywhere" below.
11. ✅ **Gym Detail page — restructured to a 5-tab layout 2026-09-13**, matching the Claude Design "MyFitDesk Gym Detail" canvas (see "Milestone: Gym Detail redesign" below). Superseded the original 8-tab layout named in this line's earlier text (Overview/Billing/Branches/Staff/Members/Entitlements/Activity/Settings). Still NOT live-verified — see item 2b, unchanged this pass (no Supabase MCP tool or `.env.local` in this session either).

**P3 — polish**
12. Responsive/visual QA pass in an actual browser against the reference design for the now-real-data pages, INCLUDING the new Gym Detail tabs — blocked on item 2 above for anything beyond mock-data screens (already visually verified once, pre-wiring), and additionally blocked on item 2b for the Gym Detail page specifically (its data has never been loaded against a real database at all).
14. New from the 2026-09-13 redesign: three sections the new design canvas calls for have no admin-readable data source anywhere in this schema — a gym's own monthly revenue rollup (from its tenant `payments` table), its membership-plans-sold breakdown with a member-share percentage, and a per-member "membership history"/"payment history" pair inside the member drawer. All three currently render an honest "not available yet" note rather than fabricated numbers (see that milestone). Building any of them needs a new `SECURITY DEFINER` RPC — written, applied, and live-verified in a session that actually has Supabase MCP access, per this project's own hard-won lesson (see the two "Production incident" write-ups below) that a migration is not done until it's been executed against real rows as a real admin.
13. Overview's own `listGyms()` (features/overview/queries.ts) still loads every gym row to derive its risk/signups sections client-side-in-Node — the same "don't load the whole table" concern the Gyms redesign fixed for the Gyms page itself, left untouched here since Overview wasn't in this task's scope. Worth the same treatment if/when Overview needs it.

---

## Milestone: Gym Owner Onboarding (2026-09-18)

Full task brief: enable "Invite gym owner" (previously the one deliberately-deferred disabled
button, see P2 item 9's original text and the Gyms-redesign/Export-CSV milestones' own notes on
why it was skipped — "needs new infra this pass doesn't have: email sending, an invite-token
flow"). Built the whole flow: admin creates a gym + picks trial/subscription/custom access in one
form, an invitation email goes out, the owner verifies their email and sets their own password
(the admin never sees or sets it), and the admin can track/resend/revoke the invitation and later
manage the subscription — all server-authorized, none of it UI-only gating.

**Audit done first, per the task's own instruction, before writing any SQL.** Read FitDeskApp's
existing auth/invite/gym-creation code end to end (background research agent + direct file reads).
Two findings shaped the whole design:
1. `staff_invitations` (FitDeskApp migration `0002`) **already supports `role='owner'`** — an
   existing owner inviting a co-owner was already a first-class case — and its whole accept flow
   (`/auth/confirm?type=invite` → `/invite/accept` → self-insert into `staff_memberships` under
   `staff_memberships_insert_via_invite`) needed **zero changes** to also work for a brand-new
   gym's very first owner, created by a platform admin instead of an existing owner. This is
   reuse, not a parallel system — exactly what the brief asked for ("reuse the existing
   architecture wherever possible instead of creating duplicate systems").
2. `organizations` inserts already get a free 14-day trial (FitDeskApp `0028`'s
   `app.create_default_subscription()` trigger) and a free human-readable `gym_code` (FitDeskApp
   `0066`'s BEFORE INSERT trigger) — so the admin-side RPC only had to *adjust* the trial row to
   match what the admin actually chose, never insert a second one, and never had to invent an ID
   scheme (the task's own "do not expose Supabase UUIDs as the user-facing Gym ID" is already
   solved by FitDeskApp's own `gym_code`, e.g. `GG-0926A`).

**DB (`supabase/migrations/1012_gym_owner_onboarding.sql`, NOT yet applied to any live
project — no Supabase MCP tool or `.env.local` in this session, same constraint several prior
migrations in this file were written under):**
- `staff_invitations` gains six nullable/defaulted columns, additive only:
  `email_verified_at` (the real, persisted middle state of "Invitation Sent → Email Verified →
  Account Active" — set by a new `mark_invitation_viewed()` RPC the **first time** the invitee
  lands on `/invite/accept` with a valid session, called from that page in the **myfitdesk repo**
  — see that repo's own CLAUDE.md entry for the one-line addition this required there),
  `invited_first_name`/`invited_last_name`/`invited_phone` (the admin's own reference snapshot —
  never authoritative; the owner's real name is whatever they type on the accept form, same as any
  other invite), `resend_count`/`last_resent_at`.
- `mark_invitation_viewed(p_invitation_id)` — SECURITY DEFINER, self-scoped by the caller's own
  JWT email (not admin-gated — the caller is the brand-new owner, who has no admin/org grants at
  all yet). Needed because `staff_invitations_accept_self`'s RLS policy only permits a
  pending→accepted transition, not "stay pending but set one more column."
- `admin_create_gym_owner_invitation(...)` — the whole "Invite gym owner" submit in one
  transaction: creates `organizations`/`gyms`/`branches`, adjusts the free trial row to the
  admin's chosen billing mode (`trial` with a custom length / `paid` against a real
  `platform_packages` row, optionally overriding its period / `custom` admin-granted days), inserts
  the `staff_invitations` row (`role='owner'`), and writes two `admin_audit_log` rows
  (`gym.created`, `invitation.sent`) — all inside one `plpgsql` function, so a failure partway
  through (a bad plan id, a duplicate caught mid-flight) leaves nothing behind. Duplicate/existing-
  account checks run **before** any insert and return distinct, admin-legible messages for three
  situations the brief asks to tell apart: already a member of an existing gym, already has a
  pending invitation, or already has a Supabase Auth account with no gym role yet (the last one is
  a real scope boundary, not a bug — same one `admin_grant_platform_admin` already documents:
  `generateLink({type:"invite"})` cannot create a second account for an email that already has one,
  same as the Admin API itself).
- `admin_resend_gym_owner_invitation` / `admin_revoke_gym_owner_invitation` /
  `admin_get_gym_owner_invitation` — resend resets the 7-day expiry and clears
  `email_verified_at` (a resend is a fresh link); revoke soft-stops a pending invitation without
  touching the gym or subscription it created (an admin who wants both suspends the gym
  separately, via the already-built `admin_suspend_organization`); the get function folds
  `status`/`expires_at`/`email_verified_at` into one `effective_status` (`invited`/
  `email_verified`/`expired`/`active`/`revoked`) so the app layer never re-derives that logic.
- `admin_gym_detail` — `CREATE OR REPLACE` (jsonb return, so no `DROP FUNCTION` needed, unlike the
  table-returning RPCs 1010/1011 had to touch) adding exactly one key, `gym_code`, to the
  `organization` object — this is what let the Gym Detail header stop printing
  `gym_{uuid.slice(0,8)}` as its "record id" and show the real business id instead.
- Same convention as every other write RPC in this file: `SECURITY DEFINER`, pinned `search_path`,
  `app.is_platform_admin()` gate first (except `mark_invitation_viewed`, self-scoped instead —
  see above), explicit `revoke execute ... from public, anon, authenticated` then
  `grant ... to authenticated` (both revokes — this project's own recorded trap).

**App (admin_myfitdesk):**
- `src/app/admin/gyms/invite-actions.ts` — outside `src/features/**`, same carve-out as
  FitDeskApp's own `signup/actions.ts`/`dashboard/staff/actions.ts`: needs
  `supabase.auth.admin.generateLink()` and a Storage write, both service-role-only, which the
  eslint boundary rule blocks `features/**` from importing. `inviteGymOwner()` calls the RPC via
  the ordinary RLS-scoped client (same client every other admin write in this app uses), then —
  only once the gym exists — uploads an optional logo to the shared `gym-logos` Storage bucket via
  the service client (a brand-new gym has no `staff_membership` yet for that bucket's own
  org-membership-scoped RLS policy to authorize against) and generates+sends the invite email.
  **A partial-failure path is handled explicitly, not left to crash**: if the email can't be
  generated or sent, the gym and its pending invitation are left exactly as created (a fully
  consistent DB state, nothing orphaned) and the admin sees a plain message pointing at "Resend
  invitation" — never a half-created gym, per the brief's own "safe so we don't end up with
  half-created gyms" requirement. `resendGymOwnerInvitation`/`revokeGymOwnerInvitation` are the
  matching thin wrappers.
- **New minimal email infra** (`src/core/config/email.ts`, `src/core/email/{transporter,errors,
  system-email,templates}.ts`) — this admin app had **zero** email-sending code before this
  (confirmed by research agent: no `nodemailer`, no SMTP env vars, nothing). Copied FitDeskApp's own
  Nodemailer-over-Resend-SMTP pattern (D-B: reuse by copying, not importing across repos) —
  `isEmailConfigured()`/graceful degrade exactly like FitDeskApp's `transporter.ts`. Deliberately
  **not** part of `core/config/server.ts`'s fail-closed schema: an admin panel that refuses to boot
  because nobody configured SMTP yet is a worse failure than one that creates the gym and tells the
  admin to copy a link manually. `MYFITDESK_ORIGIN` (new optional server env var, defaults to
  `https://myfitdesk.vercel.app`) is where the invite link points — this repo has no gym-owner-
  facing screens of its own (D-B), so the link always lands on the tenant app.
- `InviteGymOwnerSheet.tsx` — a `Sheet` (this app's existing bottom-sheet primitive, matching
  "do not unnecessarily redesign the UI") with sectioned fields (gym details + logo, owner
  details, address, billing mode) and a `useActionState` submit, same shape as `packages/actions.ts`'s
  create-package Sheet. Billing mode is a 3-way radio (Free Trial / Paid Subscription / Custom
  access) that conditionally reveals trial-days, plan+period-override, or custom-days fields.
  Replaces the old disabled button on `/admin/gyms` exactly in place.
- `OwnerInvitationCard.tsx` on the Gym Detail header (visible on every tab, same placement as the
  deletion-request banner) — renders only while `effectiveStatus !== "active"`, showing the exact
  Invitation Sent / Email Verified / Invitation Expired / Invitation Revoked progression the brief
  asked for, with Resend (while pending/expired/verified) and Revoke (while pending) actions —
  Revoke behind a `ConfirmDialog`, matching this app's own "dangerous actions need confirmation"
  convention.
- **Ongoing subscription/trial management deliberately reuses what's already built, rather than
  adding new RPCs for it**: `admin_extend_subscription` covers "extend trial" and "extend
  subscription validity" (it operates on `current_period_end` regardless of which state the row is
  in); `admin_change_subscription_package` covers "change plan" and, combined with an Extend, covers
  "activate subscription" (assign a package to a still-trialing gym, then extend to the plan's real
  period); `admin_cancel_subscription`/`admin_restore_subscription` cover "cancel/deactivate" and
  "reactivate"; a `custom` grant at invite time is just `admin_extend_subscription` with no package
  attached. All four already have their own Sheet (`ManageSubscriptionSheet`, built in the
  Subscription-management milestone below) reachable from both the Gyms list and the Gym Detail
  header — this pass added no UI here since the capability, and its audit logging, already exists.
- **Authorization is server-side throughout, not UI-only gating**: every new RPC re-checks
  `app.is_platform_admin()` itself (the same gate every prior write in this app uses), `generateLink`/
  Storage writes only ever happen from a `"use server"` file the browser cannot call directly, and
  the service-role key is never referenced from any Client Component (confirmed: `invite-actions.ts`
  and `system-email.ts` are the only two files that import `createServiceClient`/`nodemailer`,
  neither is `"use client"`).
- `database.types.ts` hand-patched (this file is hand-authored, not generated, per this project's
  own convention): `organizations.gym_code`, and the four new RPCs' `Args`/`Returns`.

**App (myfitdesk) — the one small, explicitly-scoped cross-repo change (same D-2-style exception
this file's Dynamic Plans milestone used, extended here since a gym-owner-facing password-setup
screen structurally cannot live in this admin-only repo per D-B):**
- `invite/accept/page.tsx` — one new line calling `mark_invitation_viewed()` the moment a pending
  invitation is found (best-effort, never blocks the page).
- `invite/accept/actions.ts` / `AcceptInviteForm.tsx` — added a **Confirm password** field (the
  original only had "New password", the brief asks for "Enter password, Confirm password,
  Submit") and a Lucide eye/eye-off show/hide toggle on both password fields (`ShowIcon`/
  `HideIcon`, already aliased in that repo's `core/ui/icons.ts` for an unrelated money-masking
  toggle — reused here for their more usual job, per the task's own explicit ask for "a hide and
  show icon from lucid icons").
- `database.types.ts` hand-patched there too: the six new `staff_invitations` columns and the
  `mark_invitation_viewed` RPC entry.

**Verification, and its honest limit — same recurring constraint as most of this file's own
migrations**: `npx tsc --noEmit`, `npx eslint .`, and `npm run build` all clean in **both** repos
(admin_myfitdesk's own build caught one real bug on the way — see below; myfitdesk's build and its
existing `npm test` suite, 174/174 across six test files, both stayed green after this pass's small
changes there). No Supabase MCP tool and no `.env.local` in this session, so **migration `1012` has
never been applied or run against real data**, and none of the following has been exercised: an
actual invitation email sent and clicked, the owner's password-set flow completing end-to-end, the
new `staff_memberships` row landing with `role='owner'`, or the duplicate/existing-account error
paths against a real database. Applying the migration and running this project's own established
"real disposable admin, real signed-in session, real `.rpc()` calls, then a real invite email
through Resend if configured" verification style is the first thing a session with live access
should do before trusting this in production — per the two "Production incident" write-ups
elsewhere in this file, an unexecuted `SECURITY DEFINER` function is not verified no matter how
carefully it was written, and this migration has nine of them.

**A real bug the build caught, not reasoned about**: the first draft of `owner-invitation-card.tsx`
(a Client Component) imported `OWNER_INVITATION_STATUS_LABEL` from `features/gyms/onboarding.ts`,
which has `import "server-only"` at its top — Turbopack refused the build outright ("'server-only'
cannot be imported from a Client Component module"), rather than silently shipping something
broken. Fixed by splitting the shared type/label-map into `onboarding-types.ts` (no `server-only`
import) and keeping only the actual Supabase query in the server-only file — the same "don't reuse
a server-only module's runtime exports from a Client Component" lesson this file's own P0-pass
history has recorded before, just for a different pair of files.

**Not built, deliberately out of scope for this pass:**
- **Logo processing.** FitDeskApp's own gym-logo/member-avatar pipeline validates-by-decoding
  through Sharp and re-encodes to WebP (see this repo's own R2/avatar-storage notes for why that
  matters — a MIME-type check alone only proves what the client claimed). This admin app has no
  Sharp dependency and none of that pipeline; the logo upload here is a bare size/MIME-type check
  before an unprocessed upload to Storage. Lower risk than a public-facing upload (platform-admin-
  only, not reachable by an arbitrary gym owner), but a real gap against FitDeskApp's own bar —
  worth porting the same Sharp validation if this becomes a heavily-used path.
- **A second confirmation email tier for expired-then-resent links using a different template** —
  resend reuses the exact same `gymOwnerInviteEmail()` template with a fresh link, rather than a
  distinct "your invitation was renewed" wording. Judged not worth a second template for one word
  of difference.
- **Real E2E browser verification** (see above) — this session's environment has no Supabase MCP
  tool, no `.env.local`, and no browser access to click through either app.

---

## Milestone: DEV/PROD environment switching (2026-09-18)

User request: the dashboard was hardcoded to one Supabase project; add a
runtime DEV/PROD switch (Settings toggle, remembered across refresh,
defaulting to DEV, no data mixing, a loading state on switch, PROD made
visually unmistakable, extra confirmation on dangerous PROD actions) without
duplicating the app's logic per environment. Full requirements in the task
brief; not re-copied here.

**Audit done before writing any code:** every Supabase touchpoint in the app
goes through exactly three factory functions — `core/db/server-client.ts`
(RLS, cookie-based session, used by every `features/*/queries.ts` and
`features/*/actions.ts`), `core/db/browser-client.ts` (RLS, unused anywhere
today — no Client Component calls Supabase directly, everything is Server
Components + Server Actions), and `core/db/service-client.ts` (bypasses
RLS, also currently unused — prepared for future wiring per its own
docblock). No caching layer exists beyond Next.js's own (no react-query/SWR/
zustand — checked `package.json`), and no realtime subscriptions exist
anywhere (`grep`'d for `.channel(`/`realtime` — zero hits). That materially
simplified this: centralizing the environment choice in those three
factories means every query/action module needed **zero** changes, and
there was no client-side cache or realtime listener to explicitly tear down
on switch — both were true non-issues, not gaps papered over.

**Architecture — additive, one cookie, three factories:**
- `core/config/environments.ts` — the closed `AdminEnvironment` type
  (`"dev" | "prod"`), default `"dev"`.
- `core/config/public.ts` / `core/config/server.ts` — rewritten from a
  single URL/key/secret to `NEXT_PUBLIC_SUPABASE_URL_DEV`/`_PROD`,
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY_DEV`/`_PROD`,
  `SUPABASE_SECRET_KEY_DEV`/`_PROD` — six required vars total, fail-closed
  at startup like every other env check in this app, keyed by environment
  so a caller can never end up pairing a PROD url with a DEV key. Updated
  `.env.local.example` and `scripts/grant-platform-admin.mjs` (now takes
  `GRANT_ADMIN_ENV=dev|prod`, defaulting to dev — granting a platform admin
  is per-project now, since `platform_admins` lives in each project
  separately).
- `core/env/cookie.ts` + `core/env/active-environment.ts` — the `admin-env`
  cookie's name/max-age and its server-side read (`getActiveAdminEnvironment()`,
  defaults to DEV on a missing/malformed cookie, never defaults to PROD).
- `core/env/actions.ts` — `setAdminEnvironment()`, the only place the
  cookie is written. Deliberately does not itself redirect/revalidate — see
  below for why the switch is a hard reload instead.
- `core/env/context.tsx` — `AdminEnvironmentProvider`/`useAdminEnvironment()`,
  mounted once at the root layout (`src/app/layout.tsx`, now an async
  Server Component) from the same cookie read every server-side Supabase
  client uses, so a Client Component's idea of the active environment can
  never drift from what the server actually fetched with.
- `core/db/{server,service}-client.ts` — both now `async`, both call
  `getActiveAdminEnvironment()` before picking credentials. `core/db/
  browser-client.ts` takes the environment as an explicit argument instead
  (a Client Component has no direct trustworthy cookie read; it gets the
  value from `useAdminEnvironment()`). All three set `cookieOptions.name`
  to `` sb-admin-${environment} `` explicitly (verified against `@supabase/
  ssr`'s source — `cookieOptions.name` maps straight to the auth storage
  key) rather than relying on its own project-ref-derived default, so a DEV
  session and a PROD session are stored under different cookie names and
  can coexist in the same browser. See `core/env/README.md` for the full
  writeup, including why switching to an environment with no session yet
  correctly sends the admin to `/login` again (Supabase Auth sessions are
  project-scoped — this is expected, not a bug to route around).

**Preventing data mixing (task's own emphasis):** the environment switch
(`src/app/admin/settings/environment-switcher.tsx`) does a **hard browser
reload** (`window.location.assign`, with a justified eslint-disable — Next's
own lint rule wants `router.push`/`redirect` here, which this deliberately
isn't) rather than a client-side transition. Chosen over `router.refresh()`
specifically because it's the only way to guarantee zero stale state
(Router Cache, component state, an in-flight request already reading the
old project) survives the switch — correctness over a marginally smoother
transition, for the one requirement the brief phrased as an absolute
("must never get mixed").

**Loading states:** `src/components/Skeleton.tsx` (new shared primitives —
`skeleton-shimmer` in `globals.css` existed but had never been wired to
anything) plus a `loading.tsx` at every real route segment under `/admin`
(root, gyms, gyms/[id] — one file covers all 5 detail tabs since Next.js
reuses the nearest ancestor segment's `loading.tsx` as the Suspense boundary
for a layout's `children`, packages, packages/legacy, revenue, settings).
Covers both ordinary tab navigation and the page-level fetch after an
env-switch reload. **Known, accepted gap**: `admin/layout.tsx` itself does
its own `await`s (the auth gate, chrome counts) directly in the layout body,
which a same-segment `loading.tsx` does not wrap per Next.js's semantics
(`loading.tsx` wraps `page.tsx` and children below, not the sibling
`layout.tsx`) — so the very first paint of `/admin` after a hard reload is
a brief blank moment, not a skeleton. Restructuring that would mean moving
the fail-closed admin gate into a Suspense-wrapped child, which felt like
the wrong risk to take on the security gate for this task; a blank moment
is not stale/wrong data, so it doesn't violate the requirement it's closest
to, just doesn't fully satisfy the letter of "always show a loader."

**Safety for PROD:** `ConfirmDialog` (`src/components/ConfirmDialog.tsx`)
gained `requireTypedConfirmation` — the confirm button stays disabled until
the admin types the given word. Wired with `"PROD"` wherever
`useAdminEnvironment() === "prod"` to: switching *to* PROD itself, suspend
gym, cancel subscription, revoke platform admin, and every archive/retire/
billing-model-flip action on both the legacy Packages screen and the new
one-package Packages screen (`package-view.tsx` — the "Go live & retire the
old tiers" and "Switch back to the old tiers" global toggles, per-package
Archive, per-term Retire). Two of these (archive on the legacy screen,
archive/retire on the new screen) had **no confirmation dialog of any kind
before this milestone** — a pre-existing gap this repo's own notes already
flagged ("no confirmation dialog before Archive... worth reconsidering") —
so this pass closed that for real rather than just gating an already-guarded
action more tightly. Also: a persistent accent-colored border around the
entire viewport (`html[data-admin-env="prod"]` in `globals.css`, present on
every screen including `/login`) and an `EnvironmentPill` in both the
sidebar and mobile header, so PROD is visible everywhere, not only on the
Settings page the toggle itself lives on.

**A genuine bug caught while wiring this, fixed in the same pass:**
`ConfirmDialog`'s first draft reset the typed-confirmation field in a
`useEffect`, which `eslint`'s `react-hooks/set-state-in-effect` correctly
flagged (a same-render `setState` inside an Effect causes a redundant extra
render). Fixed using React's own recommended "adjust state during render"
pattern (compare `open` against a `prevOpen` state value, reset inline when
they differ) instead of an Effect — no behavior change, one fewer render
per open.

**Verification — and its honest limit, same recurring constraint as
several milestones above:** `npx tsc --noEmit`, `npx eslint .`, and
`npm run build` all clean, using a throwaway placeholder `.env.local` with
all 6 new vars (deleted immediately after, never committed — same pattern
this file has used before). `@supabase/ssr`'s `cookieOptions.name` →
`storageKey` mapping was verified by reading the installed package's own
source (`node_modules/@supabase/ssr/dist/main/createServerClient.js`), not
assumed. **This session had no Supabase MCP tool and no real dual-project
credentials, so none of the following has been exercised against real
DEV/PROD projects**: an actual DEV→PROD→PROD-login→PROD→DEV round trip in a
browser, confirming a DEV auth cookie and a PROD auth cookie really do
coexist without either clobbering the other, confirming every existing
`admin_*` RPC call genuinely returns the right project's data after a
switch (expected to work exactly as before per-environment, since nothing
about *how* each RPC is called changed — only *which* project's client
object it's called against — but per this repo's own hard-won lesson
`tsc`/`eslint`/`build` passing is not the same as verified), and confirming
the PROD confirm-dialog gates actually block a mis-click end-to-end in a
browser. **A session with both projects' real credentials should do that
round trip before this is trusted in production** — sign in on DEV, switch
to PROD, confirm it lands on `/login` (no PROD session yet), sign in there,
confirm DEV data never appears while on PROD and vice versa, confirm the
PROD border/pill render, confirm a suspend/cancel/archive/revoke action on
PROD is blocked until "PROD" is typed.

**Not done, deliberately out of scope for this pass:** realtime
subscriptions aren't touched because none exist in this codebase yet (see
the audit above) — `core/db/browser-client.ts` is ready to hand a
same-environment client to a future subscription the moment one is added,
which is the actual requirement ("disconnect from the previous environment
and reconnect to the selected one") translated to a codebase that has
nothing to disconnect today.

---

## Milestone: Gym Detail redesign to match Claude Design canvas (2026-09-13)

User supplied two new Claude Design exports (`MyFitDesk Platform Admin.dc.html`, `MyFitDesk Gym Detail.dc.html`) with an explicit ask: "when i click on gym page it should show like what I have attached." Branch: `claude/gym-page-design-31pn58`.

**Scoping read of the two files, done before writing any code:** the Platform Admin canvas's own spec section says its Gyms/Packages/Revenue screens are explicitly **"Untouched"** in that iteration (it's about a separate System-health section this app wasn't asked to build) — so only the Gym Detail canvas mattered here. That canvas's own `TABS` array is a **5-tab layout** — Overview / Members / Branches & Team / Subscription & Billing / Activity — a real IA change from this app's prior 8 tabs (Overview/Billing/Branches/Staff/Members/Entitlements/Activity/Settings): Branches and Staff merge into one "Branches & Team" tab, and Entitlements disappears (its caps-vs-usage content was always a rephrasing of Overview's own usage bars — see the old `entitlements/page.tsx`'s own docblock). Settings isn't a tab in the new canvas either, but its real capability (`admin_update_organization_profile`) had nowhere else to go, so it stays reachable from the header's "Edit gym" button rather than being deleted.

**Environment constraint this session, same as the original Gym Detail build (2026-09-09) and unlike the Dynamic Plans / roster / gym-detail-RPC-fix sessions in between: no Supabase MCP tool, no `.env.local`.** That materially shaped the approach: rather than write new migrations I couldn't apply or execute (this project's own two "Production incident" write-ups below are proof that an unexecuted `SECURITY DEFINER` function is not verified, static-clean or not), this pass is **pure frontend restructuring over RPCs that already exist and are already live** (`admin_gym_detail`, `admin_gym_branches`, `admin_gym_staff`, `admin_gym_members`, `admin_gym_billing_history`, `admin_gym_audit_log`, `admin_gym_configuration`) plus one new pure-frontend helper (`getMemberExpirySnapshot` in `features/gyms/members.ts`, three `limit:1` calls to the existing `admin_gym_members()` bucketed by `expiry_state` — no new RPC, just three cheap reads of one that already exists).

**Where the design calls for data this schema genuinely has no admin read for**, this pass makes the same call the old Entitlements tab made rather than fabricating: an honest, visible "not available yet" note naming exactly what's missing, never invented numbers. That's three sections total: the gym's own monthly revenue rollup (would need an admin read of the tenant `payments` table — doesn't exist), its membership-plans-sold list with a member-share percentage (would need an admin read of `membership_plans` — doesn't exist), and the member drawer's "Membership history"/"Payment history" pair (would need a per-member admin RPC — doesn't exist). Also honestly scoped: Members' "Deleted" roster tab (`admin_gym_members()` only ever returns live rows), Branches & Team's "Pending invitations" section (no invitation table anywhere in this schema), and the Activity tab's "Gym's own record changes" feed (this schema's tenant `audit_log` tables are owner-read-only per this file's own "Hard schema facts", no admin coverage). All six are real UI sections present and visually matching the design, not omitted — they just say what's missing instead of showing something invented. **P2 item 14 above tracks building the three that need a new RPC, for a session with real Supabase access.**

**What did ship as real, wired-up UI, all from existing data:**
- **Header** — restyled to the design's square-initials mark + status pill + one-line location/enrolled-since/record-id meta row, plus a deletion-request banner (from the already-fetched `gym.deletionRequestedAt` — no new query). Actions: "Extend access" and "Manage subscription" as the two design-matching primaries (both open the same `ManageSubscriptionSheet`, whose Extend section is already first — no duplicate write path), with Suspend/Reactivate/Edit gym kept as a smaller secondary row since the design canvas is a single-state mockup that doesn't depict every real admin capability, not a spec to prune them from.
- **Overview** — usage-vs-cap cards (existing `UsageBar`, restyled into the design's card grid with a "Near cap" banner at ≥90%), an activity-snapshot tile row (Total/Active/Expiring-7d/Expired member counts, via the new `getMemberExpirySnapshot` helper), a real Gym Profile grid (every field already on `GymDetail` — contact/address/hours/timezone/currency/grace period/record id), Integrations cards (WhatsApp/payment gateway — real connection status + last error from `getGymConfiguration()`, extra fields the design shows but this RPC doesn't carry marked "Not tracked" rather than guessed), and Reminder settings (3 of the design's 5 rows are real from `getGymConfiguration()`'s notification prefs; "Last reminder run"/"Failures" have no tracking table and say so).
- **Members** — added the roster toggle (`?roster=`), a per-row contact reveal/hide toggle (`member-contact.tsx`, pure client-side masking of data already fetched unmasked — no new fetch), and a member-detail drawer (`member-drawer.tsx`, `Sheet`-based) showing every real field plus the two honest history-section notes above. Existing real search/filter/sort/pagination over `admin_gym_members()` untouched.
- **Branches & Team** (new, replaces `/branches` + `/staff`) — a branch card grid (unpaginated, per this schema's own "usually one branch, rarely more than a handful" fact), a real Owner card (`gym.owner`, already fetched), the existing Staff table ported in as "Team roster" with its full real search/filter/sort/pagination intact, and the honest Pending-invitations note. New role-pill tones (Owner/Staff/Trainer) added to `core/ui/status-style.ts` to match the design's own role color-coding rather than reusing an unrelated status tone.
- **Subscription & Billing** — added the design's dark "Lifetime paid to MyFitDesk" panel (computed from `gym.lifetimePaidMinor` and the billing-history `total_count`, both already fetched — no new query) and an "Admin actions" three-card row (`billing-actions.tsx`) that all open the same real `ManageSubscriptionSheet`. Existing invoice table/filters/pagination untouched.
- **Activity** — added the design's Admin-feed/Gym-feed toggle (`?feed=`); the Admin feed is the existing real `admin_gym_audit_log()` table restyled as the design's feed cards (search/filter/pagination intact); the Gym feed is the honest note above.
- Deleted the now-fully-redundant `entitlements/`, `branches/`, `staff/` route folders (their real content is either in Overview's usage bars already, or ported into the new `team/` route) rather than leaving unlinked dead routes behind.

**Verification this pass:** `npx tsc --noEmit`, `npx eslint .`, and `npm run build` (with a throwaway placeholder `.env.local`, deleted immediately after — never committed, same pattern this file has used before) all clean. **No live-network verification was possible** (no MCP tool, no real `.env.local`) — every RPC touched here was already live-verified in an earlier session (see "Milestone: Gyms redesign" and the two "Production incident" write-ups below); this pass added zero new RPCs, so there was nothing new to execute against the database. The one new query (`getMemberExpirySnapshot`) is three calls to an RPC (`admin_gym_members`) already proven live — still worth a real run once a session with DB access is available, per this project's "a migration/RPC isn't verified until it's executed" rule, even though the risk here is materially lower than a new function.

**Not done this pass:** actual browser QA against a running dev server with real data — same P0 item 2 limitation this file has carried since 2026-09-08 (no outbound network to Supabase from this session's sandbox), compounded by having no `.env.local` at all this time.

---

## Milestone: One package, three terms — Packages/Plans collapsed into one screen (2026-09-13)

Triggered by the product owner hitting two problems at once on the live site: **"New package" failed with `Invalid input: expected string, received null`**, and **two nav entries (Packages, Plans) they couldn't tell apart**. Their stated model, from their own market analysis: *one* package, no tiers, sold monthly / quarterly / annually, with a bigger discount the longer the term — and an admin surface that doesn't ask them to manage anything more complicated than that.

**No migration.** Everything needed already existed and was live-verified in the Dynamic Plans milestone below: `plans`, `plan_features`, `plan_offers`, `plan_effective_price()`, and the `admin_*` RPCs. This pass is entirely app-side — a deliberate choice given the environment constraint below, and the right one anyway: the schema's generality is what lets a term be repriced without a deployment, it just shouldn't be pointed at the operator.

**The form bug — fixed by construction, root cause not conclusively pinned.** `formData.get()` returns `null` (not `undefined`) for a field the browser didn't submit, and zod 4's `.optional().default("")` only substitutes on `undefined` — so a `null` falls through to the string check and reports that opaque message instead of the field's own. Confirmed by running the real schema against `null` in each position: `code`/`name`/`description`/`price`/`maxBranches`/`maxMembers`/`maxStaff` all produce that exact string, so the message alone doesn't identify the field. Every field the create form renders *is* named and present in the DOM, which is why this couldn't be narrowed further without a browser against the live DB (unavailable this session). Two structural fixes rather than a guess:
- New `src/core/forms/form-values.ts` (`text()`/`optionalText()`) — every Server Action in `features/packages` and `features/plans` now reads fields through it, so an absent field becomes `""` and the schema's own required-message is what the admin sees. The whole class is gone regardless of which field it was.
- `PackageSheet` in the legacy view is now keyed on `editing?.raw.id ?? "new"`. The strongest remaining hypothesis was `useActionState` staying bound to the previous target's action/field shape across a create↔edit switch (an edit's hidden `id` absent from a create submission is exactly a `null` in a `z.string().uuid()`); a remount makes that impossible and also clears a stale error from a previous submit.

**The two-nav-entries problem.** Collapsed to one. `/admin/packages` is now the single package screen; the Starter/Growth/Pro tier catalogue moved intact to `/admin/packages/legacy` (not in the nav, still reachable, still the thing gym owners see while `billing_model = 'legacy'`); `/admin/plans` redirects and its 1,211-line view is deleted. Mobile bottom nav back to `grid-cols-5`.

**The new screen** (`src/app/admin/packages/package-view.tsx` + `src/features/plans/{terms,queries,actions}.ts`):
- **Pricing is one form with three inputs**: monthly price, quarterly discount %, annual discount %. A term's list price is *derived* (monthly × 3, × 12) rather than typed, so the ladder can't end up inconsistent; the discount is a `plan_offers` percent row. A live preview under the inputs shows exactly what a gym owner will see (list struck through, price charged, per-month equivalent) before anything is saved. One submit writes all three prices and both discounts.
- `syncDiscount()` keeps **at most one enabled percent offer per term, with no date window**, deleting any other offer on that term (disable-then-delete — the RPC refuses to delete an enabled offer). Necessary, not tidying: `plan_effective_price()` silently picks the largest active discount when several exist, so a stray would mean the screen showing one number and buyers being charged another.
- **The legacy/dynamic switch moved out of Settings onto this page's banner**, next to the package it governs, and `setBillingModel` was deleted from `features/settings/actions.ts`. Two screens offering the same switch is how an operator ends up unsure which is authoritative — the same complaint that motivated this whole task.
- Also on the screen: package name/description + the three capacity limits (one Sheet, written plan-wide via `admin_set_plan_caps`), a plain add/remove feature list (labelled display-only, since it is), per-term "offered to new gyms" toggles, and an "Other billing terms" card that surfaces any cycle whose `duration_days` isn't 30/90/365 (left over from the old general screen) with a Retire button — visible rather than silently dropped.
- First run shows a single setup form that creates the plan, its caps and all three terms in one submit. Those are separate RPC calls with no transaction across them, so a partial failure leaves a partial package on purpose: the screen renders whatever exists and `savePricing` fills in any missing term, so re-submitting finishes the job.

**One real bug caught in passing:** `features/packages/queries.ts`'s `listPackages()` had no `.is("plan_id", null)` filter, so a dynamic term labelled "Monthly"/"Yearly" would appear on the legacy tier screen and be editable by `admin_update_package`, which knows nothing about plans. Same leak FitDeskApp's `listActivePackages()` was already guarded against (see the Dynamic Plans milestone) — fixed here.

**Verification — and its honest limit.** `tsc --noEmit`, `eslint .`, `npm run build` all clean (build used a throwaway placeholder `.env.local`, deleted immediately, never committed). The zod null behaviour was confirmed by actually executing the schema, not reasoned about. **But this session had no Supabase MCP tool and no `.env.local`, so none of the new write paths has ever been executed against the real database** — the same constraint the 1009 session had, and per this repo's own two production incidents (the `this`-binding bug; 1009's six RPCs that raised on every call), static-clean means nothing about runtime. The mitigating difference is that this pass adds **no new SQL**: every RPC it calls was executed against live data during the Dynamic Plans milestone, and `tsc` checks each argument object against the generated `Args` types. What is genuinely unverified is the app-side orchestration (argument values, the multi-call setup and pricing sequences, `syncDiscount`'s delete path). **A session with real DB access should run the same disposable-admin `supabase-js` script this project uses before trusting this in production**: create a package, save pricing with and without discounts, clear a discount back to 0, toggle a term, flip `billing_model` both ways.

**Follow-up verification — done 2026-09-17, real DB access.** Prompted by the user reporting "I am not able to add subscriptions as an admin" in production (a support-handoff summary from a separate remote session diagnosed this as likely the same bug this milestone already fixed, pending live confirmation — see that handoff's own caveat that it had no DB access either). First checked live data directly: `platform_packages` had **zero** rows with a non-null `plan_id` — confirming no dynamic package had ever been successfully created in production, consistent with the user's report and predating this milestone's fix. Then ran the disposable-admin `supabase-js` script this note asked for, exercising the exact RPC sequence `setUpPackage`/`savePricing`/`syncDiscount`/`setTermOffered`/`setPlanStatus`/`setBillingModel` make, as a real `authenticated` session (not service-role): create plan → set caps (pre-cycles, correctly a no-op) → create all 4 term cycles → **the exact 3-level embed query `listPlans()` renders (`plans → platform_packages → plan_offers`)**, confirmed to resolve correctly and return the created plan with its 4 cycles → `admin_package_mix()` → reprice a cycle → create a 15% offer, confirmed `plan_effective_price()` computes the exact expected minor-unit amount → update the offer → clear it back to 0 via the disable-then-delete path → toggle a term's purchasable flag → archive + restore the whole package → flip `billing_model` both directions (restored to the live `legacy` value afterward) → confirmed a non-admin authenticated caller is correctly refused on `admin_create_plan`. All 13 checks passed against live production data. Fully self-cleaning (service-role deletes of the disposable plan/cycles/offers/admin row/audit rows plus the disposable auth user), though the first cleanup pass left 2 disposable `auth.users` rows behind: the script's audit-log cleanup only deleted rows filtered by `detail->>plan_id`, but several of this flow's own audit actions (`plan_billing_cycle.update`, `plan_offer.*`, `billing_settings.update`) key `detail` on `cycle_id`/`offer_id`/no id at all, so those rows survived and `admin_audit_log.admin_id`'s FK blocked `auth.admin.deleteUser()` with "Database error deleting user" — caught by checking `auth.users` directly afterward rather than trusting the script's own "zero residue" log line, fixed by deleting the remaining `admin_audit_log` rows by `admin_id` directly, confirmed zero residue on a second pass. `platform_billing_settings.billing_model` confirmed back at its pre-test value throughout. `get_advisors` (security) re-checked: no new findings, same expected authenticated-callable category as every other `admin_*` RPC. **This closes the gap the paragraph above flagged** — the data layer and RPC orchestration for the one-package screen are now proven correct against real production data, not just reasoned about. Not checked this session: whether the live Vercel deployment is actually serving the commit containing this milestone's fix (no Vercel MCP/connector available) — `git log` confirms the fix is on `origin/main` as of this session; the user should hard-refresh `/admin/packages` and retry "New package" to confirm the deployed build matches.

**The likely actual explanation for the user still seeing "can't add a package" — a real orphaned row, not a code bug.** Live query found exactly one `plans` row: `code: "starter", name: "Premium"`, `created_at` 2026-09-13 01:11:59 (the same day as this milestone), zero `platform_packages` children (`updated_at` 2026-09-15 13:15:00, ~1.7 minutes before `platform_billing_settings.updated_at` 13:16:45 — consistent with someone hitting Settings/the go-live banner right after). This is a plan that got created (`admin_create_plan` succeeded) but never got its billing cycles (the step(s) after it failed or were abandoned) — almost certainly a leftover from the user's own pre-fix attempt. Its consequence: `src/app/admin/packages/page.tsx:38`'s `activeFirst = packages.find(p => p.status === "active") ?? packages[0]` means **visiting `/admin/packages` with no `?pkg=` lands the admin on this broken "Premium" card by default**, showing an empty "Not priced yet" pricing form — not the "New package" setup form, even though a `+ New package` tile is still there to click. An admin who doesn't notice the tile and just types a price into what looks like the main form is actually on the right recovery path (`savePricing` on an existing zero-cycle plan creates the missing cycles — confirmed by a second disposable-admin script, replaying `savePricing`'s exact null-caps behavior for a zero-cycle plan: created a plan with no caps call and no cycles, then created all 4 term rows through `admin_create_plan_billing_cycle` with `p_max_branches/members/staff: null`, exactly as `savePricing` would send since `capSource` resolves to `null` with zero existing cycles — all 4 succeeded, cycles came back with the expected null ("no limit") caps, cleaned up after), but if they instead expected a blank "Create package" form and didn't find one, that mismatch — not a crash — is the likely remaining source of "I still can't add a package." **Left as-is, not touched**: fixing "Premium" (either completing it via Save pricing + Edit caps, or archiving/deleting it and starting over via "+ New package") is a real catalogue/business decision, not something to guess and write silently — flagged for the user to resolve directly in the UI now that the recovery path is confirmed to work.

---

## Milestone: Dynamic Plans, Pricing, Features & Offers (2026-09-09)

Full audit + redesign of the plan/pricing/feature/offer system, spanning **both** AdminMyFitdesk and FitDeskApp, per the user's explicit brief. Landed as a completely **additive, dual-system** design after the user's mid-task correction ("the model of subscription as of now should also be available, as an admin I should be able to freely choose between the subscription models") — not the rip-and-replace the initial plan draft proposed. See `C:\Users\user\.claude\plans\mighty-mixing-truffle.md` for the full approved plan.

**Audit findings** (both repos, full detail in the conversation, condensed here):
- Caps (`max_branches/members/staff`) were **already** fully dynamic and correctly enforced (`FitDeskApp/features/billing/limits.ts` + `plan_resource_count`) — no hardcoded-limit gap existed despite the brief's concern. Confirmed and left untouched.
- Features (`platform_packages.features text[]`) were **marketing-only, identical across all 3 legacy tiers on purpose** (FitDeskApp migration 0031's own comment) — zero enforcement anywhere, and zero admin CRUD (a hardcoded `FEATURE_CHIPS` array in `features/packages/mock-data.ts` rendered read-only in the create/edit Sheet, disconnected from the DB column entirely — `admin_create_package`/`admin_update_package` always called with `p_features: []`).
- No offers/discounts concept existed in either repo. `billing_period` was CHECK-constrained to exactly `'monthly'|'yearly'` — no room for a third cycle. `PackagePicker.tsx` grouped tiers by parsing a `_monthly`/`_yearly` suffix off `code`, hard-keyed to 2 periods.
- Confirmed with the user: features stay marketing/display only (no new entitlement-gating logic — the caps model already does that job correctly).

**Architecture — additive, not a replacement:**
- `platform_packages` gains a nullable `plan_id` (→ `plans.id`) and `is_purchasable`. **`plan_id IS NULL` = legacy row** — all 6 existing Starter/Growth/Pro rows keep that value forever; `features/packages/*` and `admin_create_package`/`admin_update_package`/`admin_set_package_status` are **completely untouched**, still the admin surface for those rows. `plan_id IS NOT NULL` = one billing cycle of a plan built through the new system.
- New tables: `plans` (parent), `plan_features` (CRUD'd marketing list, replaces the `features text[]` column for new plans), `plan_offers` (per-cycle discount, `percent`|`fixed`), `platform_billing_settings` (one-row singleton — the global `legacy`|`dynamic` switch, defaults to `legacy`).
- New shared SQL function `plan_effective_price(package_id, at)` — the **only** place a discount is ever computed for a real charge (clamps a fixed discount to `price_minor - 1` so a charge can never reach zero; largest-discount-wins tie-break if an admin somehow double-books two active offers on one cycle).
- `admin_package_mix()`'s MRR normalization was fixed in the same migration: it string-matched `billing_period = 'yearly'` to divide by 12, which would have silently mis-costed a "Quarterly" dynamic cycle. Now `duration_days`-based (`price_minor * 30.0 / duration_days`), a ~1.4% intentional shift for existing yearly rows.
- All new admin RPCs (`admin_create_plan`, `admin_*_plan_feature` ×5, `admin_*_plan_billing_cycle` ×5, `admin_*_plan_offer` ×4, `admin_set_billing_model`, `admin_set_plan_caps`) follow the established 1001–1005 convention exactly: `security definer`, pinned `search_path`, `app.is_platform_admin()` gate first, table write + `admin_audit_log` insert in one transaction, explicit `revoke`-then-`grant`. `supabase/migrations/1008_plans_schema_and_rpcs.sql` — originally authored as `1006_...` and renumbered to `1008` after a same-day collision with another concurrent session's `1006_admin_renewals_due_metric.sql`/`1007_admin_roster_rpcs.sql` (caught by that session, not this one — see its cross-session message; verified afterward via `mcp__supabase__list_migrations` that the live database was never actually at risk, since Supabase's real version key is a timestamp, not the label passed to `apply_migration`).

**Design (AdminMyFitdesk):** new `/admin/plans` nav entry alongside the unchanged `/admin/packages`, mobile bottom-nav widened `grid-cols-5` → `grid-cols-6` to fit it. One `Sheet` per plan (basic info) containing three inline sub-lists — Features / Billing cycles / Offers-per-cycle — each add/edit opening a new, small, centered `src/components/Dialog.tsx` (net-new primitive alongside `Sheet.tsx`, same Clay & Rust tokens) rather than nesting another Sheet. Reorder is move-up/move-down buttons, not drag-and-drop (same functional outcome, no new dependency). Delete requires an explicit inline confirm step for both features and offers (offers additionally refuse deletion at the RPC layer while `is_enabled = true` — disable first, delete second).

**Feature management:** `plan_features` rows, full CRUD via `src/features/plans/{queries,actions}.ts` → `admin_create_plan_feature`/`admin_update_plan_feature`/`admin_delete_plan_feature`/`admin_set_plan_feature_enabled`/`admin_reorder_plan_features`. Changes are visible to buyers on the next request (FitDeskApp's `listActivePlans()` reads `plan_features` live, no caching layer in front of it).

**Pricing & offers:** a billing cycle's price is fully admin-editable (`admin_update_plan_billing_cycle`) with zero code deployment. An offer is `percent` or `fixed`, optional `starts_at`/`expires_at`, `is_enabled` — the payable amount is **always** recomputed server-side via `plan_effective_price()`, both for display (FitDeskApp's `listActivePlans()`) and for the real charge (`createPlanOrder`); the browser only ever sends a cycle id, never a price.

**FitDeskApp changes (additive, legacy path byte-for-byte untouched):** `listActivePackages()`/`PackagePicker.tsx`/`createPackageOrder`/`settlePlatformPayment`/`resolveBillingAccess`/`limits.ts`/`plan_resource_count` — all unmodified, except one necessary one-line fix: `listActivePackages()` gained `.is("plan_id", null)` (without it, a dynamic cycle would silently leak into the legacy buyer picker regardless of the mode switch). New, parallel: `getBillingModel()`, `listActivePlans()`, `getRenewalPackage()`, `PlanPicker.tsx`, `PlanCheckoutButton.tsx` (reuses `verifyPackagePayment` as-is — that step only ever compares Razorpay's captured amount against the already-fixed `platform_payments.amount_minor`, nothing legacy-specific to duplicate), `createPlanOrder` (new action, computes the charge via `plan_effective_price` instead of reading `price_minor` directly). `dashboard/billing/page.tsx` and `onboarding/subscription/page.tsx` each read `getBillingModel()` once and branch between `<PackagePicker>`/`<PlanPicker>` for the "browse and newly subscribe" grid. **Renewal continuity, explicit requirement**: the buyer's own current subscription is looked up directly by `package_id` (works identically for a legacy or dynamic row) and always renders its own renew card, independent of the global mode — a legacy subscriber never loses "Renew" just because an admin flips the switch to dynamic, and vice versa.

**Testing:**
- `tsc --noEmit` / `eslint` / `npm run build` clean in both repos.
- `get_advisors` (security) post-migration: only the expected new `authenticated`-callable flags on every new `admin_*`/`plan_effective_price` function, same category as every prior migration.
- Confirmed via direct query: all 6 legacy `platform_packages` rows completely untouched by the migration (`plan_id IS NULL` on all 6, no other column changed).
- **Real-network verification** (the this-binding incident's lesson: static checks can't catch a runtime-only bug) — a disposable admin auth user, signed in for real through the publishable key (not a spoofed JWT claim in raw SQL), ran the full flow through actual `supabase-js` `.rpc()` calls: create plan → feature → billing cycle → offer → `plan_effective_price` (confirmed ₹499 × 15% off = exact expected minor-unit amount) → flip `admin_set_billing_model` both directions → confirmed a **non-admin** authenticated caller is correctly refused (`"Not authorized"`) on the same RPC. Fully self-cleaning; zero residue confirmed.
- `billing_model` left at its default (`legacy`) after verification — the dynamic system is fully built and live-verified but not yet the default buyers see; flipping it is a one-click admin action on `/admin/settings` whenever the user is ready.
- **Not done**: no browser-based QA of the buyer-facing FitDeskApp pages against live data — this session's sandbox has no outbound network to Supabase (documented limitation, P0 #2 above) and starting a second dev server for a different project wasn't attempted given the real-network RPC verification already covers the data-layer correctness the browser check would have added. AdminMyFitdesk's own `/login` screen was confirmed rendering cleanly post-change (no console/build errors) as a lighter regression check.

---

## Known issue, diagnosed not fixed: /admin session-expiry race (2026-09-09)

**Symptom (live Vercel logs):** a request logs several `AuthApiError: Invalid Refresh Token: Refresh Token Not Found` warnings immediately followed by `Error: Failed to load the gym directory: permission denied for function admin_gym_directory`.

**Root cause:** not a grants bug — live grants on `admin_gym_directory` are correct (`authenticated`: yes, `anon`/`public`: no, verified directly against the DB). `app/admin/layout.tsx`'s `resolvePlatformAdmin()` correctly `redirect("/login")`s on an invalid session, but `app/admin/gyms/page.tsx` runs its own independent `createClient()` + `admin_gym_directory()` RPC call rather than depending on the layout's result. Next.js renders nested Server Components concurrently, so with an expired/invalid refresh token both fire at once: the layout's redirect eventually wins, but the page's own RPC call goes out first under the now-unauthenticated (effectively `anon`) session and Postgres correctly denies it — surfacing as an unconditional throw in `getGymsDirectory()` before the redirect lands. Same class of gap in every other `admin/*/page.tsx` that calls `createClient()` independently of the layout (packages, revenue, overview), not gyms-specific.

**Status:** diagnosed 2026-09-09, user opted not to fix yet (just wanted the cause). If this recurs or gets prioritized, the fix is to make RPC error handling in `features/*/queries.ts` detect an auth-failure-shaped Postgres error (`42501`/`insufficient_privilege` alongside a missing/invalid session) and `redirect("/login")` instead of throwing to the error boundary — across all admin query files, not just gyms, since the race is structural to the layout/page split.

---

## Production incident: /admin/gyms 400s on every load (2026-09-10, found and fixed same day)

**Symptom:** the live deployment's `/admin/gyms` threw and never rendered; DevTools showed the document request failing plus `login?_rsc=` fetches (the layout's redirect racing the page — the separate structural gap already documented above). The real cause was upstream of that race.

**Root cause: six of the nine read RPCs added by `1009_admin_gym_detail.sql` raised on *every* call.** `create function` only parses a plpgsql body's syntax — name resolution and the `RETURNS TABLE` row-type check both happen on first *execution*, so a migration that applies cleanly can still ship functions that fail 100% of the time. Two defect families:

- **42702 "column reference `id` is ambiguous"** — `admin_gym_branches` / `_staff` / `_members` / `_billing_history` / `_audit_log` all guard with `select 1 from organizations where id = p_organization_id`, and each also declares an `id` output column in `RETURNS TABLE`. Postgres can't tell the OUT parameter from `organizations.id`. Fixed by qualifying it (`organizations.id`).
- **42804 "structure of query does not match function result type"** — three separate column/type mismatches: `admin_gyms_list.lifetime_paid_minor` declared `bigint` but fed `sum(bigint)` (which is `numeric`); `admin_gym_branches.currency` declared `text` but `branches.currency` is `character(3)`; `admin_gym_members.subscription_end_date` declared `timestamptz` but `member_subscriptions.end_date` is a `date`. All fixed with explicit casts, so the published signatures (and the generated TS types the app compiles against) stay unchanged.

**Fixes applied to the live project:** `supabase/migrations/1010_fix_gym_detail_rpcs.sql` (the ambiguity fix ×5 + the `sum()::bigint` fix) and `1011_fix_gym_column_types.sql` (the two remaining cast fixes — invisible until 1010 let execution get past the guard). Both are `create or replace` with bodies otherwise copied verbatim from 1009; no signature, grant, or app-code change, so **no redeploy was needed** — the live site was fixed the moment the migrations applied.

**Lesson, stronger than the 2026-09-08 one above:** `apply_migration` returning success proves *nothing* about whether a plpgsql function works. Neither does `tsc`/`eslint`/`build`. **Every new `SECURITY DEFINER` RPC must be executed at least once, against rows, before the milestone is called done** — and executed *as an admin*, since the `Not authorized` gate raises before any of these defects could surface. Two of the three 42804s only appeared *after* the 42702 fix, so re-run the whole matrix after each fix rather than assuming one pass is enough.

**Verification:** all 9 read RPCs plus the 3 write RPCs exercised under a real `authenticated` session — first in SQL (impersonating the live admin's `sub` claim, in a rolled-back transaction, across default/sorted/filtered/searched argument combinations), then over the real network through `supabase-js` with a disposable admin account, calling each RPC with the *exact* argument objects `src/features/gyms/*.ts` sends (including the `undefined`s supabase-js drops from the JSON body, which is what PostgREST overload resolution actually sees). 12/12 green, zero residue after cleanup. `get_advisors` (security) shows no new finding categories.

**Still not fixed (unchanged):** the layout/page session-expiry race documented directly above — it made this failure look like an auth problem in the logs, but it is a separate structural gap.

## Production incident: every RPC call was broken (2026-09-08, found and fixed same day)

**Symptom:** deployed to Vercel (`admin.myfitdesk.app`), env vars set correctly, user signed in as the real platform admin, `/admin` crashed with the generic Next.js error boundary ("Something went wrong").

**Root cause:** every RPC call in the app used the pattern `const rpc = supabase.rpc as unknown as (...); await rpc(...)` — extracting `.rpc` into a standalone variable **detaches it from `this`**. Called that way, supabase-js's own `rpc()` implementation throws `TypeError: Cannot read properties of undefined (reading 'rest')` at runtime, because it internally reads `this.rest`. This is a pure runtime hazard: the `as unknown as` cast is type-safe nonsense that hides it completely from `tsc`, and `eslint`/`next build` have no way to catch a `this`-binding bug either. **Every "independently re-verified" build/typecheck/lint pass earlier in this file was genuinely clean and genuinely insufficient** — none of those tools can catch this class of bug.

**How it was actually found:** the user hit the live Vercel deployment, got the crash, and I asked them to paste the Vercel Runtime Logs error. That's the only way this was caught — not by any check run in this repo. **Lesson for future sessions: a "verified" real-data feature that has never been exercised through an actual authenticated `.rpc()` call over the network is not verified, no matter how many static checks pass.** The earlier `execute_sql`-based RPC verification (used throughout the Packages CRUD milestone and the read-wiring milestone) checked the SQL/RLS/business-logic correctness of each function — genuinely useful — but never once went through the actual `supabase-js` client the app uses, so it could not have caught this.

**Fix:** cast `supabase` itself to a narrow extended type, keep `supabase.rpc(...)` as a normal method call (preserves `this`). Applied to all 5 affected files: `core/auth/get-platform-admin.ts`, `features/{gyms,packages,overview}/queries.ts`, `features/packages/actions.ts` (8 call sites total).

**Verification this time was real**: wrote a throwaway script (`node --env-file=.env.local -e "..."`, run via Bash, not the sandboxed preview tool) that (1) reproduced the exact same error with the old pattern using the real signed-in admin session, confirming the diagnosis, then (2) confirmed the fixed pattern returns correct data for `is_platform_admin`, `admin_gym_directory` (4 rows), `admin_package_mix` (6 rows), and `admin_overview_stats` (correct jsonb shape) — all against the live database, all as the real `ikik790@gmail.com` admin account. Then `tsc`/`eslint`/`build` clean on top of that, not instead of it.

---

## Milestone: Gyms redesign — list + full Gym Detail page (2026-09-09)

Full redesign of Platform Admin → Gyms per a detailed task brief: real server-side search/filter/sort/pagination on the list, plus a brand-new tabbed Gym Detail page (`/admin/gyms/[id]/{,billing,branches,staff,members,entitlements,activity,settings}`). See D-2 above for the three explicit product-owner decisions this needed before writing any SQL.

**Update 2026-09-10: `1009` has since been applied — and six of its nine read RPCs raised on every single call, breaking `/admin/gyms` in production until `1010`/`1011` fixed them. See "Production incident: /admin/gyms 400s on every load" above. The warning in the next paragraph was exactly right, and the specific defects (ambiguous `id`, three `RETURNS TABLE` type mismatches) are all things only an actual execution could have found.**

**Environment constraint this session:** no Supabase MCP tool and no `.env.local` were available at all — a first for this project. Every prior migration in this file was written *and applied and live-verified* in the same session (see the this-binding incident above for how seriously that verification was taken). This one could only be written and reviewed locally; **`1009_admin_gym_detail.sql` is NOT applied to the live project and has never been run against real data.** `tsc`/`eslint`/`next build` are all clean (build required a throwaway placeholder `.env.local`, deleted immediately after — never committed), but per this project's own hard-won lesson, static-clean is not the same as verified. Applying this migration and re-running the same kind of real-`.rpc()`-call verification the this-binding fix used is the first thing a session with real DB access should do before trusting this in production.

- **DB (`supabase/migrations/1009_admin_gym_detail.sql`, NOT applied):**
  - `organizations` gains `suspended_at`/`suspended_by`/`suspension_reason` (the new hard-suspend concept, D-2c).
  - `admin_gyms_summary()` (status-breakdown tiles) and `admin_gyms_list(search, status, package_id, billing_period, min_branches, sort_col, sort_dir, limit, offset)` (the list table itself — dynamic but allowlisted `ORDER BY` via `format(%I, ...)`, `count(*) over()` for the filtered total) replace the old "fetch all rows, filter client-side" approach entirely.
  - `admin_gym_detail()` (header + Overview), `admin_gym_branches()`, `admin_gym_staff()`, `admin_gym_members()`, `admin_gym_billing_history()`, `admin_gym_audit_log()`, `admin_gym_configuration()` — one paginated/filtered/sorted function per Detail tab, same dynamic-allowlisted-sort pattern.
  - `admin_suspend_organization()` / `admin_reactivate_organization()` / `admin_update_organization_profile()` — three new write RPCs, same "table write + audit_log row in one transaction" convention as every prior write in this app.
  - **Security correction made during self-review, before this was ever proposed for real use:** the first draft of this migration added blanket admin-`SELECT` RLS policies on `branches`/`members`/`staff_memberships`/`member_subscriptions`/`membership_plans` and on the three integration-status tables, reasoning by analogy to 1002's platform-plane policies. That was wrong and was caught and removed before finishing: every one of those tables is now read *exclusively* through a curated `SECURITY DEFINER` function (which already bypasses RLS for what it queries), so the blanket policies added zero capability the app needed while opening a real gap — any admin session could otherwise call `.from("members").select("*")` directly over PostgREST and get every raw column (`avatar_path`, `deleted_at`, etc.), bypassing the exact curation those functions exist to provide. Fixed by deleting the policies and adding one more narrow function, `admin_gym_configuration()`, for the Settings tab's status reads instead. No live advisor run was possible to confirm this is the only such issue (no DB access this session) — worth an explicit `get_advisors` pass once applied.
  - New indexes (`members`/`branches`/`staff_memberships`/`platform_payments` by `organization_id`, `member_subscriptions` by `member_id, end_date`) so the per-row correlated-subquery counts in `admin_gyms_list`/`admin_gym_detail` (same pattern `admin_gym_directory` already used) hold up at the 10,000+-gym scale the task brief asked for.
- **App:** `src/app/admin/gyms/page.tsx` rebuilt as a Server Component reading `?q=&status/filter=&packageId=&billing=&minBranches=&sort=&dir=&page=&pageSize=` — every control (`SearchBox`, `FilterSelect`, `SortLink`, `Pagination`, all new shared components in `src/components/`) is a plain URL navigation, so state survives reload/back-button/shared links. `gym-row-actions.tsx`'s "Manage" button is now a dropdown (View gym / Manage subscription / View members / Suspend·Reactivate) instead of directly opening the subscription sheet — the old sheet logic moved to `src/features/gyms/ManageSubscriptionSheet.tsx` so the list row and the new Detail header share one implementation instead of two. New `src/app/admin/gyms/[id]/` tree: `layout.tsx` (header + quick actions + tab nav, 404s on a bad id), and one `page.tsx` per tab, each doing its own real search/filter/sort/pagination against its own RPC — never the whole dataset in the browser.
- **Entitlements tab — an honest scope call, not a fabrication:** the brief asked for a per-plan "Plan Allows vs Gym Access" feature matrix with tenant overrides. The schema doesn't support that: `platform_packages.features` exists but has never been populated by any package write (every create/update call sends `[]` — see `features/packages/actions.ts`), and there is no tenant-override table anywhere. Rather than inventing a fake matrix, this tab shows the real fixed baseline (`FEATURE_CHIPS`, "included in every plan") plus the real per-plan differentiator (capacity caps, reusing the same `UsageBar` as Overview) and states plainly that no override mechanism exists — see the page's own docblock.
- **Not done this pass, deliberately:** branch-level "inspect details" is a focused Sheet over the same row data rather than a third level of nested routes (a branch has no sub-entity to justify one); "last login" is shown as "Not tracked" everywhere rather than fabricated (nothing in this schema tracks it); Invite gym owner remains the pre-existing disabled placeholder (out of this task's scope). Overview's own "load the whole gym table to compute risk rows" pattern (`features/overview/queries.ts`'s `listGyms()`) was left untouched — it's a separate, smaller-scale page this task didn't ask to redesign, flagged here as a known follow-on if Overview ever needs the same treatment.
- **Post-merge reconciliation (same day):** this branch was written concurrently with the Dynamic Plans session below, which widened `platform_packages.billing_period` from a `'monthly'|'yearly'` CHECK to an arbitrary admin-defined label. Every place this branch had hardcoded that 2-value ternary (`ManageSubscriptionSheet.tsx`, the Gym Detail header/Overview/Billing tabs, `detail.ts`'s types) was updated to the same fix the Dynamic Plans session applied in `queries.ts`'s `formatPeriod` — capitalize whatever label is actually on the row, via a new shared `core/text/billing-period.ts` — instead of silently mislabeling a dynamic "Quarterly" cycle as "Monthly". Also: the migration in this branch was originally numbered `1006_admin_gym_detail.sql` and renumbered to `1009` after discovering main had already taken `1006`–`1008` (renewals metric, admin roster, dynamic plans) — same numbering-collision situation the Dynamic Plans session hit and resolved the same way (see that migration's own note in "Milestone: Dynamic Plans" below). This branch's Export CSV placeholder button was also replaced with a real port of "Milestone: Gyms Export CSV" below, adapted for server-side pagination — see that milestone for the original implementation and its own verification notes; the port re-runs `admin_gyms_list()` with the current filters and a high limit (`exportGymsCsv` in `features/gyms/actions.ts`) instead of reading already-loaded client rows, since this page no longer loads the whole table into the browser.

---

## Milestone: Gyms Export CSV (2026-09-09)

P2 #9. Of Gyms' 4 inert placeholders (Export CSV, Invite gym owner, pagination, Load more), asked the product owner which to build; they chose Export CSV only. Invite gym owner needs new infra this pass doesn't have (email sending, an invite-token flow linking to `complete_gym_signup` or a new flow); pagination/Load more have nothing real to page through yet (4 gyms on the live project) — both stay deferred, not built.

- **Pure client-side, no new RPC or migration**: `src/core/csv.ts` (`downloadCsv(filename, headers, rows)` — RFC 4180 field quoting, Blob + object URL + synthetic `<a download>` click) and `gyms-view.tsx`'s Export CSV button now calls it with exactly the rows the table currently shows — i.e. it respects the active status filter and search box, never a silent "export everything" behind a "export what you see" label.
- **Not verified in an actual browser**, and for a different reason than the two prior real-data milestones: this feature needed a real signed-in session to reach `/admin/gyms` at all, so a disposable admin account was created (same throwaway-user pattern as every RPC verification this session) specifically to sign in through this session's Browser pane at `localhost:3000` (the other session's server — this session's own `preview_start` still can't get a port, per the ongoing conflict). Sign-in failed with "That email or password doesn't match an account" even after confirming via direct SQL that the account existed with the right email, a confirmed email, and a set password — strongly suggesting that dev server instance is pointed at a different Supabase project/branch than this session's `.env.local`/MCP connection, not a bug in this change. Did not investigate further since it's another session's environment; disposable accounts were deleted immediately after (confirmed via `auth.users` query, zero residue).
- Confidence here rests on: `tsc`/`eslint`/`build` clean, and the implementation being a well-understood, low-risk pattern (map known-good display strings already rendered in the table into CSV rows, trigger a standard browser download) rather than anything touching the database or auth.

---

## Milestone: Admin roster UI (2026-09-09)

P2 #8 (Settings page). The design's own placeholder copy named 4 candidate features (grace-period default, invoice prefix, webhook endpoints, admin accounts); asked the product owner which to build, and they chose the admin roster only — the other three stay a static gap, not built, not decided.

- **DB**: `supabase/migrations/1007_admin_roster_rpcs.sql` — three new `SECURITY DEFINER` RPCs, no blanket write policy added to `platform_admins` (it still has none, by 1001's original design; same "narrow audited RPC, not a blanket policy" choice 1003 made for `platform_packages`).
  - `admin_list_platform_admins()` — the roster, joined back to `auth.users` for `granted_by_email`, with an `is_self` flag so the UI can disable self-revoke.
  - `admin_grant_platform_admin(p_email)` — upserts on `user_id`, so granting and reactivating a revoked admin are the same call. **Real scope boundary, not a bug**: only works for an email that already has a Supabase Auth account — creating a brand-new one needs GoTrue's Admin API (service-role only), which a plain Postgres function can't reach. A genuinely new admin still needs `scripts/grant-platform-admin.mjs`; the UI covers everything after that account exists.
  - `admin_revoke_platform_admin(p_user_id)` — soft-revoke only (matches the table's no-hard-delete design). **Refuses self-revoke** — there's no recovery flow on this app (no signup, no password-reset UI), so a self-revoke could strand the caller or, if they're the only admin, the whole product.
- **App**: `src/features/settings/{queries,actions}.ts`, `src/app/admin/settings/{page,settings-view}.tsx` replace the old static placeholder — a grant-by-email form plus a roster table (email, Active/Revoked pill, granted date, granted-by, Revoke/Reactivate). One new icon alias, `RevokeIcon` (`LuUserX`), added to `core/ui/icons.ts`; one new pill tone, `Revoked`, added to `core/ui/status-style.ts` (same muted tone as `Cancelled`).
- **Verified end-to-end against live data** with a disposable-actor + disposable-target pair (not just a service-role smoke test — signed in as the actor with the publishable key, same as every prior milestone): rejected a grant for a nonexistent email with the intended message, granted the target, confirmed the roster lists it correctly (`is_self` true only for the actor, `granted_by_email` correct), rejected a self-revoke attempt, revoked the target, rejected a double-revoke, reactivated via the same grant RPC, and confirmed all 4 resulting `admin_audit_log` rows (`admin.grant` ×2, `admin.revoke` ×1) landed correctly — all against the real production `ikik790@gmail.com` admin's own roster row (present, undisturbed, read correctly in the listing). Zero residue after cleanup, confirmed by a direct count query on both `platform_admins` and `admin_audit_log`.
- `get_advisors` (security) re-checked post-migration: clean — only the 3 expected new `authenticated`-callable flags, same category as every other `admin_*` RPC.
- `tsc --noEmit` / `eslint .` / `npm run build` all clean.
- **Not verified in an actual browser**, same as the Renewals due in 7 days milestone directly below: another session already had `next dev` running on port 3000 both times this session tried `preview_start`, and the sandbox can't reach Supabase anyway (P0 #2, unresolved). Real-RPC verification above is the substitute.

---

## Milestone: Renewals due in 7 days metric (2026-09-09)

The last remaining known-fake tile (P2 #6) — Overview's "Renewals due in 7 days" had shown a flagged placeholder ("—" / "Not tracked yet") since the Real numbers everywhere milestone, because `admin_overview_stats` only had `trials_ending_7d` (trial-specific).

- **DB**: `supabase/migrations/1006_admin_renewals_due_metric.sql` — `admin_overview_stats` gains one new jsonb key, `renewals_due_7d`: count of subscriptions whose derived state is `active`/`grace` and whose `current_period_end` falls within the next 7 days. `CREATE OR REPLACE` was sufficient (jsonb return type unchanged, unlike 1004's `admin_gym_directory` column addition which needed a `DROP FUNCTION` first).
- **App**: `src/features/overview/queries.ts` — `OverviewStats` type gained the field, `buildTiles()` now renders the real count instead of the `TODO(missing-metric)` placeholder it had carried since the previous milestone.
- **Verified against live data twice**: (1) a direct ground-truth query confirmed all 4 live subscriptions have `current_period_end` far in the future, so the correct answer today is 0; (2) a disposable-admin script (same pattern as every prior milestone — create a throwaway auth user, grant `platform_admins`, sign in with the publishable key, call `.rpc("admin_overview_stats", ...)` for real, then delete everything) confirmed `renewals_due_7d` is present in the real RPC response and equals 0, matching the ground truth. Zero residue after cleanup, confirmed by a direct count query.
- `get_advisors` (security) re-checked post-migration: clean, no new findings beyond the same pre-existing `admin_overview_stats` authenticated-callable flag.
- `tsc --noEmit` / `eslint .` / `npm run build` all clean.
- **Not verified in an actual browser**: the preview sandbox's own dev server can't reach Supabase (P0 #2, still unresolved) and, separately this session, another session already had `next dev` running on port 3000, so this session's `preview_start` attempt exited immediately (Next.js's single-instance lock) rather than reaching the network limitation itself. Real-RPC verification above is the substitute, per this project's own established practice.

---

## Milestone: Real numbers everywhere (2026-09-09)

User audit, triggered by a screenshot of the live Gyms page: "128 enrolled · 214 branches · 41,382 members" — every one of those numbers was hardcoded from the design mock, not the database (real gym count on the live project is 4). Directive: "whatever statics and numbers we are showing in the application should be real and that data should be coming from database." Went through every `TODO(real-data)` marker still in the codebase rather than just the one screenshotted line.

- **Gyms header + footer counts** — `getGymsDirectory()` (new, `src/features/gyms/queries.ts`) derives `enrolledCount`/`branchCount`/`memberCount` straight from the same `admin_gym_directory()` rows the table already renders (one RPC call, not a second query) — no new migration needed, this data already existed. Verified against an independent ground-truth count (direct `organizations`/`branches`/`members` queries): 4/6/70, exact match.
- **Nav badges** — the Gyms sidebar/bottom-nav badge (`nav-items.ts` had a static `badge: "18"`) and the header alerts bell (`admin-chrome.tsx` had a hardcoded `5` with its own comment admitting "hardcoded to match the design mock exactly") are both real now. New `getAdminChromeCounts()` reuses `admin_overview_stats()` with a zero-width period window (only `total_gyms`/`in_grace_count`/`read_only_count` are read, and neither depends on the period bounds) — no new RPC. Alerts badge = grace + read-only subscriptions, matching the same signal Overview's own attention band already uses; hidden entirely at 0 rather than always showing a number, since there's no alerts dropdown behind it yet to explain what it means.
- **Overview period toggle (This month/Quarter/Year)** — previously local `useState` that relabeled the button while every number silently stayed on "This month" data (a real bug, not just a missing feature: picking Quarter looked like it worked). Converted to a `?period=` query param (same Server Component re-fetch pattern as Gyms' `?filter=`) so switching periods is a real navigation with real different date bounds — `admin_overview_stats()` already accepted arbitrary bounds, so this was `periodRange()` (month/quarter/year date math) plus wiring, no new RPC. Caught one adjacent bug while doing this: `signupsCaption` (the "New this week" section) was reusing the period-scoped `new_signups_current` figure, which would have said "12 in Q3 2026" over a list that's always a fixed last-7-days window — fixed by computing the true 7-day count independently of the period toggle.
- **Billing pipeline panel** — the one section still fully mock (`HEALTH` array). `payment_provider_events` (Razorpay webhook inbox) has zero RLS policies confirmed live (service-role-only by design), so this needed `supabase/migrations/1005_admin_billing_pipeline.sql` — one new RPC, `admin_billing_pipeline()` (webhook-ok / signature-failure counts, last 24h). The other 2 of 4 rows ("orders stuck as created", "refunds this month") needed no new RPC — `platform_payments` already has an admin-select policy (1002), same table `revenue/queries.ts`'s `getRevenueTiles()` already reads, so `fetchMonthlyPaymentHealth()` just recomputes that logic locally (deliberately calendar-month always, regardless of the period toggle above it, matching the panel's own literal "this month" label).
- **Verified twice, for different things**: a service-role smoke test (this-binding + arg-name check, same as every prior verification this session) followed by a real disposable-admin session doing genuinely independent cross-checks against live production data — not just "does it error", but "is the number right": gym/branch/member sums matched a from-scratch ground-truth count exactly (4/6/70), `total_gyms` came back identical across zero-width/quarter/year period bounds (confirming it's correctly period-independent), and the billing pipeline RPC returned the right shape. Both scripts self-cleaned (disposable admin user + `platform_admins` row deleted after); confirmed zero residue. `get_advisors` clean (only the expected new authenticated-callable flag for `admin_billing_pipeline`). `tsc`/`eslint`/`build` clean throughout.
- **Not done in this pass**: "Renewals due in 7 days" (Overview KPI tile, P2 #6) stays an honest placeholder ("—" / "Not tracked yet") rather than a fabricated number — it's the one remaining gap, tracked separately since it needs a new jsonb key on `admin_overview_stats`, not just wiring.

---

## Milestone: Subscription management (2026-09-09)

The second real write path, and the first on `organization_subscriptions` (previously read-only, no client-write policy of any kind — see 1002's comment). Same design choice as Packages CRUD: 4 narrow `SECURITY DEFINER` RPCs (`admin_extend_subscription`, `admin_change_subscription_package`, `admin_cancel_subscription`, `admin_restore_subscription`) in `supabase/migrations/1004_admin_subscription_write_rpcs.sql`, each doing the table write and the `admin_audit_log` entry in one transaction, never a blanket write policy.

- **Extend** pushes `current_period_end` out by N days from `GREATEST(current_period_end, now())`, not from the raw stored date — so a gym 9 days overdue with a 7-day extension lands 7 days from *today*, not still 2 days overdue.
- **Change package** reassigns `package_id` only — deliberately does not touch `current_period_end` or prorate (this app has no billing engine to compute a fair mid-cycle credit). Flagged as a real product gap in the migration's own comment, same spirit as this app's other `TODO(product-decision)` notes, rather than silently guessing a proration rule.
- **Cancel/Restore** flip `status`/`cancelled_at` only; restoring never extends the period, so a restore on an already-lapsed subscription correctly shows Grace/Read-only (never a false "Active"), and the admin can Extend separately if the intent was "give them access back."
- `admin_gym_directory()` gained a `package_id` column (the Gyms screen's new "change package" control needs the org's *current* package to pre-select it) — required a `DROP FUNCTION` + recreate since Postgres won't let `CREATE OR REPLACE` change a return signature; same admin gate and revoke-then-grant as before.
- **App**: `src/features/gyms/actions.ts` (4 plain `{ error }`-returning functions, no form needed — every input is a single primitive, same shape as `setPackageStatus`), a new "Manage" button per gym (desktop table + mobile card) opening a `Sheet` with three independent action groups (Extend / Change package / Cancel-Restore, each its own `useTransition`), and `listAssignablePackages()` (active packages only, for the change-package `<select>`). `Gym` gained `organizationId`/`packageId` fields (not part of the original design's mock shape) so the UI has real ids to act on.
- **Verified live through a real authenticated admin session**, not just a service-role smoke test (the lesson from the this-binding incident above: static checks and service-role calls can't exercise the actual `is_platform_admin()`-gated path a real user hits) — a throwaway, fully self-cleaning script created a disposable admin auth user + a disposable test organization, signed in as that admin, ran all 4 RPCs plus a repeat-restore (confirming the "not cancelled" guard raises), checked `admin_gym_directory()` reflects the new `package_id` column, checked all 4 audit-log rows landed, then deleted every trace (auth user, `platform_admins` row, organization, subscription, audit rows) — confirmed zero residue afterward via a direct count query. `get_advisors` (security) clean: the only new findings are the 4 expected authenticated-callable flags, same category as every other `admin_*` function. `tsc`/`eslint`/`build` all clean on top of that.
- **Not done in this milestone, deliberately**: no confirmation dialog before Cancel (matches the existing "no confirm before Archive" precedent — flagged there as worth reconsidering if it becomes a real footgun); Overview's risk-row action buttons (Extend/Remind/Call/Nudge) still don't link to this new sheet — they're display-only labels on that screen, wiring them up is a small follow-on, not done here since the design never specified where the Overview button should navigate.

---

## Milestone: Packages CRUD (2026-09-08)

The first real write path. Design choice: every mutation goes through a `SECURITY DEFINER` RPC that does the table write **and** the `admin_audit_log` entry in one transaction — not a blanket RLS write policy. Concretely, `supabase/migrations/1002_admin_read_functions.sql`'s `platform_packages_admin_write` policy (added but never used) is **dropped** in `1003_admin_package_write_rpcs.sql`: once real writes exist, a blanket "any admin can write any column" policy would let a direct REST call mutate the catalogue with zero audit trail, since the audit insert only happens because the RPC body does it. Closing that gap is the actual reason this migration exists, not just "add the CRUD".

- **DB**: `admin_create_package`, `admin_update_package`, `admin_set_package_status` — all `SECURITY DEFINER`, all admin-gated, all revoke-then-grant per the established pattern. `code` and `billing_period` are deliberately not updatable (create a new package row instead — matches FitDeskApp's own starter_monthly/starter_yearly-as-separate-rows convention). **Verified live**: created/updated/archived/restored a throwaway test package as the real admin session, confirmed all 4 actions produced a correct `admin_audit_log` row, deleted the test data, re-ran `get_advisors` (security) — clean.
- **App**: `src/features/packages/actions.ts` (zod-validated Server Actions calling the RPCs), `packages-view.tsx` rebuilt to open a shared create/edit `Sheet` (`useActionState`), and real Archive/Restore buttons (`useTransition` + `router.refresh()` on success). `Package`/mock-data.ts gained a `raw` field (id + real editable numbers) so the Edit form can pre-fill without re-parsing formatted display strings like "₹649" back into numbers.
- **Verification**: `tsc --noEmit` / `eslint` / `npm run build` all clean (re-run twice — once before a small unused-prop cleanup, once after).
- **Not done in this milestone, deliberately**: no UI yet for the "featured" flag (still absent — no real column, see P2 Packages note above), no bulk actions, no confirmation dialog before Archive (a single click archives immediately — worth reconsidering if this becomes a real footgun in practice, flagging rather than pre-guessing).

---

## Reference: FitDeskApp architecture (condensed — see the audit above for full detail)

- **Stack**: Next.js 16 (App Router, Turbopack), React 19, TypeScript strict, Tailwind v4, Supabase (Postgres+Auth+Storage+Realtime), Vercel. No test framework — gates are `next build` / `tsc --noEmit` / `eslint` + manual verification.
- **Design tokens ("Clay & Rust")**: `--ink:#1b1512 --paper:#f7f2ea --sand:#ede4d6 --line:#e4dacb --mute:#6f6259 --mute2:#8a7e73 --mute3:#b3a99d --accent:#bf3b15 --hi:#f2c14e --inkline:#3c332c --ink2:#302620 --faint:#a9a69b --on-hi:#6b3b10 --on-accent:#f7d6c6`. Fonts: Archivo Black (display), Space Grotesk (body). 1.5px borders, sharp corners (no radius), Lucide icons only via `core/ui/icons.ts`. The design canvas reuses these exact values.
- **Auth**: Supabase Auth; `getClaims()` (local JWT verify) not `getUser()`; middleware (`proxy.ts`) is UX-only, RLS is the real boundary.
- **Directory convention to mirror**: `app/` routes only, `core/` cross-cutting infra (no domain knowledge), `features/<domain>/{queries.ts,actions.ts,components/}`, `components/` shared primitives. Enforce (via eslint, same pattern as FitDeskApp) that a service-role client is never importable from `features/**`.
- **Money**: `bigint` minor units everywhere, one formatter (`core/money/format.ts`). **Timezones**: gym/org timezone authoritative, never bare UTC, via `core/dates/timezone.ts`-style helpers.
- **Platform-billing plane** (this app's home turf): `platform_packages` (catalogue, not org-scoped), `organization_subscriptions` (1/org, entitlement derived from `current_period_end + grace_days`, never from a stored status — see FitDeskApp's `resolveBillingAccess()`, directly reusable logic), `platform_payments` (gym owner → MyFitDesk, MyFitDesk's own Razorpay account, kept structurally separate from tenant `payments`), `platform_document_sequences`, `payment_provider_events` (webhook inbox, currently unsurfaced — **M-12**), `query_perf_events`, `rate_limits`.
- **Tenancy plane** (read-mostly for admin): `organizations → gyms → branches`, `staff_memberships` (role: owner/staff/trainer), `members`, `membership_plans`, `member_subscriptions`, `payments` (money columns immutable by trigger once settled), `audit_log` (4 tables only, owner-read-only, no admin coverage today), `email_log`, `whatsapp_integrations`/`whatsapp_messages`, `payment_gateway_integrations` (gym's own Razorpay — secrets encrypted app-side, never surface them).
- **Hard schema facts that shape admin design**: no hard delete anywhere (soft-delete/archive/request only, every FK `on delete restrict`); one org ≈ one gym ≈ usually one branch; a user belongs to exactly one org; nothing tracks attendance/workouts/appointments/member-facing anything — don't plan around entities that don't exist.
