## Supabase migration naming

The user confirmed on 2026-10-01 that MyFitDesk repositories use serial migration numbers, not timestamp filenames. Inspect this repository's `supabase/migrations` and any apply scripts before choosing the next unused serial; the admin repository has its own `10xx` sequence. Use `<serial>_<descriptive_snake_case>.sql`. Do not reuse an assigned number, rename already-applied historical migrations, or edit remote migration history for a naming cleanup. Rename newly generated, unapplied CLI timestamp files to the repository convention and update all references/deliverables.

## Reserved migration numbers

`1020_admin_ist_calendar.sql` is assigned to the admin IST calendar audit (2026-10-02). Apply after the existing overview, member-support, and operations migrations; do not reuse 1020. The next new serial is 1021 unless another number is reserved later.

## Git delivery

The user confirmed on 2026-10-01 that admin changes go directly into `main`; do not create a `dev` branch here unless explicitly requested. The separate FitDeskApp web repository uses `dev` for development delivery.
