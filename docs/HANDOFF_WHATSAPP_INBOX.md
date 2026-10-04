# Handoff: WhatsApp Inbox — UI built, functionality to do

**Implementation update (2026-10-04):** the admin UI now uses persistent RPCs and Server Actions, with migration **1023**, a user-approved additive bridge in FitDeskApp’s existing webhook, member-content exclusion, live-approved allow-listed templates, durable send/status recovery, versioned notes and shared CRM linkage. Remote SQL application and live acceptance remain pending. See [WHATSAPP_INBOX_IMPLEMENTATION.md](WHATSAPP_INBOX_IMPLEMENTATION.md) for the final contract, activation order and verification. The original UI handoff below is retained as the baseline specification.

**CRM dependency update (2026-10-04):** the Book Demo implementation owns the shared `platform_sales_leads` / `platform_sales_activities` store in migration 1021. Inbox create/link-lead functionality must reuse it. See [BOOK_DEMO_IMPLEMENTATION.md](BOOK_DEMO_IMPLEMENTATION.md) for UUID ids, normalized contact matching and identity locks. Remote application is pending; inbox functionality remains a separate task.

Design source: Claude Design project `43a4f435-31a5-4def-a028-d225742ef5e1`, file `MyFitDesk WhatsApp Inbox.dc.html` (read via the `DesignSync` tool; `support.js` is only the canvas runtime).
Route: **`/admin/whatsapp/inbox`** (platform-admin gated; `src/app/admin/whatsapp/layout.tsx` requires `whatsapp.view`).

**Status: UI only.** Everything runs on in-memory mock data and resets on reload. Every seam is marked `STUB` / `TODO(handoff)` in code (`grep -rn "STUB\|TODO(handoff)" src/features/whatsapp-inbox src/app/admin/whatsapp`). Do not redesign the UI; wire the functionality behind it.

This inbox is for **MyFitDesk's own ("managed") WhatsApp Business number** — `whatsapp_messages.sender_mode = 'managed'`. The platform has two sender modes (FitDeskApp `src/features/whatsapp/server/sender-resolution.ts`): **`managed`** = MyFitDesk's own WABA/number, used by every gym that hasn't connected its own (today: **all gyms**, no setup on the owner's side), and **`own_waba`** = a gym that connected its own number via Embedded Signup (wins when present). This inbox is about the managed number only; a gym's own-WABA conversations are that gym's business and never appear here.

## What exists

| File | Role |
| --- | --- |
| `src/app/admin/whatsapp/layout.tsx` | Section guard: `requirePermission("whatsapp.view")`. Future `/admin/whatsapp/*` pages inherit it. |
| `src/app/admin/whatsapp/inbox/page.tsx` | Server page. **Imports mock data** (`seedConversations`, `TEAM`, `TEMPLATES`, `CURRENT_USER_ID`) — this is the first thing to replace. |
| `src/app/admin/whatsapp/inbox/loading.tsx` | Route skeleton (list + thread). |
| `src/features/whatsapp-inbox/types.ts` | `Conversation`, `Message` (day / sys / in / out), `MessageStatus`, `MessageSource`, `MessageTemplate`, `TeamMember`, `InboxFilter`. Mirrors the design's mock shape — several fields are display strings, see §Data contract. |
| `src/features/whatsapp-inbox/mock-data.ts` | **Delete when real reads land.** Six conversations covering every state (unread, window expired, closed, unknown number, CRM-linked, failed send, AI / automation / manual senders). |
| `src/features/whatsapp-inbox/model.ts` | Pure helpers: filters, search, `windowState()` (open / expired / closed), initials, `nowIst()`. Keep; move search server-side (§3). |
| `src/features/whatsapp-inbox/inbox-view.tsx` | Client state container. All mutations live here as local `setConversations` calls — each is a seam for a Server Action. |
| `conversation-list.tsx`, `chat-pane.tsx`, `contact-panel.tsx` | Presentational panes. They only take props + callbacks; they should need **no** changes except wiring `loading` and error states. |
| `src/core/ui/icons.ts` | Added `AttachIcon`, `TemplateIcon`, `DetailsPanelIcon`, `LinkIcon`, `ClockIcon`, `DoubleCheckIcon`, `FailedIcon`, `ConversationIcon`, `CrmIcon`. |

