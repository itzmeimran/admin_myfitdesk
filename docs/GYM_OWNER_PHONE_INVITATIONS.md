# Gym owner email or phone invitations

The Onboard gym form offers email invitation or phone with WhatsApp OTP. Phone mode requires the owner's name and mobile number; email and password are not required. Indian local numbers normalize to +91. International numbers require their country code. Both invitation methods use the tenant application's canonical URL for the admin's selected environment.

Creation saves the gym, subscription and pending owner invitation in the existing shared onboarding transaction. Owner membership is created only after OTP verification. The owner opens **Continue with WhatsApp**, enters their registered phone and selects **I already have a code** to enter the admin-sent OTP. Later sign-ins request a fresh OTP. The existing Android OTP API uses the same enrollment and session logic.

Admin sends and resends require the existing Are you sure confirmation. Resend renews the invitation for seven days and sends a fresh code. Codes expire after five minutes, allow five failed attempts, are stored only as HMAC hashes, and can be consumed once. OTP requests retain the existing phone/IP rate limits and 30-second resend cooldown. An expired or revoked invitation cannot enroll even with an otherwise valid code. Revocation invalidates outstanding codes. Accepted invitations cannot be resent or revoked; normal access controls handle an active owner. A disabled membership cannot be reactivated through login.

Delivery failure preserves the gym and shows an actionable warning. Resend or the owner's own OTP request can recover an interrupted Auth provisioning call. Internal Auth email identifiers are not contact email addresses and are hidden from owner and admin contact displays. A phone-only owner can save gym settings without email; changing the login number requires support rather than a nonexistent password.

## Rollout

1. Back up the intended database using the existing project process. Apply **1026_gym_owner_phone_otp.sql** after 1022 and the shared FitDeskApp 0089 WhatsApp auth foundation. The reserved 1025 CRM migration is independent. This is one shared database migration; no separate web serial is required.
2. Run **supabase/apply/1026_verify.sql** against that same project. The new service-only identity-link and enrollment RPCs must deny both anon and authenticated callers.
3. Deploy FitDeskApp to **dev** with `/api/admin/gym-owner/phone-otp` and the shared OTP updates, then deploy the admin app to **main**. Deploying the updated OTP verifier before the migration would disable OTP login until the RPC is available.
4. The admin sends its current Supabase user JWT only to `https://dev.myfitdesk.app` for dev or `https://www.myfitdesk.app` for production. The tenant endpoint verifies that JWT and `gyms.manage` in its own project. OTP hashing and the managed WhatsApp sender remain in FitDeskApp, so no duplicated pepper or Meta token is required in the admin app. If Vercel protection covers dev, configure the admin's server-only `MYFITDESK_AUTOMATION_BYPASS_DEV` with the existing dev automation bypass token.
5. Smoke-test one approved test recipient: invite, enter code, verify owner access, sign out, sign in with a fresh code, and check the admin status. Do not claim real delivery from the fixture checks alone.

## Local verification

`node scripts/test-owner-phone-db.mjs` runs the real migration and existing gym-creation SQL in isolated PostgreSQL fixtures, using FitDeskApp's installed PGlite and citext extension. It checks permissions, pending enrollment, duplicates, activation, repeat login, disabled access, expiry, resend, revoke, re-invite and unchanged email invitation behavior.

In FitDeskApp, `node scripts/test-mobile-login.mjs` covers the shared verifier and cookie/native adapters, including invalid/expired/consumed codes and denied activation without issuing a session. Use `npm run typecheck` in both repositories. These checks create no remote accounts and send no real WhatsApp messages.
