# Handoff: Book a Demo (public page) — UI built, functionality to do

Design source: Claude Design project `43a4f435-31a5-4def-a028-d225742ef5e1`, file `MyFitDesk Book a Demo.dc.html` (read via the `DesignSync` tool).
Route: **`/book-demo`** (public, no auth — only `/admin` is gated; there is no `proxy.ts`).

**Status (2026-10-04): functionality implemented locally; remote activation pending.** The fake submit/availability are removed. See [implementation and shared CRM contract](BOOK_DEMO_IMPLEMENTATION.md), migration `1021_book_demo_foundation.sql`, and `supabase/apply/1021_verify.sql`. DEV SQL apply and live verification are still required. The sections below retain the original requirements for reference.

## What exists

| File | Role |
| --- | --- |
| `src/app/book-demo/page.tsx` | Server page. Computes the bookable window (IST) and passes it down. `?preview=errors\|sending\|success\|returning` jumps to a design state **in dev only** (ignored when `NODE_ENV=production`). |
| `src/app/book-demo/book-demo-view.tsx` | The whole client UI: hero, form (gym details + calendar + time slots), submitting state, success / returning-visitor state. Uses the shared `Button`/`ButtonLink` (raw `<button>` is lint-banned). |
| `src/features/demo-requests/validation.ts` | Field vocab (states, branch ranges, member ranges) + `validateDemoRequest()`. Plain module, importable by the server. |
| `src/features/demo-requests/slots.ts` | IST date helpers, 18 half-hour slots (10:00–18:30), `demoWindow()`, `dayStatus()`, `calendarMonths()`. Contains the two availability **stubs** (`isDayFull`, `isSlotOpen`). |
| `src/features/demo-requests/submit-stub.ts` | Fake submit (1.4 s delay, always `{ ok: true, returning: false }`). **Delete once replaced.** |
| `src/core/ui/icons.ts` | Added `MailIcon`, `SendIcon`. |

Verified: `tsc --noEmit` and `eslint` clean on touched files; rendered in the Browser pane at desktop and 375 px (no horizontal overflow); validation errors, date → time selection and the success/returning states checked. **Not verified:** `next build`, a real submit (none exists), keyboard-only pass.

