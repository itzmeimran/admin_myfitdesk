# Handoff: Sales CRM — UI built, functionality to do

Implementation update (2026-10-04): the data layer, commands, role/team controls, reports and navigation are implemented. See `docs/SALES_CRM_IMPLEMENTATION.md` for migration order, verification, product decisions and deployment limits. The original UI handoff below is retained as the implementation brief.

**Book Demo dependency update (2026-10-04):** migration `1021_book_demo_foundation.sql` now implements the shared `platform_sales_leads`, `platform_sales_activities` and `platform_demo_requests` store. Reuse it and extend it in the next unused migration. Read [BOOK_DEMO_IMPLEMENTATION.md](BOOK_DEMO_IMPLEMENTATION.md) before implementing the proposed schema below; it defines UUID ids, normalized identities, duplicate flags without duplicate rows, the locking protocol and confirmation capacity. Remote application is pending.

Design source: Claude Design project `43a4f435-31a5-4def-a028-d225742ef5e1`, file `MyFitDesk Sales CRM.dc.html` (read with the `DesignSync` tool; `support.js` is only the canvas runtime).
Route: **`/admin/sales`** (inside the admin gate). Views are `?view=board|attn|cov|ana` — Pipeline (default) · Needs attention · Coverage · Analytics.

**Status: UI only, on sample data.** Nothing is persisted, nothing is read from Supabase, no permission is checked. Do not redesign the UI — replace the data layer behind it. Everything fake is marked in code (`SAMPLE_*`, "UI-ONLY BUILD", "UI preview" bar).

Not done on purpose (user said ignore the sidebar): **no nav entry** was added to `src/app/admin/nav-items.ts`. The page works at its URL only. Adding the link (label "Sales", with an attention-count badge from the same rule as `attentionReasons`) and the section guard are part of the work below.

## What exists

| File | Role |
| --- | --- |
| `src/app/admin/sales/page.tsx` | Server page. Only reads `?view=`. **No auth/permission check yet.** |
| `src/app/admin/sales/sales-crm.tsx` | Client shell: header, scope switch, view tabs, loading/empty/error states, modal host. Also contains `PreviewBar` (role + data-state switchers) — **delete when wired.** |
| `pipeline-view.tsx` | Summary strip, search, filters, chips, kanban board (drag & drop, lg), phone stage switcher, lead cards. |
| `attention-view.tsx` | Four grouped lists (overdue / demo awaiting confirmation / trial ending / stale). |
| `coverage-view.tsx` | State → City → Area → PIN drill-down with coverage bars; "View leads" jumps to the board with that location filter. |
| `analytics-view.tsx` | KPIs, stage bars, lost reasons, follow-up completion, source and salesperson tables. **All numbers are static sample figures** (the design labels it "layout for future reporting"). |
| `lead-drawer.tsx` | Right drawer (full screen on phone): Overview / Activity / Follow-ups, demo section, conversion card, duplicate banner, assignment history. |
| `modals-basic.tsx`, `modals-flows.tsx`, `crm-modal.tsx` | Every dialog: filters, stage picker, more-actions, log activity / schedule follow-up, confirm / suggest / schedule / reschedule demo, reassign, convert, close lead, duplicate review. Each flow owns its draft state and validation, then calls one store command. |
| `src/features/sales/model.ts` | Types, stage lists, role/scope config, IST-ish pick-lists. Plain module (server-safe). |
| `src/features/sales/derive.ts` | **Pure rules**: needs-attention, card flag, filter matching, summary, attention groups. |
| `src/features/sales/use-sales-crm.tsx` | **The seam.** Context store; every mutation is a command in `SalesCommands` that today just edits React state. |
| `src/features/sales/use-visible-leads.ts` | Scope (my/team/all) + filter pipeline over the in-memory list. |
| `src/features/sales/mock-data.ts` | `SALES_USERS`, 18 `SAMPLE_LEADS`, seeded activities/follow-ups/assignments, `SAMPLE_COVERAGE`, `SAMPLE_ANALYTICS`, `sampleOrgCandidates()`. **Delete once replaced.** |

