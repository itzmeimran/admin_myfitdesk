# Owner account details and collection months — 17 October 2026

Gym settings previously labelled the optional `organizations.contact_email` as
verification evidence. It now reads the selected owner membership and its auth
identity: the login email has its own confirmation status, and the associated
mobile shows recorded verification or WhatsApp OTP availability. Internal phone
login email aliases are hidden. Missing lookup data shows verification unavailable.
Custom OTP `consumed_at` is not proof of success: resends, delivery failures and
lockouts also consume codes. No authentication flags are changed.

The Account section now has first/last name editing through ConfirmedForm,
SubmitButton and a `gyms.manage` RPC. Reads require `gyms.view`. Both RPCs scope
the owner membership to the supplied gym; name changes and the admin audit entry
share one transaction. Names refresh in the gym header and directory.

A2 Fitness's production owner membership was corrected to **Syed Noor Ahamed**
on 17 October; the database trigger recorded audit entry 2155. The existing login
email was confirmed, and the membership mobile supports WhatsApp OTP.

`1033_admin_owner_profile.sql` was installed in DEV and PROD using explicit project
references. `supabase/apply/1033_verify.sql` passed in both projects (admin-context
reads and unchanged-name calls, rolled back). Historical migration records were
left intact. Security advisors flag the two new authenticated-callable definer
functions as expected; both enforce platform permissions and deny anonymous calls.

Gym directory sort triangles are explicitly 12px, dark grey, and hidden until
the header is hovered or contains keyboard focus. Their space stays reserved,
and accessible sorting state and URL parameters are preserved.

Collections now embeds the shared DatePicker's new month mode. Its year grid
selects complete past months; the current month ends today in IST, and future
months are disabled. Selection applies both existing custom-range URL endpoints
together, preserves other parameters and resets pagination. Existing collection
queries, refunds, daily buckets and current platform snapshots retain their logic.

Validation: TypeScript, touched-file lint, isolated owner-account SQL checks,
and 24 overview/IST tests passed. Focused cases cover permission and tenant
isolation, name validation, atomic audit, internal aliases, ambiguous mobile
numbers, leap years, month boundaries and receipt/refund reconciliation. The
temporary component preview compiled and returned HTTP 200, then was removed.
Interactive browser verification was unavailable because the browser webview
could not attach. No full build or comprehensive regression suite was run.
