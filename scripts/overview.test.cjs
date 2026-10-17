/* eslint-disable @typescript-eslint/no-require-imports -- Uses the project's existing TypeScript component harness. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), Module = require("node:module"), ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { createClient } = require("@supabase/supabase-js");

function load(relative, mocks = {}) {
  const file = path.resolve(__dirname, "..", relative), m = new Module(file, module);
  m.filename = file; m.paths = module.paths;
  m.require = id => {
    if (id === "server-only") return {};
    if (Object.hasOwn(mocks, id)) return mocks[id];
    if (id.startsWith("@/") || id.startsWith(".")) {
      const base = id.startsWith("@/") ? path.resolve(__dirname, "../src", id.slice(2)) : path.resolve(path.dirname(file), id);
      const target = [".ts", ".tsx"].map(ext => base + ext).find(fs.existsSync);
      if (target) return load(path.relative(path.resolve(__dirname, ".."), target), mocks);
    }
    return require(id);
  };
  m._compile(ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, file);
  return m.exports;
}
const model = load("src/features/overview/model.ts");
const now = new Date("2026-10-17T04:30:00Z");
const gym = extra => ({ organization_id: "gym", name: "Test gym", state: "active", member_count: 63, branch_count: 1, member_cap: 100, branch_cap: 1, created_at: "2026-10-16T14:09:34Z", ...extra });
const subscription = extra => ({ organization_id: "gym", package_id: "annual", status: "active", current_period_start: "2026-09-29T04:28:39Z", current_period_end: "2027-09-29T04:28:39Z", grace_days: 7, ...extra });
const pkg = extra => ({ id: "annual", plan_id: "standard", name: "Standard", price_minor: 718800, currency: "INR", duration_days: 365, ...extra });
const payment = extra => ({ id: "receipt", organization_id: "gym", package_id: "annual", amount_minor: 531912, currency: "INR", status: "succeeded", paid_at: "2026-09-20T11:16:37Z", created_at: "2026-09-20T11:16:06Z", period_start: "2026-09-29T04:28:39Z", period_end: "2027-09-29T04:28:39Z", refunded_minor: "0", pricing_review_required: false, ...extra });
function build(extra = {}) { return model.buildOverview({ gyms: [gym()], subscriptions: [subscription()], packages: [pkg()], currentPayments: [payment()], periodPayments: [], attempts: [], stuckOrders: 0, webhooks: { total: 0, signatureFailures: 0, processingFailures: 0 }, period: "month", now, ...extra }); }

test("MRR uses actual calendar billing duration, including annual, quarterly and month-end coverage", () => {
  assert.equal(model.normalizeMonthly(718800, "2026-01-01T00:00:00Z", "2027-01-01T00:00:00Z"), 59900);
  assert.equal(model.normalizeMonthly(718800, "2024-01-01T00:00:00Z", "2025-01-01T00:00:00Z"), 59900);
  assert.equal(model.normalizeMonthly(179700, "2026-01-01T00:00:00Z", "2026-04-01T00:00:00Z"), 59900);
  assert.equal(model.normalizeMonthly(59900, "2026-01-31T00:00:00Z", "2026-02-28T00:00:00Z"), 59900);
  assert.equal(model.normalizeMonthly(59900, "2026-01-30T18:30:00Z", "2026-02-27T18:30:00Z"), 59900); // Jan 31 → Feb 28 in IST.
  assert.equal(model.normalizeMonthly(718800, "2024-02-28T18:30:00Z", "2025-02-27T18:30:00Z"), 59900); // Leap-day anniversary in IST.
  assert.equal(model.normalizeMonthly(40000, "2026-01-01T00:00:00Z", "2026-02-10T00:00:00Z"), 30437);
  for (const [amount, start, end] of [[-1, "2026-01-01", "2027-01-01"], [100, null, "2027-01-01"], [100, "bad", "2027-01-01"], [100, "2027-01-01", "2027-01-01"]]) assert.equal(model.normalizeMonthly(amount, start, end), null);
});

test("current MRR preserves settled discounted price and ignores current catalogue/other receipts", () => {
  const data = build();
  assert.equal(data.mrrMinor, 44326); // ₹5,319.12 / 12, not ₹7,188 or 30/365.
  assert.equal(data.payingGyms, 1);
  assert.equal(data.plans[0].mrrMinor, data.mrrMinor);
  assert.equal(model.currentPrice(subscription(), [payment(), payment({ id: "future", package_id: "different", amount_minor: 59900 })]).amountMinor, 44326);
});

test("missing, duplicate, refunded or pricing-review evidence is unavailable instead of catalogue-based MRR", () => {
  for (const currentPayments of [[], null, [payment(), payment({ id: "duplicate" })], [payment(), payment({ id: "reviewed-duplicate", pricing_review_required: true })], [payment({ refunded_minor: 100 })], [payment({ pricing_review_required: true })], [payment({ period_start: "2026-09-30T00:00:00Z" })]]) {
    const data = build({ currentPayments });
    assert.equal(data.mrrMinor, null); assert.equal(data.plans[0].mrrMinor, null); assert.equal(data.missingPrices, 1);
  }
});

test("MRR total reconciles exactly with plan contributions and excludes trials, cancellation and read-only", () => {
  const gyms = [gym(), gym({ organization_id: "monthly" }), gym({ organization_id: "trial", state: "trialing" }), gym({ organization_id: "cancelled", state: "cancelled" }), gym({ organization_id: "expired", state: "read_only" })];
  const subscriptions = [subscription(), subscription({ organization_id: "monthly", package_id: "monthly", current_period_start: "2026-10-01T00:00:00Z", current_period_end: "2026-11-01T00:00:00Z" }), subscription({ organization_id: "trial", status: "trialing", package_id: null }), subscription({ organization_id: "cancelled", status: "cancelled" }), subscription({ organization_id: "expired" })];
  const data = build({ gyms, subscriptions, packages: [pkg(), pkg({ id: "monthly", plan_id: "other", name: "Other", price_minor: 19900, duration_days: 30 })], currentPayments: [payment(), payment({ organization_id: "monthly", package_id: "monthly", amount_minor: 19900, period_start: "2026-10-01T00:00:00Z", period_end: "2026-11-01T00:00:00Z" })] });
  assert.equal(data.payingGyms, 2); assert.equal(data.mrrMinor, 64226);
  assert.equal(data.plans.reduce((sum, row) => sum + row.mrrMinor, 0), data.mrrMinor);
  assert.equal(data.plans.find(row => row.name === "Free trial").mrrMinor, 0);
});

test("collections use paid-at IST boundaries and preserve gross/refund-cohort/net semantics", () => {
  const periodPayments = [payment({ id: "before", paid_at: "2026-09-30T18:29:59Z" }), payment({ id: "start", paid_at: "2026-09-30T18:30:00Z", amount_minor: 10000 }), payment({ id: "partial", paid_at: "2026-10-01T08:00:00Z", amount_minor: 20000, refunded_minor: "5000" }), payment({ id: "refunded", status: "refunded", paid_at: "2026-10-02T08:00:00Z", amount_minor: 30000, refunded_minor: null }), payment({ id: "future", paid_at: "2026-10-18T08:00:00Z" }), payment({ id: "failed", status: "failed", paid_at: "2026-10-03T08:00:00Z" }), payment({ id: "one-time", package_id: null, paid_at: "2026-10-03T08:00:00Z" })];
  const data = build({ periodPayments });
  assert.equal(data.collections.grossMinor, 60000); assert.equal(data.collections.refundsMinor, 35000); assert.equal(data.collections.netMinor, 25000);
  assert.equal(data.collections.buckets.reduce((sum, row) => sum + row.amountMinor, 0), 60000);
  assert.equal(data.collections.buckets[0].from, "2026-09-30T18:30:00.000Z");
});

test("date periods change collections/grouping but leave current snapshots and recent gyms unchanged", () => {
  const receipts = [payment(), payment({ id: "oct", paid_at: "2026-10-03T00:00:00Z", amount_minor: 10000 })];
  const views = ["month", "quarter", "year"].map(period => build({ period, periodPayments: receipts }));
  assert.deepEqual(views.map(data => data.collections.grossMinor), [10000, 10000, 541912]);
  assert.deepEqual(views.map(data => data.grouping), ["daily", "weekly", "monthly"]);
  assert.deepEqual(views.map(data => data.mrrMinor), [44326, 44326, 44326]);
  assert.ok(views.every(data => data.totalGyms === 1 && data.recentCount === 1));
  for (const data of views) assert.equal(data.collections.buckets.reduce((sum, row) => sum + row.amountMinor, 0), data.collections.grossMinor);
});

test("unavailable collection reads and mixed currencies never become a misleading zero", () => {
  assert.equal(build({ periodPayments: null }).collections.grossMinor, null);
  const data = build({ periodPayments: [payment({ paid_at: now.toISOString() }), payment({ id: "usd", paid_at: now.toISOString(), currency: "USD" })] });
  assert.equal(data.collections.grossMinor, null); assert.equal(data.collections.error, true);
  assert.equal(model.recordedRefund(payment({ refunded_minor: 99999999 })), null);
  const overflow = build({ periodPayments: [payment({ paid_at: now.toISOString(), amount_minor: Number.MAX_SAFE_INTEGER }), payment({ id: "overflow", paid_at: now.toISOString(), amount_minor: Number.MAX_SAFE_INTEGER })] });
  assert.equal(overflow.collections.grossMinor, null);
});

test("follow-ups include only imminent trials, deduplicate overdue states and order by urgency", () => {
  const gyms = [gym({ organization_id: "trial", state: "trialing" }), gym({ organization_id: "later", state: "trialing" }), gym({ organization_id: "grace", state: "grace" }), gym({ organization_id: "read", state: "read_only" })];
  const subs = [subscription({ organization_id: "trial", status: "trialing", current_period_end: "2026-10-24T18:29:59Z" }), subscription({ organization_id: "later", status: "trialing", current_period_end: "2026-10-24T18:30:00Z" }), subscription({ organization_id: "grace", current_period_end: "2026-10-16T18:30:00Z" }), subscription({ organization_id: "read", current_period_end: "2026-10-01T18:30:00Z" })];
  const rows = model.buildFollowUps(gyms, subs, [], now);
  assert.deepEqual(rows.map(row => row.organizationId), ["read", "grace", "trial"]);
  assert.equal(rows.filter(row => row.organizationId === "grace").length, 1);
  assert.match(rows.at(-1).reason, /Trial ending soon/);
});

test("failed payment retries collapse and a later settlement closes the issue", () => {
  const failures = [payment({ id: "fail1", status: "failed", created_at: "2026-10-10T00:00:00Z" }), payment({ id: "fail2", status: "failed", created_at: "2026-10-11T00:00:00Z" })];
  assert.equal(model.buildFollowUps([gym()], [], failures, now).length, 1);
  const settledLater = payment({ id: "settled", created_at: "2026-10-09T00:00:00Z", paid_at: "2026-10-12T00:00:00Z" });
  assert.equal(model.buildFollowUps([gym()], [], [...failures, settledLater], now).length, 0);
  assert.equal(model.buildFollowUps([gym()], [], [payment({ status: "failed", created_at: "2026-10-18T00:00:00Z" })], now).length, 0);
});

test("capacity at one permitted branch is neutral; zero and unlimited bars are omitted", () => {
  const data = build({ gyms: [gym(), gym({ organization_id: "over", branch_count: 2 }), gym({ organization_id: "zero", member_count: 0, member_cap: 0, branch_count: 0, branch_cap: 0 }), gym({ organization_id: "unlimited", member_cap: null, branch_cap: null })] });
  assert.equal(data.capacity.length, 2);
  assert.equal(data.capacity.find(row => row.organizationId === "gym").over, false);
  assert.equal(data.capacity.find(row => row.organizationId === "gym").detail, "Branch limit reached · 1 of 1");
  assert.equal(data.capacity[0].over, true);
});

test("recent gyms use IDs and seven IST calendar days, even with duplicate names", () => {
  const data = build({ gyms: [gym({ organization_id: "one", created_at: "2026-10-10T18:30:00Z" }), gym({ organization_id: "two", created_at: "2026-10-16T00:00:00Z" }), gym({ organization_id: "before", created_at: "2026-10-10T18:29:59Z" }), gym({ organization_id: "future", created_at: "2026-10-18T00:00:00Z" })] });
  assert.equal(data.recentCount, 2); assert.deepEqual(data.recentGyms.map(row => row.id), ["two", "one"]);
});

test("query layer pages directory snapshots beyond PostgREST limits and applies collection dates in SQL", async () => {
  const requests = [];
  const db = createClient("https://example.supabase.co", "test", { global: { fetch: async (url, options) => {
    const request = new URL(url); requests.push(request);
    if (options.method === "HEAD") return new Response(null, { headers: { "content-range": "0-0/0" } });
    let data = [];
    if (request.pathname.endsWith("admin_gym_directory")) {
      const offset = Number(request.searchParams.get("offset") ?? 0);
      data = Array.from({ length: offset === 0 ? 500 : 1 }, (_, index) => gym({ organization_id: `gym-${offset + index}` }));
    }
    return new Response(JSON.stringify(data), { headers: { "content-type": "application/json" } });
  } } });
  const { getOverviewData } = load("src/features/overview/queries.ts");
  const result = await getOverviewData(db, "month", null, now);
  assert.equal(result.totalGyms, 501);
  assert.equal(requests.filter(url => url.pathname.endsWith("admin_gym_directory")).length, 2);
  const query = requests.find(url => url.searchParams.has("paid_at"));
  assert.ok(query.search.includes("2026-09-30T18%3A30%3A00.000Z"));
  assert.ok(requests.every(url => !url.pathname.includes("admin_package_mix") && !url.pathname.includes("admin_revenue_trend")));
});

test("webhook monitoring checks permissions before constructing an elevated client", async () => {
  let created = false;
  const { getOverviewMonitoring } = load("src/app/admin/_server/overview-monitoring.ts", {
    "@/core/auth/access": { getAdminAccess: async () => null, hasPermission: () => false },
    "@/core/db/service-client": { createServiceClient: async () => { created = true; } },
  });
  assert.equal(await getOverviewMonitoring(now), null); assert.equal(created, false);
});

test("webhook totals are actual privileged HEAD counts, not inferred from successful deliveries", async () => {
  const requests = [];
  let missingCounts = false;
  const db = createClient("https://example.supabase.co", "test", { global: { fetch: async (url, options) => {
    requests.push(new URL(url)); assert.equal(options.method, "HEAD");
    return new Response(null, { headers: missingCounts ? {} : { "content-range": "0-0/0" } });
  } } });
  const { getOverviewMonitoring } = load("src/app/admin/_server/overview-monitoring.ts", {
    "@/core/auth/access": { getAdminAccess: async () => ({}), hasPermission: () => true },
    "@/core/db/service-client": { createServiceClient: async () => db },
  });
  assert.deepEqual(await getOverviewMonitoring(now), { total: 0, signatureFailures: 0, processingFailures: 0 });
  assert.equal(requests.length, 3);
  assert.ok(requests.every(url => url.pathname.endsWith("payment_provider_events") && url.searchParams.get("select") === "id" && url.searchParams.has("received_at")));
  assert.ok(requests.some(url => url.searchParams.get("processing_error") === "not.is.null"));
  missingCounts = true;
  assert.equal(await getOverviewMonitoring(now), null);
});

test("a current-price read error preserves other sections and surfaces unavailable MRR", async () => {
  const db = createClient("https://example.supabase.co", "test", { global: { fetch: async (url, options) => {
    const request = new URL(url), table = request.pathname.split("/").at(-1);
    if (options.method === "HEAD") return new Response(null, { headers: { "content-range": "0-0/0" } });
    if (table === "platform_payments" && request.searchParams.has("organization_id")) return new Response(JSON.stringify({ code: "42703", message: "Price evidence unavailable" }), { status: 400, headers: { "content-type": "application/json" } });
    const rows = table === "admin_gym_directory" ? [gym()] : table === "organization_subscriptions" ? [subscription()] : table === "platform_packages" ? [pkg()] : [];
    return new Response(JSON.stringify(rows), { headers: { "content-type": "application/json" } });
  } } });
  const { getOverviewData } = load("src/features/overview/queries.ts");
  const data = await getOverviewData(db, "month", null, now);
  assert.equal(data.totalGyms, 1); assert.equal(data.mrrMinor, null); assert.equal(data.collections.grossMinor, 0);
  assert.ok(data.notices.some(note => note.includes("Current subscription receipts could not be loaded")));
});

test("overview renders ordered metrics, useful empty states and an honest zero-webhook message", () => {
  const mocks = {
    "next/link": ({ children, ...props }) => React.createElement("a", props, children),
    "./NavigationPending": { PendingLink: ({ children, pendingChildren, ...props }) => { void pendingChildren; return React.createElement("a", props, children); } },
    "@/components/NavigationPendingContent": { NavigationPendingContent: ({ children }) => children },
  };
  const { OverviewView } = load("src/app/admin/overview-view.tsx", mocks);
  const html = renderToStaticMarkup(React.createElement(OverviewView, { data: build(), permissions: { gyms: true, revenue: true, packages: true } }));
  const labels = ["Total gyms", "Paying gyms", "Monthly recurring revenue", "Collections"];
  assert.ok(labels.every((label, i) => i === 0 || html.indexOf(label) > html.indexOf(labels[i - 1])));
  assert.match(html, /No accounts need attention today/);
  assert.match(html, /No webhook events in the last 24 hours/);
  assert.match(html, /No subscription payments collected in October/);
  assert.match(html, /Branch limit reached · 1 of 1/);
  assert.doesNotMatch(html, /No package \(trialing\)|Needs attention today|Accounts at risk|Not implemented yet/);
  assert.equal((html.match(/Manage packages/g) ?? []).length, 1);
});
