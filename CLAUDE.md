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
| D-1 (open) | New admin-only SQL (the `platform_admins` table, predicate, cross-tenant RLS policies) has to be applied to the **same live Supabase project** FitDeskApp uses. Plan: this repo owns its own `supabase/migrations/` in a numeric range that can't collide with FitDeskApp's (start at `1001_…`), applied to the same project. FitDeskApp's migration files are never touched. Needs final go-ahead before the first migration is applied to the live project. |

---

## Completed

- **Full source-first audit of FitDeskApp** — architecture, auth/authz (3 enforcement layers: RLS, `getSessionContext()`, UI helpers), all 42 migrations / full DB schema (tenancy plane + platform-billing plane), feature inventory (members, plans, subscriptions, payments, reports, integrations, notifications, platform billing), design tokens ("Clay & Rust" — see below), and the open items in `AUDIT-BACKLOG.md` (39 defects, several of which an admin surface would remediate — notably **M-12** unsurfaced failed webhooks, **L-3** unbounded telemetry tables).
  - Headline finding: **there is no platform back-office of any kind today.** `platform_packages` has a read policy and no write policy (catalogue changes today = a migration). `organization_subscriptions` has no write policy for any client role (extending/cancelling a tenant today = raw SQL). No `platform_admin`/`super_admin`/`/admin` concept exists anywhere in the codebase.
- **Claude Design reference imported** via the `DesignSync` MCP tool (`get_project` / `list_files` / `get_file`) from project `43a4f435-31a5-4def-a028-d225742ef5e1` ("Scope and section questions", type `PROJECT_TYPE_PROJECT`), file `MyFitDesk Platform Admin.dc.html` (+ `support.js`, which is just the generic `.dc.html` canvas rendering runtime — no app-specific content, safe to ignore).
  - The canvas has **5 sections**: **Overview** (dashboard home), **Gyms** (tenant directory), **Packages** (catalogue), **Revenue** (platform billing), **Settings**.
  - Fully parsed: **Overview** page — sidebar nav, header (search + alerts), loading/empty/error states, "Needs attention today" alert strip, 5 KPI tiles, 12-week revenue trend bar chart, package-mix breakdown with progress bars, "Accounts at risk" table (desktop) / card list (mobile), "Hitting package limits" panel, "New this week" signups list, dark "Billing pipeline" panel.
  - **Gyms / Packages / Revenue / Settings pages, and the underlying mock-data JS (`<script data-dc-script>`) that defines every entity's exact field shape**: extraction delegated to a background agent (writing to `…/scratchpad/design-audit.md`) — **not yet folded into this file**. Check that file / the agent's completion notification before starting implementation of those 4 pages.

## In progress

- Background agent parsing the remaining 4 design pages + the mock-data script into a structured design-implementation-map. Its output lands at `C:\Users\user\AppData\Local\Temp\claude\...\scratchpad\design-audit.md` (session-specific temp path — regenerate via DesignSync `get_file` if that path is gone in a future session).

## Pending / next steps

1. Fold the finished design-audit into a **Design Element → Purpose → Existing MyFitDesk Equivalent → Implementation** map (all 5 pages), per the task briefing's requested format.
2. Scaffold the Next.js app in this repo: copy over (not import) — Tailwind v4 setup + `globals.css` Clay & Rust tokens, `core/ui/icons.ts` (Lucide-only), `Sheet`/`Toast`/`Avatar`/`SubmitButton`/`AsyncButton`/`ErrorState` primitives, `core/db/*-client.ts` patterns (adapted: admin app's RLS predicates differ — see D-C), `core/money/format.ts`, `core/dates/timezone.ts`.
3. Author the first migration(s) in this repo's own `supabase/migrations/` (range `1001_…`): `platform_admins` table, `app.is_platform_admin()`, an `admin_audit_log` table, and the new cross-tenant RLS policies the admin screens need (`platform_packages` write, `organization_subscriptions` write, cross-tenant read on `organizations`/`payment_provider_events`/`email_log`/`query_perf_events`/etc.). **Do not apply to the live project without explicit go-ahead** (D-1).
4. Build admin auth (separate login, `platform_admins`-gated) and the shell (sidebar/header) matching the design.
5. Build Overview, then Gyms, Packages, Revenue, Settings, wiring each to real Supabase queries per the implementation map — no fake/mock interactions in the shipped app; anything the current schema can't support gets flagged, not invented (see the design-audit's list of "not available from this schema" metrics once written).
6. Verify: build, typecheck, lint, and a responsive pass (desktop/tablet/mobile) against the reference design.

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
