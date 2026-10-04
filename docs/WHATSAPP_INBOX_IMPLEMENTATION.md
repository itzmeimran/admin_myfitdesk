# Managed WhatsApp inbox implementation — 2026-10-04

The existing inbox UI now uses persistent, permission-gated database reads and writes. Migration **1023_platform_whatsapp_inbox.sql** extends the shared CRM store from 1021/1022. It has not been applied to either remote project in this session.

The user explicitly approved an additive change to **FitDeskApp’s existing webhook** on 2026-10-04. Its callback URL remains unchanged. The new `src/app/api/webhooks/whatsapp/platform-inbox.ts` consumer runs after the existing raw-body signature check. No cross-app HTTP forwarding or new Meta account is needed.

## Implemented behavior

- Conversation list, global counts, active WhatsApp operators and cursor-paginated threads come from curated RPCs. Search matches contact/gym names, normalized numbers and indexed message words. All displays use IST; write payloads use UTC instants.
- Assign/unassign, shared read/unread, close/reopen, archive/restore, block/unblock, versioned notes and CRM linking persist and are audited. Notes save after 600 ms or blur; a teammate’s newer version refuses an overwrite. `/admin/whatsapp/hidden` provides restore/unblock controls.
- Text sends require an open conversation and a live 24-hour inbound window, checked by SQL at reservation time. Outbound templates require a database allow-list entry **and live Meta approval**; supported shapes are text-only with no variables or one first-name body variable. Unsupported headers/buttons/variables are excluded.
- Each send has a durable client UUID and an atomic reservation. Repeating that reference does not dispatch again. Known pre-acceptance failures may retry the same row. A timeout, unparseable response, HTTP 5xx or lost acknowledgement waits for delivery evidence; it is never automatically resent. Meta’s `biz_opaque_callback_data` is `wa-inbox:<message UUID>`, allowing a signed status callback to recover a lost send response.
- `read`/`delivered` evidence never regresses on late status callbacks. A known accepted message is never resent by Retry. If Meta reports a later delivery failure, an operator can compose a new message deliberately.
- Sends never use the gym queue, debit gym credits or trigger their refunds. The existing gym status path remains in place. Inbox cost accounting is a follow-up; the credits page continues to report gym-attributed usage.
- Closed/archived conversations reopen on a fresh inbound message. Duplicate inbound Meta IDs do not increment unread counts. Blocked numbers’ later inbound messages are dropped. Non-text messages retain their type and a placeholder; no media downloads or attachment sends are implemented.
- Privacy classification runs **before content persistence**. A phone matching any managed gym outbound or a non-deleted member is excluded entirely, even if it also matches a CRM contact. Otherwise match CRM leads and gym contacts/staff; unmatched numbers are platform conversations. This conservative rule avoids exposing member content but can exclude someone who is both a lead/owner and a member. No member-content bucket was added.
- Content-free private Broadcast events invalidate the targeted list/thread without remounting the composer. Read permission is checked through a narrow wrapper because the existing Settings permission helper is private. The shared refresh scheduler now coalesces multiple stable targets so a shell refresh cannot replace an inbox refresh.
- The client updates the reply-window countdown every 30 seconds and resets its state when the selected DEV/PROD environment changes. The inbox sits alongside WhatsApp credits in navigation. CRM links open the specific lead through `?lead=<UUID>` and still obey CRM scope checks.

## Database and CRM contract

All four inbox tables have enabled/forced RLS and no client table grants. Admin RPCs check `whatsapp.view` or `whatsapp.manage`; create/link-lead additionally checks `sales.manage` and existing-lead visibility. Webhook/finish RPCs are service-role only. Audits and Broadcast payloads exclude message bodies, notes and phone numbers.

CRM lead creation reuses the exact `platform-sales-phone:` advisory identity lock from Book Demo. An existing unambiguous visible lead is linked; multiple independent matches require CRM duplicate resolution. New leads use Source `WhatsApp`, Stage `new`, and an eligible assigned salesperson or the shared default owner. Migration 1023 permits missing email/city and `Unknown` size fields **only for WhatsApp leads**, rather than inventing email addresses or gym sizes. Website Demo constraints remain enforced. Lead contact timestamps update only after evidence of Meta acceptance, not after a rejected reservation.

## Activation in DEV

