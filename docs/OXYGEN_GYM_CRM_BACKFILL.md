# Oxygen Gym CRM backfill — 4 October 2026

The user requested that Oxygen Gym appear in CRM as an existing trial customer since 28 September, while preserving the customer's live account.

Applied to **production** (`clbphruocsqsmklmrloq`) through the authenticated Supabase SQL Editor. No development copy of the customer was created.

The CRM lead uses the existing organization and active owner's saved contact details: **The Oxygen Gym**, owner **Shaik Riyaz**, **Kadapa, Andhra Pradesh**, one active branch, and the `Under 100` member band (72 non-deleted members at import). Source is `Existing customer`, stage is `trial`, and the existing platform owner is assigned. The trial timestamps were copied exactly from the live subscription: **28 September 2026 through 28 October 2026**, in IST. The lead's original account-created timestamp is retained for historical reporting; the import activity and audit entry use the actual import time. No demo, contact attempt, paid conversion, or follow-up was invented.

[The guarded operation](../supabase/operations/oxygen_gym_crm_backfill.sql) is a data backfill, not a schema migration. It inserts only the shared CRM lead, timeline activity, assignment, and admin audit. It requires the production disaster-recovery environment and an active platform owner, and fails on conflicting CRM matches. Repeating the unchanged import is a no-op.

Verification passed within the transaction: the organization row and fingerprints of all public tables carrying this organization's `organization_id` (excluding the CRM lead store) were unchanged. There are no write triggers on the CRM tables. The operation does not invoke onboarding, subscription changes, tenant mutations, auth changes, or messaging.

After commit, a separate read-only transaction under the `authenticated` role called the app's `admin_sales_snapshot` RPC and returned exactly one Oxygen Gym lead with the expected trial dates, owner, location, and size. Initial execution stopped before any persistent writes because the environment guard used the app's `prod` label; the verified database value is `production`, and the delivered script uses that value.

View the entry in **Production → Sales CRM → All leads → Trial started**, or search for **Oxygen**. A Development session continues to show Development data.
