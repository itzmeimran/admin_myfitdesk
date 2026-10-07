## Supabase migration naming

The user confirmed on 2026-10-01 that MyFitDesk repositories use serial migration numbers, not timestamp filenames. Inspect this repository's `supabase/migrations` and any apply scripts before choosing the next unused serial; the admin repository has its own `10xx` sequence. Use `<serial>_<descriptive_snake_case>.sql`. Do not reuse an assigned number, rename already-applied historical migrations, or edit remote migration history for a naming cleanup. Rename newly generated, unapplied CLI timestamp files to the repository convention and update all references/deliverables.

## Reserved migration numbers

`1020_admin_ist_calendar.sql` is assigned to the admin IST calendar audit (2026-10-02). Apply after the existing overview, member-support, and operations migrations; do not reuse 1020. Inspect all reservations below before choosing the next serial.

`1021_book_demo_foundation.sql` is assigned to public Book Demo submissions, the shared `platform_sales_leads` / `platform_sales_activities` foundation, and demo availability (2026-10-04). CRM and WhatsApp inbox sessions must reuse this lead store, not create competing leads tables. Inspect migrations/apply again before allocating 1022 or later.

`1022_sales_crm.sql` is assigned to Sales CRM. `1023_platform_whatsapp_inbox.sql` is assigned to the managed-number inbox (2026-10-04); it depends on 1021 and 1022. Inspect migrations/apply before allocating 1024 or later.

`1025_sales_manual_leads_and_trial_flow.sql` is assigned to manual CRM lead entry and creating/linking trial gyms before paid conversion (2026-10-04). 1024 is already assigned to the WhatsApp active-staff fix; do not reuse either serial.

`1026_gym_owner_phone_otp.sql` is assigned to gym-owner phone invitations and WhatsApp OTP enrollment (2026-10-04). This shared-database migration also supplies FitDeskApp's phone enrollment RPCs; do not allocate a competing web migration for it.

## Admin action confirmation

User confirmed 2026-10-04: all user-triggered admin mutations require an explicit "Are you sure?" decision before the write, visible pending feedback, and duplicate-click prevention. Use the existing ConfirmDialog or ActionConfirmationProvider; mutation forms use ConfirmedForm. Preserve stronger typed confirmations for destructive/production actions. Navigation, search, filters, opening forms, and read-only refreshes do not need confirmation. Do not autosave editable CRM/inbox notes without an explicit confirmed Save.

## Git delivery

The user confirmed on 2026-10-01 that admin changes go directly into `main`; do not create a `dev` branch here unless explicitly requested. The separate FitDeskApp web repository uses `dev` for development delivery.
