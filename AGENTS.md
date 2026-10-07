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

## Reusable button and focus styling

User confirmed 2026-10-07: every visible action button must have an icon; link buttons are exempt. Use Button, SubmitButton or AsyncButton and the shared Lucide icon vocabulary. Custom card/control layouts may embed an always-visible icon; invisible dismiss backdrops are not visible action buttons. Keep hover and press feedback in the shared styles, subtle, and respectful of reduced-motion settings. Focus should turn the control's own border rust rather than draw an outside ring. Show the environment badge once in the header.

User confirmed 2026-10-07: button action labels use sentence case ("Save changes"), never forced uppercase or title case. Preserve proper names and acronyms such as WhatsApp, MyFitDesk, CRM, CSV and OTP, and preserve user-provided record names. Use only primary (main CTA), secondary (supporting/bordered action), text (inline action), and ghost (quiet toolbar, menu or navigation action) variants. Disabled and pending are shared states of every variant, not extra variants. Destructive actions use `tone="danger"` with primary or secondary as appropriate. `layout="control"` and `layout="content"` only arrange compound widgets; `layout="overlay"` is reserved for invisible dismiss targets. Keep casing, interaction feedback and disabled styling in the shared button system.

## Reusable filters and date controls

User confirmed 2026-10-07: reuse MyFitDesk controls across the admin platform. `src/components/Select.tsx`, `DatePicker.tsx` and `TimePicker.tsx` are ported from FitDeskApp, with shared admin buttons and IST. `Dropdown` is a compatibility adapter over Select; URL filters use it or `DateRangeFilter`. Use `PeriodSelector` for preset period groups and DatePicker range mode for custom ranges. Do not add native select/date/time inputs or one-off calendars. Preserve query parameters, reset pagination on filter changes, apply range endpoints together, and retain booking/scheduling constraints.

User clarified 2026-10-07: calendar date cells display plain date numbers, matching MyFitDesk. Do not put calendar icons beside individual dates. These cells in the shared DatePicker are exempt from the action-button icon rule; the calendar trigger and month navigation retain their icons.