1. Verify that the target is **Development (`pgedlnxuuelmtpmbkdwm`)**, and apply 1021, 1022, then [1023](../supabase/migrations/1023_platform_whatsapp_inbox.sql) manually in its SQL Editor. Existing platform settings and the current tenant schema are prerequisites. Leave historical migration filenames/history intact.
2. Run [1023_verify.sql](../supabase/apply/1023_verify.sql) after the earlier verification files. It checks RLS, RPC/table privileges and the Broadcast policy; it is not a substitute for runtime acceptance with a real admin.
3. Configure the admin deployment’s **server-only** `WHATSAPP_MANAGED_WABA_ID_DEV`, `WHATSAPP_MANAGED_PHONE_NUMBER_ID_DEV`, `WHATSAPP_MANAGED_ACCESS_TOKEN_DEV` (or `WHATSAPP_SYSTEM_USER_TOKEN_DEV`). They must match the managed sender used by the tenant deployment attached to this same DEV project. Set `META_GRAPH_API_VERSION` consistently with that deployment. Never point DEV at the live production number just to make a test pass.
4. Keep FitDeskApp’s existing `WHATSAPP_MANAGED_*`, `META_APP_SECRET` and `META_VERIFY_TOKEN` configuration and callback URL. Deploy its additive bridge to **dev**, after the schema. A missing 1023 RPC preserves the previous gym behavior during rollout; other inbox write errors produce HTTP 503 for Meta retries.
5. The template allow-list is empty by default. Review actual platform templates first, then insert approved `(name, language)` pairs into `platform_wa_template_allowlist` using the SQL Editor. Do not copy the gym reminder catalogue wholesale. Example (substitute a real reviewed template):

   ```sql
   insert into public.platform_wa_template_allowlist(name,language)
   values ('your_reviewed_platform_template','en') on conflict(name,language) do update set enabled=true;
   ```

6. With a signed-in DEV admin, exercise real inbound/replay, search, pagination, assignment, notes, close/reopen, CRM link, read/unread, archive/restore, block/unblock, and readonly access. Verify a text send and approved-template send with a controlled test recipient, then real `delivered`/`read` callbacks and an expired-window rejection. Confirm member replies are excluded and gym reminder statuses/refunds still work. Real message sending needs an explicitly authorized test recipient.

PROD (`clbphruocsqsmklmrloq`) uses the `_PROD` credential set and requires the user’s explicit application/deployment go-ahead. This session did not apply SQL remotely, change the Meta callback, send a real WhatsApp message, commit or push either repository.

## Verification in this session

- Both repositories’ TypeScript checks and focused lint checks pass.
- `npm run test:whatsapp-inbox`: eight focused tests cover action permission/validation boundaries, one-dispatch reservations, uncertain HTTP/network outcomes, callback correlation, template shape/approval filtering and IST/window logic.
- `node scripts/test-whatsapp-inbox-db.mjs <path-to-@electric-sql/pglite/dist/index.js>` executes migrations 1021–1023 and every new SQL path on fixture rows as authenticated admin/viewer/non-admin and service roles. Checks include RLS, private-helper Broadcast permissions, member exclusion, inbound deduplication, cursor/search, mutations/note conflicts, CRM idempotency, contact timestamps, uncertain-send recovery and monotonic statuses. It also executes the delivered 1023 schema verification file. No remote database is contacted.
- FitDeskApp: `node --test scripts/test-platform-whatsapp-inbox.cjs` covers signature/handshake rejection, managed/own-WABA separation, media placeholders, callback recovery, unchanged gym writes, missing-schema rollout and retryable DB errors. Its existing `test:whatsapp-managed` passes all 25 checks.
- A browser attempt against the actual admin route was blocked at startup by this checkout’s missing `NEXT_PUBLIC_SUPABASE_*_DEV/PROD` values. No authentication bypass or permanent preview route was added. A signed-in browser pass, responsive interaction check, live Graph calls, realtime socket delivery and remote role checks remain pending activation. Full builds/regression suites were deferred per the user’s development-testing preference.

## Follow-ups

Attachment upload/playback, richer template parameter forms, platform AI/automation producers, per-admin unread state and separate platform cost reporting remain outside this implementation. Blocked messages are not retained for replay. Ambiguous sends with no eventual callback require operator investigation; automatic retries would risk duplicate messages.