Verified: `tsc --noEmit` and `eslint` clean on `src/app/admin/sales` + `src/features/sales`. Rendered in the Browser pane (on a temporary route outside `/admin`, since deleted) at desktop and 375 px: no horizontal overflow; board, drawer, Needs attention / Coverage / Analytics, and these flows were exercised end-to-end on sample data — confirm demo, close lead (validation + submit), duplicate merge, convert/link. **Not verified:** `next build`, tablet width, keyboard-only pass, drag-and-drop with a mouse (HTML5 drag; the commands it triggers were exercised), any real data, the admin gate itself.

## What needs building

### 1. Replace the store commands (the main job)
Keep the `SalesCommands` signatures; swap the bodies for Server Actions (put them in `src/app/admin/sales/actions.ts`, same pattern as `app/admin/gyms/`), call `router.refresh()` or return the fresh row, and keep the toasts. Each command = **one RPC = one transaction that also writes `admin_audit_log` / an activity row**, the repo convention (see 1004).

| Command (in `use-sales-crm.tsx`) | Should do |
| --- | --- |
| `moveLead(id, stage)` | Plain stages: set `stage`; if `trial` and no trial yet, create one (UI assumes 14 days). `converted` / `closed` / `later|notint|lost` / `demo_sched` only **open a modal** — the write happens in the modal's command. Add an activity row. Reject illegal jumps server-side. |
| `logActivity` | Insert activity (call / whatsapp / email / meeting / note); set `last_contacted_at = now()`. Note text is required for type Note. |
| `scheduleFollowUp` | Insert follow-up (`type`, due date + time in IST, note); set the lead's *next follow-up* to the earliest open one. |
| `completeFollowUp` | Mark done; recompute next follow-up; set last contacted; add activity. |
| `saveDemo` | Four cases: confirm requested slot → `demo_sched` + status Scheduled; suggest another time → status `Awaiting confirmation` + `suggested`, stage unchanged; schedule; reschedule → `Rescheduled`. Stored time must be an IST timestamp (the UI uses strings like "Tue 6 Oct · 4:00 PM"). Re-check the slot is still free. |
| `setDemoStatus` | Completed / No show / Cancelled. |
| `reassign` | Change owner; append to assignment history; add activity. Enforce who may reassign **in the database** (admin any; manager within their team). |
| `convert` | Two paths. **Link existing gym:** attach `organization_id` of an existing `organizations` row. **Invite owner:** call the existing `admin_create_gym_owner_invitation` flow (`app/admin/gyms/invite-actions.ts`, migration 1012) — do not build a second invitation system. Then set `stage='converted'`, store the conversion snapshot (plan, org, account status, by, date), stop all open follow-ups. |
| `closeLead` | Outcome Lost / Not interested / Follow up later. Reason required unless "later"; note required when reason is "Other"; "later" needs a revisit date (UI offers 2 weeks / 1 month / 3 months) and sets the next follow-up. |
| `resolveDuplicate` | **Merge:** keep the existing lead, take per-field picks (gym / contact / email), reopen it as Demo requested with the new request's demo, delete/soft-delete the new lead, add a "merged" activity. **Keep separate:** clear the flag, reason required, add a note. |
| `togglePriority`, `reopen` | Priority normal↔high. Reopen moves a closed lead back to Follow-up. |

### 2. Database — new migration
Next free serial in the admin `10xx` sequence: `AGENTS.md` reserves 1020 and a parallel session just created an empty `1021_book_demo_foundation.sql` for Book a Demo — **coordinate first**; the Book-a-Demo handoff (`docs/HANDOFF_BOOK_A_DEMO.md` §2) explicitly wants its demo requests written into *this* leads table, not a second one. Whichever migration lands first owns `sales_leads`; the other builds on it. Use the next unused serial after both.

