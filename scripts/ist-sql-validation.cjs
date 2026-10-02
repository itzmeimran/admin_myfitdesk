/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CommonJS harness accepts an optional external PostgreSQL test runtime. */
// Optional local SQL validation. Pass the path to an installed PGlite module;
// this creates an in-memory PostgreSQL database and never connects remotely.
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { PGlite } = require(process.argv[2] || "@electric-sql/pglite");
const root = path.resolve(__dirname, "..");
function extract(file, name) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  const start = source.toLowerCase().indexOf(`create or replace function ${name}(`);
  assert.ok(start >= 0, `Missing ${name}`);
  const end = source.indexOf("$$;", start);
  assert.ok(end > start);
  return source.slice(start, end + 3);
}
(async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create schema app;
      create role anon;
      create role authenticated;
      set check_function_bodies = off;
      create table public.organizations(id uuid, default_timezone text);
      create table public.organization_subscriptions(organization_id uuid);
      create table public.whatsapp_integrations(id uuid);
      create table public.platform_payments(status text, amount_minor bigint, paid_at timestamptz);
      create function app.is_platform_admin() returns boolean language sql as
        $$ select coalesce(current_setting('test.admin', true), 'false') = 'true' $$;
      create function app.current_environment() returns text language sql as $$ select 'development'::text $$;
    `);
    for (const name of ["admin_gym_members_support", "admin_gym_members_summary", "admin_gym_member_detail"]) {
      await db.exec(extract("supabase/migrations/20260930060142_admin_member_support_view.sql", `public.${name}`));
    }
    await db.exec(extract("supabase/migrations/1019_admin_gym_overview.sql", "public.admin_gym_overview"));
    await db.exec(extract("supabase/migrations/1002_admin_read_functions.sql", "public.admin_revenue_trend"));
    await db.exec(extract("supabase/migrations/20260930170100_gym_operations_reads.sql", "app.org_alert_candidates"));
    const configQuery = `select oid, proname, prosecdef, proacl::text, proconfig from pg_proc
      where proname in ('admin_gym_overview','admin_gym_members_support','admin_gym_members_summary','admin_gym_member_detail','admin_revenue_trend','org_alert_candidates') order by proname`;
    const before = (await db.query(configQuery)).rows;
    const migration = fs.readFileSync(path.join(root, "supabase/migrations/1020_admin_ist_calendar.sql"), "utf8");
    await db.exec(migration);
    await db.exec(migration); // Must also be safe to re-run manually.
    const after = (await db.query(configQuery)).rows;
    assert.equal(after.length, 6);
    for (let i = 0; i < before.length; i++) {
      assert.equal(after[i].oid, before[i].oid);
      assert.equal(after[i].prosecdef, before[i].prosecdef);
      assert.equal(after[i].proacl, before[i].proacl);
      assert.deepEqual(after[i].proconfig.filter(x => !/^timezone=/i.test(x)), before[i].proconfig);
    }
    await db.exec(fs.readFileSync(path.join(root, "supabase/verify/1020_admin_ist_calendar_verify.sql"), "utf8"));
    for (const zone of ["UTC", "America/Los_Angeles", "Asia/Kolkata"]) {
      await db.exec(`set timezone = '${zone}'; set test.admin = 'true';`);
      const result = await db.query(`select count(*)::int as count, max(week_start)::text as last,
        (date_trunc('week', now() at time zone 'Asia/Kolkata'))::date::text as expected from public.admin_revenue_trend(12)`);
      assert.equal(result.rows[0].count, 12);
      assert.equal(result.rows[0].last, result.rows[0].expected);
    }
    await db.exec(`set test.admin = 'false'`);
    for (const call of [
      "public.admin_gym_overview('00000000-0000-0000-0000-000000000001')",
      "public.admin_gym_members_summary('00000000-0000-0000-0000-000000000001')",
      "public.admin_gym_members_support('00000000-0000-0000-0000-000000000001')",
      "public.admin_gym_member_detail('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002')",
    ]) await assert.rejects(db.query(`select * from ${call}`), error => error.code === '42501');
    assert.equal((await db.query("select count(*)::int as count from public.admin_revenue_trend(12)")).rows[0].count, 0);
    console.log("SQL validation passed: original function bodies, idempotency, IST boundaries, weekly buckets in three session timezones, preserved ACL/search_path/security, and non-admin rejection.");
  } finally { await db.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