Deliberate UI choices vs. the design file:
- The design's prototype toolbar (breakpoint / state / date-picker switchers) and the dashed "On submit · CRM handoff" box are **not** rendered — they were prototype/spec chrome. The CRM spec is reproduced below.
- Only the **month grid + time list** date picker is built. The design also has a "14-day strip + chips" alternative; it was not implemented (month grid is the design's default).
- Layout is plain responsive Tailwind (`sm` 640 / `lg` 1024 two-column), not the design's three fixed frames.

## What needs building

### 1. Submit Server Action
Replace the `submitDemoRequestStub(...)` call in `book-demo-view.tsx` (inside `onSubmit`) with a Server Action. Keep the return shape `{ ok: true, returning: boolean } | { ok: false, error: string }` — the view already renders `error` above the submit button and switches to the returning-visitor note on `returning: true`.

Requirements:
- **Re-validate on the server** with `validateDemoRequest()` (or a zod schema built from the same vocab — the repo uses zod 4). Also check the date is inside `demoWindow()` and not a closed/full day, the time index is 0–17 and still open. Never trust the client's checks.
- Normalize: phone → 10 digits (store `+91` + digits), email trimmed + lowercased, gym/name/city trimmed, message ≤ ~1000 chars.
- **Public + unauthenticated, so abuse-proof it:** rate limit per IP (FitDeskApp has a `rate_limits` table/pattern to copy — D-B: copy, don't import), a honeypot field, and a Turnstile/hCaptcha check if spam shows up. Reads/writes must use the **service client** server-side only (it must never be importable from `features/**` — put the action in `src/app/book-demo/actions.ts`, same carve-out `app/admin/gyms/invite-actions.ts` uses). Anon/authenticated must have **no** direct table access.
- Use `core/forms/form-values.ts` helpers if you read `FormData` (absent field → `""`, not `null`).
- Return generic errors; don't leak whether a phone/email already exists. "Returning visitor" is the one deliberate exception (see §3).

### 2. Database (new migration — next serial in the admin `10xx` sequence is **1021**; confirm nothing newer is reserved, per `AGENTS.md`)
The Sales CRM UI is already built on mock data in `src/features/sales/` (`model.ts`, `mock-data.ts`, route `/admin/sales`) by a parallel session — **there is no leads table yet.** Prefer feeding that, not inventing a second store: create the leads table the CRM needs (coordinate with whoever owns it) and write demo requests into it. If you must ship this first, a minimal `demo_requests` table is acceptable but should be a subset of the lead model so it can be folded in.

Fields to store (from the form): gym name, contact name, phone (E.164), email, city, state, branch range (`1` / `2–3` / `4–10` / `10+`), member range (`Under 100` … `1,000+`), optional message, **requested date (IST date)**, **requested time (IST, store as `timestamptz` or `time` + date — be explicit)**, timestamps, source, stage, demo status, assignee, possible-existing-lead flag.

Rules:
- RLS **enabled and forced**, no policies for `anon`/`authenticated` (service-role writes from the Server Action; platform admins read via admin-gated `SECURITY DEFINER` RPCs like every other `admin_*` read). Pin `search_path`, revoke from `public, anon`, grant to `authenticated` — the same convention as 1004/1012.
- Audit via `admin_audit_log` where an admin changes it later.
- **Execute every new plpgsql function against real rows as a real admin before calling it done** (see the repo's two "Production incident" notes — an applied migration proves nothing). Apply to PROD only with explicit user go-ahead; DEV is applied by the user pasting the file into the SQL Editor.

### 3. CRM handoff on submit (spec from the design)
- Create a lead — **Source: `Website Demo`** (already in `LEAD_SOURCES`).
- **Stage: `Demo Requested`** (`demo_req` in `features/sales/model.ts`); demo status **`Awaiting confirmation`** (`DemoStatus`).
- Store preferred date + time, contact and gym details.
- **Assigned to: Platform admin** — assignment rule must be pluggable later (one function, not scattered), default to the platform owner / unassigned pool.
- **Possible existing lead:** match on normalized phone **or** email. On a match, don't create a duplicate silently — attach the request to the existing lead's conversation / timeline, flag it **"Possible existing lead"** in the CRM, and return `returning: true` so the visitor sees "Looks like we've spoken before". Matching must be server-side only.
- The slot is **not booked** until staff confirm. The success copy says exactly that — keep behaviour consistent (a request does not reserve the slot).

### 4. Availability (replaces the stubs in `slots.ts`)
- `isDayFull(key)` and `isSlotOpen(key, timeIndex)` are deterministic fakes. Replace with real data: staff working hours/capacity minus already-confirmed demos (and optionally pending requests per slot, capped).
- Because the page is public, don't ship the whole schedule to the client. Preferred: a small read endpoint / Server Action `getDemoAvailability(dateKey)` returning that day's open slot indexes, and a month-level summary for the calendar (day statuses). `pickDate()` in the view already shows a 380 ms skeleton where this fetch belongs (`setSlotsLoading`) — await the real call there and handle errors (show a retry message in the time panel; none exists yet).
- Re-check availability inside the submit action (race: two visitors, same slot).
- Window rule today: tomorrow → +30 days, Sundays closed, IST. Keep it in `demoWindow()` / `dayStatus()`; add holidays there.
- All dates are **IST calendar-day keys (`YYYY-MM-DD`)**, never device-local `Date`s (repo IST policy, `src/core/dates/ist.ts`).

### 5. Notifications (nice-to-have, not in the design)
- Email the visitor a receipt (reuse `core/email/system-email.ts` + add a template in `templates.ts`; degrade gracefully when SMTP isn't configured, like the invite flow) and notify the sales owner. Wording must keep "not booked until we confirm".
- Optional WhatsApp confirmation later — out of scope.

### 6. Small TODOs left in the UI
- Success screen "Back to MyFitDesk" links to `/` (which redirects to the admin login). Point it at the marketing site URL (new env var, e.g. `MARKETING_ORIGIN`; there is already `MYFITDESK_ORIGIN` for the tenant app).
- Contact email `hello@myfitdesk.com` is hardcoded in several places — confirm it's the real inbox.
- Decide on analytics/consent (none added). Page is not `noindex` — it's meant to be public; add canonical/OG metadata if the marketing team wants it indexed.
- `export const dynamic = "force-dynamic"` is set because the window depends on "today"; revisit if availability becomes cacheable.

## Open product question (decide before building more)
This is a **public marketing-style page living in the admin app** (`admin.myfitdesk.app`). It works, but the admin repo is otherwise a private back-office (D-B). Options: keep it here (leads + CRM are here anyway), or copy the `app/book-demo/` + `features/demo-requests/` folders to the marketing/tenant site and have it POST to this app. The code is self-contained to ease that, but the CRM write must stay server-side in whichever app owns the database.

## Testing checklist
1. Empty submit → inline errors on every required field, focus lands on the first invalid control, summary reads "N things need fixing…".
2. Phone: `98765` rejected; `9876543210` and `+91 98765 43210` accepted; non-mobile prefixes (`1…`–`5…`) rejected.
3. Date closed (Sunday), full, past, > window → not selectable; changing date clears the chosen time.
4. Submit with a slot taken meanwhile → friendly error, form stays filled.
5. Duplicate phone/email → returning-visitor note, no duplicate lead, flagged in CRM.
6. Rate limit / honeypot trips → generic error, nothing written.
7. Anon Supabase client cannot read or write the new table(s) directly.
8. Mobile 375 px: no horizontal scroll, 44 px touch targets (already true for the current UI).