Proposed shape (rename freely, keep the relationships):
- `sales_leads`: gym, contact, phone (E.164, normalized — used for duplicate matching), email (lowercased), area, city, state, pin, branches, members range, current software, `source`, `stage`, `owner_id` (→ platform admin user), `priority`, `last_contacted_at`, `next_follow_up_id`, expected plan, `lost_reason`, `note`, `duplicate_of`, `organization_id` (nullable, set on convert), conversion snapshot columns, `created_at`, soft-delete. Money none.
- `sales_lead_activities` (kind, title, note, actor, `created_at`) — append-only, this is the timeline.
- `sales_follow_ups` (lead, type, `due_at timestamptz`, status open/done/stopped, note, completed_at). "Overdue / today / upcoming" must be **derived from `due_at` in IST at read time**, never stored.
- `sales_demos` (lead, status, `scheduled_for timestamptz`, `suggested bool`) — or columns on the lead if one demo at a time is enough (the UI shows one).
- `sales_assignments` (lead, from, to, by, `created_at`) for the history list.
- `sales_gym_coverage`: coverage "identified" counts gyms logged by the team including ones never contacted. Either leads *are* the identified gyms (simplest — then coverage is a `group by state, city, area, pin` over `sales_leads` joined to conversions), or a separate imported prospect list. **Product decision needed**; the sample shows 140 identified vs 18 leads, so the design assumes more prospects than leads.
- Sales team membership: `team` per user. Proposal: add roles `sales_manager` and `sales_rep` to `platform_roles` (+ a `team` column on `platform_admins`); Platform Owner = the design's "Platform admin".
- RLS enabled + forced, **no direct table policies for `authenticated`**; read through admin-gated `SECURITY DEFINER` RPCs, same as every `admin_*` function. Pin `search_path`, revoke from `public, anon`, grant to `authenticated`.
- **Visibility is enforced in SQL**, not in `use-visible-leads.ts`: rep → own leads; manager → their team's; owner → all. A rep must not be able to read another rep's lead by calling the RPC with an id.
- Execute every new plpgsql function against real rows **as a real admin, per role** (owner / manager / rep, plus a non-sales admin refused) before calling it done — the two "Production incident" notes in `CLAUDE.md` apply. Apply to PROD only with explicit go-ahead; DEV by pasting into its SQL Editor.

### 3. Read RPCs / queries the screens need
- `admin_sales_leads(filters, search, scope, team, limit, offset)` → board + counts. The board loads every lead today; with real volume page per column or cap with "Load more". Search matches gym / contact / email and phone digits.
- `admin_sales_lead_detail(id)` → lead + activities + follow-ups + assignments.
- `admin_sales_summary(scope, team)` → the 7 tiles. Conversion % = converted / total in scope.
- `admin_sales_attention(scope, team)` → the four groups. **Rules to reproduce exactly** (from `derive.ts › attentionReasons`; closed and converted leads are never listed): *overdue* = an open follow-up past due; *demo* = stage Demo requested **and** demo status Awaiting confirmation; *trial* = stage Trial with ≤ 3 days left; *stale* = last contacted ≥ 7 days ago. Use the same function for the nav badge. The card's single flag line has its own priority order in `flagOf` — keep that on the client or return it.
- `admin_sales_coverage(path)` → children counts `[identified, contacted, trials, customers]` per node, one level at a time (State → City → Area → PIN); "View leads" sets the matching location filter.
- `admin_sales_analytics(period, scope, team)` → KPIs (conversion rate, demo→trial, trial→paid, avg days to convert), leads by stage, lost reasons, follow-ups done vs overdue this month, source performance, salesperson performance. Reps see only their own row. The period dropdown (90 days / 30 days / this year) is currently not wired.
- Organization search for the Convert → "Link existing gym" picker (`sampleOrgCandidates` is fake): search `organizations` by name or owner phone; show signed-up date and subscription status (Trial / Active / Expired); flag a phone match.

### 4. Access control
- New permission(s), e.g. `sales.view` / `sales.manage` / `sales.reassign`, added to `platform_role_permissions` and `core/auth/permissions.ts`; guard `src/app/admin/sales/` with a `layout.tsx` calling `requirePermission()` like `whatsapp-credits/layout.tsx`; call `assertPermission()` first in every Server Action. The nav item is convenience only.
- The preview bar's role switcher must go; role and the "me" user come from `getAdminAccess()`. `ROLE_CONFIG` (scopes per role) and the Platform-admin-only team dropdown stay.
- Manager "team" is hard-coded to `"South"` in `use-visible-leads.ts` and `modals-flows.tsx` / `lead-drawer.tsx` (`team === "South"`); read it from the signed-in user.