Verified: `tsc --noEmit` and `eslint` clean on the touched files; rendered in the Browser pane on a temporary ungated preview page (deleted) — list, thread, failed-send + Retry, contact panel, send (row moves to top, ticks to Delivered), expired-window composer + template picker, mobile single-pane flow with no horizontal overflow. **Not verified:** the real gated route (needs a signed-in admin), `next build`, keyboard-only pass, the ⋯ menu / Assign submenu and the create-lead form in a browser.

### Deliberate UI choices vs. the design file
- **The design's left sidebar rail and top app header are not built** (user instruction — the admin shell already has its own). Only list · chat · contact panel exist. The design's rail also lists *Overview / Message History / Templates / Usage-Credits / Settings* WhatsApp pages — none exist; the nav entry for the inbox itself was **not** added (see §9).
- The prototype toolbar (Scenario / State / Breakpoint switchers) is not rendered. Its states are real UI states instead: `loading` props exist on `ConversationList` / `ChatPane` (always `false` now), the offline banner is driven by `navigator.onLine` (replace with the realtime connection state, §6), "Send fails" = send while offline.
- Layout is responsive Tailwind, not the design's 3 fixed frames. Because the page sits inside the admin shell (236 px sidebar from `md`), the breakpoints are shifted: **below `lg` one pane at a time** (list → chat → contact), `lg` list 288 px + chat with the contact panel as an overlay, `xl` list 340 px, `2xl` the contact panel docks inline. Height is `calc(100dvh − shell chrome)`; if the shell header changes height, adjust the two `calc()` values in `inbox-view.tsx` and `loading.tsx`.
- The CRM "View lead" button links to `/admin/sales` (no deep link yet).

## Stub inventory (each needs a real implementation)

| Behaviour | Where | Today |
| --- | --- | --- |
| Conversations, team, templates, current user | `inbox/page.tsx` + `mock-data.ts` | Hard-coded |
| Send text / send template | `inbox-view.tsx` `send()` | Appends locally; `sending → sent → delivered` via `setTimeout` |
| Retry failed | `retry()` | Timers again |
| Assign / unassign | `assign()` | Local + a local system line |
| Close / reopen | `toggleClosed()` | Local + local system line |
| Mark unread | `markUnread()` | Local, then deselects |
| Archive / Block number | `remove()` | Removes from local state, toast. **No confirmation dialog** — block is destructive; add `ConfirmDialog` |
| Create CRM lead | `createLead()` | Local `crm` object, toast "Lead added to Sales CRM" (a lie today) |
| Notes | `ContactPanel` `onNote` | `setState` on **every keystroke** — debounce + save |
| Search | `matchesSearch()` | Client-side over every message of every conversation |
| Window countdown | `Conversation.windowLeft` | Static string ("18h 42m"); never ticks, never expires |
| Unread counts | `Conversation.unread` | Cleared locally on open |
| Attach file | `ChatPane` button | Inert (no handler) |
| Connection state | `inbox-view.tsx` `online` | `navigator.onLine` only |

## What needs building

