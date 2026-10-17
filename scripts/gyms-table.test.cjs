/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS harness compiles and loads the actual TypeScript app modules. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const root = path.resolve(__dirname, "..");

// Compile the actual app modules without adding a test-runner dependency.
function load(file, mocks = {}) {
  const filename = path.join(root, file);
  const source = fs.readFileSync(filename, "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const m = new Module(filename, module);
  m.filename = filename;
  m.paths = Module._nodeModulePaths(path.dirname(filename));
  const original = m.require.bind(m);
  m.require = name => {
    if (name in mocks) return mocks[name];
    if (name.startsWith("@/") || name.startsWith(".")) {
      const target = name.startsWith("@/") ? path.join(root, "src", name.slice(2)) : path.resolve(path.dirname(filename), name);
      const file = [target, `${target}.ts`, `${target}.tsx`].find(p => fs.existsSync(p));
      if (file) return load(path.relative(root, file), mocks);
    }
    return original(name);
  };
  m._compile(compiled, filename);
  return m.exports;
}
const display = load("src/features/gyms/list-display.ts");
const now = new Date("2026-10-17T04:30:00Z");

test("subscription dates use IST days, the seven-day warning and real renewal mode", () => {
  assert.deepEqual(display.nextSubscriptionDate("2026-10-30T04:30:00Z", true, false, now), { label: "Trial ends", date: "30 Oct 2026", relative: "13 days left", tone: "neutral" });
  assert.equal(display.nextSubscriptionDate("2026-10-24T04:30:00Z", false, false, now).tone, "warning");
  assert.equal(display.nextSubscriptionDate("2026-10-25T04:30:00Z", false, false, now).tone, "neutral");
  assert.equal(display.nextSubscriptionDate("2026-10-17T10:30:00Z", false, false, now).relative, "Ends today");
  assert.equal(display.nextSubscriptionDate("2026-10-15T04:30:00Z", false, false, now).relative, "Expired 2 days ago");
  assert.equal(display.nextSubscriptionDate("2026-10-17T01:30:00Z", false, false, now).relative, "Expired today");
  assert.equal(display.nextSubscriptionDate(null, false, false, now).date, "—");
  assert.equal(display.nextSubscriptionDate("bad", false, false, now).relative, "Date unavailable");
  assert.equal(display.nextSubscriptionDate(null, false, false, now).label, "Subscription ends");
  assert.equal(display.nextSubscriptionDate(null, false, true, now).label, "Renewal due");
  assert.equal(display.nextSubscriptionDate(null, false, true, now, true).label, "Subscription ends");
  assert.equal(display.nextSubscriptionDate("2026-10-17T18:30:00Z", false, false, new Date("2026-10-17T18:29:00Z")).relative, "1 day left");
  assert.equal(display.trialDuration("2026-10-03T04:30:00Z", "2026-10-17T04:30:00Z"), "14-day trial");
  assert.equal(display.trialDuration(null, "2026-10-17T04:30:00Z"), "Duration unavailable");
});

test("member capacity distinguishes unlimited, missing, zero, capped and exceeded", () => {
  assert.deepEqual(display.memberUsage(63, null, true), { label: "63 members", note: "Unlimited", pct: null, over: false });
  assert.equal(display.memberUsage(63, null, false).note, "Limit unavailable");
  assert.equal(display.memberUsage(63, undefined, true).note, "Limit unavailable");
  assert.equal(display.memberUsage(63, 100, true).label, "63 / 100 members");
  assert.equal(display.memberUsage(63, 100, true).pct, 63);
  assert.deepEqual(display.memberUsage(0, 0, true), { label: "0 / 0 members", note: "No member capacity", pct: 0, over: false });
  assert.equal(display.memberUsage(3, 0, true).note, "3 over limit");
  assert.equal(display.memberUsage(120, 100, true).pct, 100);
  assert.equal(display.memberUsage(120, 100, true).note, "20 over limit");
});

test("expiry window includes the whole seventh IST day and excludes day eight", () => {
  assert.deepEqual(display.expiryWindow(now), { now: now.toISOString(), before: "2026-10-24T18:30:00.000Z" });
});

const { listGymsPage } = load("src/features/gyms/queries.ts", { "server-only": {} });
function client(rows, subscriptions = [], total = rows.length) {
  const calls = [];
  const result = { data: rows, error: null, count: total };
  const query = { then: (resolve) => Promise.resolve(result).then(resolve) };
  for (const method of ["in", "not", "gte", "lt", "order", "range"]) query[method] = (...args) => { calls.push([method, ...args]); return query; };
  return { calls, rpc: (...args) => { calls.push(["rpc", ...args]); return query; }, from: () => ({ select: () => ({ in: async () => ({ data: subscriptions, error: null }) }) }) };
}
const row = { organization_id: "gym-1", name: "Test gym", owner_name: "Owner", owner_email: "owner@example.com", city: "Pune", package_id: null, package_name: null, billing_period: null, price_minor: null, currency: "INR", state: "trialing", current_period_end: "2026-10-30T04:30:00Z", member_count: 63, member_cap: null, branch_count: 1, staff_count: 5, lifetime_paid_minor: 10000, created_at: "2020-01-01T00:00:00Z" };

test("trial labels use actual subscription dates and preserve financial formatting", async () => {
  const db = client([row], [{ organization_id: "gym-1", status: "trialing", current_period_start: "2026-10-16T04:30:00Z", auto_renew: false }]);
  const result = await listGymsPage(db, {});
  assert.equal(result.rows[0].packageName, "Free trial");
  assert.equal(result.rows[0].period, "14-day trial");
  assert.equal(result.rows[0].displayStatus, "Trial");
  assert.equal(result.rows[0].usage.note, "Limit unavailable");
  assert.equal(result.rows[0].ltv, "₹100");
  const missing = await listGymsPage(client([{ ...row, state: "read_only" }]), {});
  assert.equal(missing.rows[0].packageName, "No plan assigned");
  assert.equal(missing.rows[0].displayStatus, "No subscription");
});

test("database filters precede pagination and retain full-dataset search and sorting", async () => {
  const db = client([], [], 81);
  const result = await listGymsPage(db, { status: "expiring_soon", search: "owner@example.com", sortCol: "member_count", sortDir: "desc", packageId: "plan", billingPeriod: "monthly", minBranches: 2, offset: 25, limit: 25 });
  assert.equal(result.total, 81); // works even on an empty/out-of-range page
  const rpc = db.calls[0];
  assert.equal(rpc[2].p_limit, null);
  assert.equal(rpc[2].p_offset, 0);
  assert.equal(rpc[2].p_search, "owner@example.com");
  assert.equal(rpc[2].p_package_id, "plan");
  assert.equal(rpc[2].p_min_branches, 2);
  assert.deepEqual(rpc[3], { count: "exact" });
  assert.deepEqual(db.calls.find(c => c[0] === "in"), ["in", "state", ["active", "trialing"]]);
  assert.ok(db.calls.findIndex(c => c[0] === "lt") < db.calls.findIndex(c => c[0] === "range"));
  assert.deepEqual(db.calls.find(c => c[0] === "order"), ["order", "member_count", { ascending: false, nullsFirst: false }]);
  assert.deepEqual(db.calls.at(-1), ["range", 25, 49]);
  const expired = client([]);
  await listGymsPage(expired, { status: "expired" });
  assert.deepEqual(expired.calls.find(c => c[0] === "in"), ["in", "state", ["grace", "read_only"]]);
});