### 5. Website demo requests → leads
Covered in `docs/HANDOFF_BOOK_A_DEMO.md` §3: a submit creates a lead with **Source `Website Demo`**, **Stage `Demo requested`**, demo status **Awaiting confirmation**, preferred slot, auto-assigned to the platform admin (pluggable rule), and a phone/email match raises `duplicate_of` ("Possible existing lead"). The duplicate banner + Review match dialog in this UI already consume `duplicateOf`. The slot is *not* booked until staff confirm.

### 6. Reminders and automation (not in the design, implied by it)
- "Sales follow-up reminders stopped on conversion" and "We'll remind the owner on the revisit date" imply scheduled reminders. Nothing sends them. Decide: in-app only (the Needs-attention list already is that), email/WhatsApp to the **salesperson**, or a message to the **gym owner**. If anything is sent, reuse `core/email/system-email.ts` and degrade gracefully without SMTP.
- Optional nightly job to flip `next follow-up` "today → overdue" is **not needed** if overdue is derived from `due_at` at read time (recommended).

### 7. Realtime (optional)
Two people on one board will not see each other's moves. If wanted, copy the Gym Details pattern (content-free private Broadcast fed by a statement-level trigger, `20260930120000_admin_gym_realtime.sql`) rather than `postgres_changes`.

### 8. Dates and time
All sample dates are fixed strings around "3 Oct 2026" (`MOCK_TODAY`, `DEMO_DAYS`, `FOLLOW_UP_DAYS`, `TIME_SLOTS` in `model.ts`). Replace with real IST calendar days (`src/core/dates/ist.ts` — repo policy: never device-local `Date`). Demo hours are Mon–Sat, 10:00–18:30 IST in the pick-lists; keep one source of truth shared with `features/demo-requests/slots.ts`.

### 9. Small things left in the UI
- Header search is local to the pipeline; on **Needs attention** it filters by gym name only.
- "Copy Book a Demo link" in the empty state copies `${origin}/book-demo` — confirm the public URL (`MARKETING_ORIGIN` idea in the Book-a-Demo handoff).
- The summary strip, columns and drawer are sized for `sm`/`md`/`lg` Tailwind breakpoints, not the design's three fixed frames; tablet (≈834 px) was not visually checked. The design's "Tablet board: Columns/List" and "Lead cards: Comfortable/Compact" prototype toggles were **not built** (prototype chrome); only the comfortable card exists.
- Drag-and-drop is HTML5 drag: works with a mouse, nothing for touch/keyboard. The "Move to stage" dropdown in the drawer is the accessible path and calls the same command.
- Analytics numbers, coverage counts and the "Lead source" / "Salesperson" tables are sample data; the `SAMPLE_ANALYTICS` object shows the exact fields each panel needs.
- Lead ids are numbers in the sample; use uuids.

## Testing checklist
1. Rep sees only their leads, manager their team's, owner all — verify by calling the RPC directly with another user's lead id (must fail), not just by looking at the UI.
2. Drag a card to every column: plain stages move; Converted → convert dialog; Later/Lost → close dialog; Demo scheduled → demo dialog; cancelling any dialog leaves the lead where it was.
3. Close lead: reason required (and a note for "Other"); "Follow up later" needs no reason and creates a follow-up on the chosen date.
4. Overdue follow-up shows on the card, in Needs attention and the tab badge; completing it removes all three. A converted or closed lead never appears in Needs attention.
5. Duplicate: merge keeps one lead with history from both and the chosen field values; keep-separate requires a reason and removes the banner.
6. Convert via "Invite owner" creates exactly one invitation and one gym (no duplicate gym when the phone already matches an organization).
7. Reassign: manager cannot move a lead outside their team; history list shows the new row; previous owner keeps read access to what they logged (per the dialog copy — confirm that rule is intended).
8. Coverage "View leads" lands on the board with the location chips set; Clear all resets.
9. Empty / loading / error states render for a real empty table, a slow query and a failed RPC (the preview bar only simulates them).

## Open product questions
- Are "identified gyms" separate from leads (see §2)?
- Who can see Analytics — everyone scoped to themselves (as designed), or owner/manager only?
- Is there one demo per lead at a time (UI assumes yes)?
- Reminder channel and recipient (§6).
- Should a reassigned lead's previous owner keep read access (dialog says yes)?