### 0. What already exists on the managed number (read before designing anything)
The managed WABA, number and token are **already provisioned and in production use** — this task does not need a new Meta account. What exists (tenant app `FitDeskApp`, read-only reference; D-B: copy patterns, don't import):
- **Config:** `WHATSAPP_MANAGED_WABA_ID`, `WHATSAPP_MANAGED_PHONE_NUMBER_ID`, `WHATSAPP_MANAGED_ACCESS_TOKEN` (falls back to `WHATSAPP_SYSTEM_USER_TOKEN`), plus `META_APP_SECRET` for webhook signing — all optional server env in FitDeskApp's `core/config/server.ts`. **This admin app has none of them**; add the same names as optional server-only env (like `core/config/email.ts`, so the app still boots without them), per environment (DEV and PROD are separate Supabase projects — confirm whether they also use different numbers). Never expose to the client, never log.
- **Sending:** `sendWhatsAppMessage()` / `queue.ts` in FitDeskApp resolve the sender per gym and **bill that gym's MyFitDesk WhatsApp credits**. **Do not call that path for inbox replies** — inbox messages belong to no gym, so no credits should be debited (decide how/if platform-originated cost is tracked; today the managed-cost/profitability numbers in the WhatsApp credits page only count gym-attributed `sender_mode='managed'` rows).
- **Webhook:** one Meta app → one callback URL → FitDeskApp's `src/app/api/webhooks/whatsapp/route.ts`. It already verifies `X-Hub-Signature-256`, resolves statuses by `meta_message_id` → gym, and **explicitly drops inbound messages on the managed number**: "A shared managed number cannot attribute a new inbound conversation to one tenant … This app has no inbox today, so ignore it." It also stores **no message bodies and no profile names** by design. **This inbox is the missing consumer of exactly those dropped events** — see §2 for where to receive them.
- **Templates:** 17 approved templates live on the managed WABA, catalogued in FitDeskApp `meta-managed-templates.ts` (only `membership_expiry_reminder` and `membership_payment_receipt` have a verified parameter shape); `live-templates.ts` reads them live from Graph. Most are gym→member reminders, not platform→lead messages — decide which are allowed in the inbox (§4).
- **Schema:** tenant `whatsapp_messages` / `whatsapp_integrations` are `organization_id`-scoped; `admin_gym_whatsapp_messages` (1019) returns outbound only. They can't hold a thread with a non-member (lead, unknown number), so the inbox needs its own tables (§1) — but reuse their conventions (`meta_message_id` unique, `sender_mode`, status vocabulary).

**Biggest product question — whose messages land in this inbox?** Because *all gyms send through the shared number*, a **gym member replying to their gym's reminder** ("I paid already", "stop messaging me") arrives on the same number and the same webhook as a gym owner or a sales lead replying to the platform team. Today those member replies are silently dropped. Once this inbox exists they would all appear in it. Decide before building the webhook:
1. Classify each inbound sender: match the phone against recent outbound `whatsapp_messages.phone_number_e164` (→ that gym's member), against gym owners/staff phones, against CRM leads; else "unknown".
2. Member replies belong to a **gym**, not to the platform team. Recommend: don't show them by default (separate "Gym members" bucket or hidden filter), show only the classification label, and do **not** expose bodies to platform admins without an explicit product/privacy decision (D-4 only authorised curated member PII reads, not member message content).
3. Whether the platform team should ever reply to a member from the shared number (it would look like it came from the gym's reminders).

### 1. Database (serial migration `1023_platform_whatsapp_inbox.sql`; inspect `AGENTS.md`, migrations and apply scripts before allocating another number)
Suggested tables (all RLS **enabled and forced**, no `anon`/`authenticated` policies — service role writes from the webhook / actions, admins read through admin-gated `SECURITY DEFINER` RPCs, same convention as 1004/1012/1019):
- `platform_wa_conversations` — `id`, `wa_id`/`phone_e164` (**unique**), `profile_name` (from Meta), `display_name`, `organization_id` null (link to a gym), `lead_id` null (link to CRM, see §7), `assignee_id` null → `platform_admins.user_id`, `status` (`open`/`closed`), `archived_at`, `blocked_at`, `last_inbound_at`, `last_message_at`, `last_message_preview`, `unread_count`, `note`, `created_at`.
- `platform_wa_messages` — `id`, `conversation_id`, `direction` (`in`/`out`), `meta_message_id` (**unique** — idempotency for webhook retries), `type` (text/template/image/…), `body`, `template_name`, `source` (`manual`/`auto`/`ai`), `sent_by` (admin id, null for auto/ai), `status` (`sending`/`sent`/`delivered`/`read`/`failed`), `error_code`, `error_message`, `client_ref` (client-generated idempotency key for optimistic sends), `created_at`, `sent_at`, `delivered_at`, `read_at`.
- `platform_wa_events` — conversation timeline rows that render as the thread's centred system lines ("Assigned to Priya Nair by Imran Qureshi", "Closed by …", "Reply window closed …", "CRM lead created by …"). Derive text from structured rows (`kind`, `actor_id`, `target`), **not** stored free text.
- `platform_wa_templates` (optional — or read live from Graph `GET /{WHATSAPP_MANAGED_WABA_ID}/message_templates` like FitDeskApp's `live-templates.ts` and skip the table) — the managed WABA's approved templates (`name`, `category`, `language`, `body`, `status`, named/positional `variables`) **plus an admin allow-list** of which ones the inbox may send (most of the 17 are gym→member reminders). Only `APPROVED` + allowed ones reach the UI.
- Indexes: `(last_message_at desc)`, `(assignee_id)`, `(status)`, messages `(conversation_id, created_at)`, and a `pg_trgm`/`tsvector` index for search (§3).
- **24-hour window is derived, never stored:** `window_ends_at = last_inbound_at + interval '24 hours'`. The UI's `windowLeft` string and the `expired`/`open` state must be computed from that (server for ordering/filters, client tick for the label, **server re-check on every send**).
- **Unread** is a single count per conversation in the UI (shared by all admins). Decide: shared (simple; matches the UI) vs per-admin read state (needs a `platform_wa_reads` table). Recommend shared first.
- Audit every admin write into `admin_audit_log` through the existing `app.write_admin_audit()` (the Settings milestone's single writer) — `whatsapp_inbox.assigned`, `.closed`, `.reopened`, `.archived`, `.blocked`, `.message_sent`, `.template_sent`, `.lead_created`.
- **Execute every new plpgsql function against real rows as a real admin before calling it done** (see CLAUDE.md "Production incident" notes — an applied migration proves nothing). Apply to PROD only with the user's explicit go-ahead; DEV is applied by the user pasting the file into the SQL Editor.

### 2. Inbound + status events — decide the receiver first
Meta delivers the managed number's events to **one** callback URL, today FitDeskApp's route (§0). Two ways to get them into this inbox — **needs the user's sign-off** (D-B; the Dynamic Plans task set the precedent of a scoped, additive D-2-style exception):
- **A (recommended): extend FitDeskApp's existing webhook route, additive only.** It already has signature verification, raw-body handling, the `metaTimestampToIso` fix and idempotent inserts. In the `for (const event of inbound)` block, when `event.phoneNumberId === WHATSAPP_MANAGED_PHONE_NUMBER_ID` and no org is resolved, write the **full** message (body, type, `profile.name`) into the new `platform_wa_*` tables (same Supabase project) instead of `continue`. For **statuses**, look up `platform_wa_messages.meta_message_id` **first** — today a status whose id isn't in `whatsapp_messages` is dropped (and the "managed-only gym upsert" path runs), so replies sent from the inbox would never leave `sent`. Both apps share one database, so no cross-app HTTP. Keep the gym-bound behaviour byte-for-byte unchanged and run FitDeskApp's `npm test` / build after.
- **B: move the callback to this admin app** (Graph `POST /{waba}/subscribed_apps` with `override_callback_uri`, or change the Meta app's URL). Then **FitDeskApp stops receiving managed delivery statuses**, breaking gym reminder status/credit refunds unless this route forwards them — much riskier; only if the user wants the inbox fully separate.

Either way the receiving route must follow this checklist (public route, **no admin session**; if built in this repo: `src/app/api/whatsapp/webhook/route.ts`):
- `GET`: Meta verification handshake (`hub.mode`, `hub.verify_token`, `hub.challenge`) — constant-time compare, 403 otherwise. (Option A: already exists.)
- `POST`: **verify `X-Hub-Signature-256`** (HMAC-SHA256 of the *raw body* with the app secret, constant-time) **before** parsing; reject otherwise. Respond 200 fast; do the work idempotently — Meta retries.
- Inbound messages: upsert conversation by `wa_id` (create with `profile_name` from `contacts[].profile.name`), insert message keyed by `meta_message_id` (`on conflict do nothing`), bump `last_inbound_at` / `last_message_at` / `unread_count`, reopen a closed conversation (decide: auto-reopen vs keep closed + unread dot), attempt the CRM phone match (§7). Drop messages from **blocked** numbers (still 200).
- Status callbacks (`statuses[]`): map `sent`/`delivered`/`read`/`failed` onto `MessageStatus`; store `errors[0].code/title` on failure (e.g. `131047` = reply window expired — surface a human message, not the raw code). Statuses can arrive out of order — never move `read → delivered`.
- Non-text inbound (images, audio, documents, locations, reactions): the UI renders **text only**. Minimum: store `type` and show a placeholder bubble like "📎 Image (not shown yet)"; media download needs the Graph API (URLs expire) and storage — a follow-up, but don't crash on them.
- Uses the **service client** server-side only; it must never be importable from `features/**` (put the handler under `app/api`, same carve-out as `invite-actions.ts`). Do not log message bodies or phone numbers.
- Follow FitDeskApp's webhook conventions where applicable (read-only reference repo; copy, don't import — D-B). The `payment_provider_events` inbox pattern (store raw event first, process after) is worth copying for replay/debugging.

### 3. Reads (admin-gated `SECURITY DEFINER` RPCs, paginated; all `whatsapp.view`)
- `admin_wa_conversations(p_filter, p_search, p_limit, p_before)` → rows shaped like `Conversation` minus messages (name, org/gym name via join, phone, assignee, status, window_ends_at, crm link, preview, last_message_at, unread). Server-side filter for All / Unread / Open / Closed / Unassigned **and counts** (the Unread tab count and "N open" header are computed from the whole set, not the loaded page). Order by `last_message_at desc`.
- `admin_wa_messages(p_conversation_id, p_before, p_limit)` → cursor-paginated thread (newest page first, "load earlier" at the top — the thread currently renders everything). Include events for the system lines.
- **Search must be server-side** (name, phone with/without spaces, org, message text). The client matcher in `model.ts` searches every message of every loaded conversation and won't scale; keep the UI behaviour (debounced input, "No results for …" empty state) and drive it from the query string or an action.
- Page does the first load on the server (`createClient()` + RPC, like other admin pages); the list then refetches on filter/search/realtime. Wire `loading` on `ConversationList` for refetches and on `ChatPane` for opening a conversation; `loading.tsx` already covers the initial route load.
- Replace `TEAM` with active admins holding `whatsapp.manage` (there is an admin roster read in `features/settings/admins.ts`; you may want a narrower RPC that doesn't need `admins.view`) and `CURRENT_USER_ID` with the session user from `resolvePlatformAdmin()`.

### 4. Writes — Server Actions in `src/app/admin/whatsapp/inbox/actions.ts`
Each: `"use server"`, `assertPermission("whatsapp.manage")` first, validate inputs (zod 4; use `core/forms/form-values.ts` for `FormData`), re-check authority on the server, write `admin_audit_log`, return `{ ok } | { error }` (generic messages). **The UI's checks are conveniences only.**
- **Send text:** server re-checks the 24 h window (`last_inbound_at`), conversation not closed/blocked, body 1–4096 chars; inserts a `sending` row (idempotent on `client_ref`), calls Graph `POST /{phone_number_id}/messages`, stores `meta_message_id`. Failure → `failed` + `error_*` (the bubble then shows "Not sent · Retry").
- **Send template:** only `APPROVED` templates; map the UI's `{n}` placeholder to the template's real variable list; allowed outside the window (this is the only way to re-open a conversation). Marketing templates are billed — surface that to the admin before sending if it matters to the business.
- **Retry:** re-send the same row (same `client_ref`); never create a duplicate if the first attempt actually reached Meta (check `meta_message_id`).
- **Assign / unassign, close / reopen, mark unread, archive, block / unblock:** straightforward row updates + an event row + audit. Block should drop future inbound and hide the conversation; add a confirmation dialog and an unblock path somewhere (none exists in the UI — Settings page candidate).
- **Notes:** save debounced (~600 ms) and on blur; last-write-wins is acceptable, but avoid clobbering a teammate's edit silently if cheap.
- **Create CRM lead:** see §7.
- The view keeps **optimistic** rows: `send()` already inserts a `sending` row immediately — keep that, replace the timers with the action result, then let realtime (§6) drive `sent → delivered → read`. Revert to `failed` (not a silent removal) on action error.
- **AI / automation senders:** the UI already renders `source: "ai" | "auto"` bubbles ("AI", "Automation"). Nothing in this app produces them yet — decide whether automations (demo confirmation, invoice due, trial check-in, proposal follow-up) write into this same table through the managed number; gym reminders already go out that way (tenant `whatsapp_messages`), so decide whether platform-originated automations should be mirrored into this inbox's thread; if they send through another path they won't show here.

### 5. Message history, templates, usage pages (design rail only)
Out of scope for this UI pass. If built later they live under `/admin/whatsapp/*` and inherit the layout guard.

### 6. Realtime — follow the established pattern, not `postgres_changes`
Platform admins deliberately have no SELECT policy on tenant tables, and this inbox's tables should be the same (RPC-only). Use the Gym Details approach (`20260930120000_admin_gym_realtime.sql`, `src/core/realtime/*`):
- Statement-level triggers on `platform_wa_conversations` / `platform_wa_messages` / `platform_wa_events` calling a SECURITY DEFINER sender that emits a **content-free** private Broadcast `{t, op, n}` (no names, numbers or bodies) to a topic like `admin:whatsapp-inbox`; a `realtime.messages` SELECT policy using `public.is_platform_admin()` + topic match; no client INSERT policy; the sender swallows all exceptions so a Realtime problem can never fail a webhook insert.
- Client: `use-broadcast-channel` + the shared debounced refresh scheduler; an event refetches the list and, if it concerns the open conversation, its latest messages. Avoid refreshing the whole route on every inbound message — the thread has scroll position and an unsent draft; prefer a targeted refetch into the existing state. Do not interrupt a user who has scrolled up (show a "New messages" pill instead of jumping — not in the design, small addition).
- Replace `online` in `inbox-view.tsx` with the channel's connection state; reuse `LiveIndicator`'s wording ("Reconnecting…") if you add an indicator. The offline banner copy and Retry button already exist.
- The window countdown (`windowLeft`) needs a client timer (every 30–60 s) and a state flip to "Window expired" at zero without a refetch.
- Unread badge for the nav (§9) can use the same channel.

### 7. CRM linkage
- The Sales CRM (`/admin/sales`, `src/features/sales/*`) is **also UI-on-mock-data** — there is no leads table yet (see `docs/HANDOFF_BOOK_A_DEMO.md` §2 for the same dependency). Don't create a second lead store: this handoff and that one should land on the same table. Until it exists, the inbox's `crm` link and "Create CRM lead" can only be stubs.
- On inbound: match the sender to a lead by **normalized phone** (CRM stores a 10-digit Indian mobile; WhatsApp gives E.164 `91XXXXXXXXXX`; write one shared normalizer — there isn't one in `src`) and to a gym owner (`organizations`/`staff_memberships` phone) for the `org` line. Matching is server-side only.
- "Create CRM lead" (contact name + gym name from the panel): create the lead with **Source `WhatsApp`** — note `LEAD_SOURCES` in `features/sales/model.ts` currently has no WhatsApp entry (add it; coordinate with the CRM owner) — **Stage `New lead`**, owner = the conversation's assignee (or the pluggable default), and link `platform_wa_conversations.lead_id`. If the phone already matches a lead, link instead of duplicating (CRM has a `duplicateOf` / DuplicateModal flow to reuse).
- "View lead": `ContactPanel` links to `/admin/sales`; change to a deep link once the CRM can open a lead by id.
- Activity: a WhatsApp send/receive should show up in the lead's activity timeline (`ActivityKind` already has `"whatsapp"`). Sending from the inbox should also reset the lead's "last contacted".

### 8. Security / privacy
- Webhook: signature verification is mandatory (Option A already has it); ignore inbox handling for any `phone_number_id` other than `WHATSAPP_MANAGED_PHONE_NUMBER_ID`; never let a gym's own-WABA events into the platform tables.
- **Privacy of gym members' replies** (see §0): don't store or expose member message bodies to platform admins by default; classify and exclude.
- PII: phone numbers and message bodies are personal data — no logging of bodies/numbers (Vercel logs persist), no member-style masking toggle exists here (admins need the number to reply).
- Tokens/secrets: server env only; don't render them in `admin/settings/integrations`. That page's "Meta WhatsApp" card summarises tenant connections only — add a row for the managed number (configured? webhook subscription OK? FitDeskApp already records this via `recordManagedWebhookSubscriptionOutcome`).
- Enforcement is in actions + RPCs (`whatsapp.manage` writes, `whatsapp.view` reads), not just the layout guard.

### 9. Navigation (not done on purpose)
No entry was added to `src/app/admin/nav-items.ts` (the user said to ignore the sidebar). Add `{ href: "/admin/whatsapp/inbox", label: "WhatsApp inbox", icon: ConversationIcon, permission: "whatsapp.view" }` — decide whether it replaces or sits beside "WhatsApp credits" (`/admin/whatsapp-credits`), and whether it belongs in `MOBILE_NAV_HREFS`. Optional unread count badge via `getAdminChromeCounts` / realtime.

## Data contract notes (UI types → real shape)
- `Conversation.time`, `Conversation.first`, `Message.at`, `windowLeft` are **display strings** in the mock. Real data should send ISO timestamps and format on the client/server in **IST** (repo policy, `src/core/dates/ist.ts` — never device-local; `nowIst()` in `model.ts` already formats IST). List time rule in the design: today → `HH:mm`, this week → weekday, older → date; day separators ("Today", "Thu, 1 Oct") come from grouping by IST calendar day.
- `Conversation.name === null` means "not in contacts": list shows the number, panel shows "Not in contacts". Meta's `profile_name` can be offered as a suggested name in the create-lead form.
- `Message` ids must be stable and unique (React keys); the mock generates `{conversationId}-m{i}`.
- `MessageStatus` order is `sending < sent < delivered < read`; `failed` is terminal until Retry. The status label is only shown on the **last** outbound message, on `failed`, and on `sending` (design rule — keep).

## Testing checklist
1. Webhook GET handshake succeeds with the right token and fails otherwise; POST with a bad/missing signature is rejected before any DB write; replaying the same payload creates no duplicate message.
2. Inbound text from an unknown number → new conversation, unread 1, "Not in contacts", shows at the top of **Unread**; from a known lead/gym owner → name + CRM chip populated; **from a gym member replying to a gym reminder → classified as a member reply and not shown as a platform conversation** (per the §0 decision). Existing gym reminder delivery statuses and credit handling are unchanged after the FitDeskApp webhook change.
3. Open it → unread clears (and stays cleared after reload); selecting while another admin has it open updates both via realtime.
4. Reply inside the window → `sending → sent → delivered → read` follows real Meta callbacks; killing the network mid-send → `failed` + Retry succeeds **once** (no duplicate at Meta).
5. After 24 h with no inbound: composer flips to "24-hour reply window expired" **without a refresh**; free-text send is refused server-side even if the UI is bypassed; a template send is accepted and the window logic stays correct.
6. Assign / close / reopen / archive / block each write an audit row and a system line in the thread; a blocked number's later messages are dropped; a user with `whatsapp.view` but not `whatsapp.manage` can read but every write is refused server-side.
7. Search: name, `98201 44512`, `9820144512`, and a word from an old message all find the conversation; "No results" state and "Clear search" work; large inbox (10k conversations) stays fast.
8. Create CRM lead links the conversation, creates exactly one lead, and doesn't duplicate on an existing phone.
9. Mobile (375 px): list → chat → contact panel → back, no horizontal overflow, composer not hidden by the keyboard / bottom nav.
10. DEV vs PROD: switching environments shows each project's own conversations; nothing from one leaks into the other.

## Open product questions
- Shared vs per-admin unread (§1). Auto-reopen a closed conversation on a new inbound message? (§2)
- Should platform-originated automations/AI write into this inbox (§4)? Which of the managed WABA's templates may the inbox send?
- Member replies on the shared number (§0): hidden, bucketed, or shown? Who owns the answer to a member — the gym or the platform team?
- Receiver: extend FitDeskApp's webhook (A) or move the callback here (B) (§2)?
- Media (images/voice notes/documents) — needed at launch or follow-up (§2)?
- Where do unblock, template management and message history live (design rail pages not built) (§5)?
- Gyms on `own_waba` mode are out of scope; if the platform team ever needs to reach them it still goes through the managed number.
