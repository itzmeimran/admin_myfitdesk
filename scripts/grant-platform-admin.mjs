// Creates (or reuses) a Supabase Auth user and grants it platform admin
// access — the only way to populate platform_admins, by design: that table
// has no insert policy for any client role (see
// supabase/migrations/1001_platform_admins.sql), so provisioning an admin
// always goes through the service role, never through the app itself.
//
// Mirrors FitDeskApp's scripts/seed-demo.mjs pattern (same admin API call,
// same env-var-over-hardcoded-default shape). Safe to re-run: reuses the
// auth user if the email already exists, and re-activates (clears
// revoked_at on) the platform_admins row if one already exists for that
// user instead of erroring on the unique constraint.
//
// This app now has two Supabase projects (DEV and PROD — see
// core/config/environments.ts / the Settings page's environment switch),
// so this script needs to be told which one to grant access on. Defaults to
// dev; the live project is never touched unless you explicitly ask for it.
//
// Run:
//   node --env-file=.env.local scripts/grant-platform-admin.mjs
//
// Or override the target without touching .env.local:
//   GRANT_ADMIN_ENV=prod GRANT_ADMIN_EMAIL=you@example.com GRANT_ADMIN_PASSWORD='...' node --env-file=.env.local scripts/grant-platform-admin.mjs

import { createClient } from "@supabase/supabase-js";

const targetEnv = (process.env.GRANT_ADMIN_ENV ?? "dev").trim().toLowerCase();
if (targetEnv !== "dev" && targetEnv !== "prod") {
  console.error(`GRANT_ADMIN_ENV must be "dev" or "prod" (got "${targetEnv}")`);
  process.exit(1);
}

const envSuffix = targetEnv === "prod" ? "PROD" : "DEV";
const url = process.env[`NEXT_PUBLIC_SUPABASE_URL_${envSuffix}`];
const secretKey = process.env[`SUPABASE_SECRET_KEY_${envSuffix}`];

if (!url || !secretKey) {
  console.error(
    `Missing NEXT_PUBLIC_SUPABASE_URL_${envSuffix} or SUPABASE_SECRET_KEY_${envSuffix} in .env.local`,
  );
  process.exit(1);
}

console.log(`Target: ${targetEnv.toUpperCase()} (${url})`);

const EMAIL = process.env.GRANT_ADMIN_EMAIL;
const PASSWORD = process.env.GRANT_ADMIN_PASSWORD;

if (!EMAIL || !PASSWORD) {
  console.error("Missing GRANT_ADMIN_EMAIL or GRANT_ADMIN_PASSWORD");
  process.exit(1);
}

const supabase = createClient(url, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function findUserByEmail(email) {
  // Admin API has no direct "get by email" — page through until found.
  let page = 1;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => u.email === email);
    if (found) return found;
    if (data.users.length < 200) return null;
    page += 1;
  }
}

async function main() {
  let user = await findUserByEmail(EMAIL);

  if (!user) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: EMAIL,
      password: PASSWORD,
      email_confirm: true,
    });
    if (error) throw error;
    user = data.user;
    console.log("Created auth user:", EMAIL);
  } else {
    console.log("Auth user already exists:", EMAIL, "— reusing, password left unchanged");
  }

  // Upsert on user_id (the table's unique constraint) rather than insert,
  // so re-running this after a revoke re-activates the same row (clearing
  // revoked_at) instead of failing on the unique(user_id) constraint or
  // silently leaving the old row revoked.
  const { error: grantErr } = await supabase
    .from("platform_admins")
    .upsert(
      { user_id: user.id, email: EMAIL, revoked_at: null },
      { onConflict: "user_id" },
    );
  if (grantErr) throw grantErr;

  console.log("Granted platform admin access to:", EMAIL);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
