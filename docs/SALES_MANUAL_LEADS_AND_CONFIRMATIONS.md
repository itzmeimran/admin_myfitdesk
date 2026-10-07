# Manual CRM leads and confirmed admin actions — 4 October 2026

Includes the manual CRM lead flow and confirmed admin actions. Before using it in a deployed environment, verify that migration 1025 is installed and the admin deployment contains these changes.

In Sales CRM, use **Add lead** for field marketing, phone calls, referrals and other manual sources. Gym name, contact name, mobile, city and state are required. Email and size estimates can be unknown. New leads belong to the person entering them and use the shared CRM store. Matching phone/email opens the visible existing lead without overwriting it; an out-of-scope match requires a manager. Repeated submission of the same request creates one lead/history/assignment.

**Save lead** opens the saved lead. **Save & create gym** saves the lead after confirmation, then opens gym setup for review. Creating the trial gym and sending its owner invitation require a separate confirmation and owner email. CRM copies the actual subscription trial dates and keeps follow-ups open. Linking an existing trial account changes CRM only. **Confirm paid conversion** checks the linked subscription is active, unexpired and on a paid package before stopping follow-ups. Closed leads and unresolved duplicates must be resolved first. No existing customer rows are backfilled by 1025.

The admin layout now supplies a shared confirmation dialog for persisted actions. CRM commands (including priority), mutation forms, package and credit changes, subscription controls, notes, invitations, backup controls, inbox commands/sends and environment changes ask for an explicit decision. Existing stronger typed/action dialogs remain in place. Cancellation performs no action. Async writes show pending feedback and disable repeated confirmation. Keyboard form submission is confirmed; Cancel receives initial focus and confirmation focus is trapped. Editable inbox notes use an explicit Save instead of autosave. Navigation, searches, filters and read-only refreshes stay immediate. Viewing an inbox thread still updates its read receipt as part of reading it.

The Oxygen Gym production CRM backfill is a separate completed operation: [verification record](OXYGEN_GYM_CRM_BACKFILL.md). This feature migration does not modify that gym's live data, trial subscription or CRM history.

Validation: TypeScript checks, focused touched-file lint, five CRM calculation/validation/confirmation tests, six shared button checks, and isolated PostgreSQL checks for permission denial, scope, duplicate reuse, request replay, trial creation/linking, real subscription dates, retained follow-ups, paid-only conversion, and unchanged existing organization/subscription fixtures. A browser preview using the actual components and mocked Server Actions verified Cancel, Enter-to-confirm, pending/disabled controls, manual lead creation and the separately confirmed trial flow. No real invitation or WhatsApp message was sent during verification.

Activation order:

1. Take and verify a pre-migration backup for each target environment using the repository's existing backup procedure.
2. Apply [1025](../supabase/migrations/1025_sales_manual_leads_and_trial_flow.sql) after the installed CRM/inbox migrations. Do not reapply historical migrations or change remote history.
3. Run [read-only schema checks](../supabase/apply/1025_verify.sql) in both environments. In DEV, run [the rollback runtime check](../supabase/apply/1025_runtime_verify.sql) against the installed onboarding helper. It fingerprints existing tenant data and sends no messages.
4. Deliver the admin changes to `itzmeimran/admin_myfitdesk` on `main`, then check the signed-in CRM and one harmless confirmed save in DEV. PROD customer verification must be read-only.

The local SQL fixture uses an onboarding stub; the prepared DEV runtime check is needed to verify the deployed onboarding helper before live activation. Existing 1022 verification is historical and includes the former trial-move behavior; use 1025 verification for the new flow.
