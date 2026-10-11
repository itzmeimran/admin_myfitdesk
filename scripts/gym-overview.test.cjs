/* eslint-disable @typescript-eslint/no-require-imports -- Compile the real module, as the other harnesses do. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const Module = require("node:module");

const file = path.resolve(__dirname, "../src/features/gyms/overview-rules.ts");
const out = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = new Module(file, module);
m.filename = file;
m._compile(out, file);
const r = m.exports;

const now = new Date("2026-10-11T06:00:00Z");
const daysAgo = (d) => new Date(now.getTime() - d * 86_400_000).toISOString();
const wa = (o = {}) => ({ connectionStatus: null, connectionError: null, lastSenderMode: null, balance: 500, lowCreditThreshold: null, failedMonth: 0, stuckCount: 0, paused: false, failureRate: null, sent30d: 0, lastSuccessAt: null, ...o });
const facts = (o = {}) => ({ gymId: "g1", now, suspended: false, daysToExpiry: 30, subscriptionLabel: "Subscription", hasQueuedPackage: false, whatsapp: wa(), restrictions: [], jobsFailed: 0, jobsDegraded: 0, reconciliationIssues: 0, reconciliationCritical: 0, openAlerts: 0, criticalAlerts: 0, dataHealthIssues: 0, ownerLastActiveAt: daysAgo(1), ownerNeverSignedIn: false, gymAgeDays: 90, usage: [], ...o });
const ids = (items) => items.map((i) => i.id);

test("a gym with no real problems has no issues", () => {
  assert.deepEqual(r.buildAttentionItems(facts()), []);
});

test("a gym that never connected its own number is not flagged as disconnected", () => {
  assert.deepEqual(ids(r.buildAttentionItems(facts({ whatsapp: wa({ connectionStatus: null, lastSenderMode: null }) }))), []);
  assert.deepEqual(ids(r.buildAttentionItems(facts({ whatsapp: wa({ connectionStatus: "disconnected", lastSenderMode: "managed" }) }))), []);
});

test("an own-number gym that disconnected or errored is flagged, managed with a stale config only warns", () => {
  assert.ok(ids(r.buildAttentionItems(facts({ whatsapp: wa({ connectionStatus: "disconnected", lastSenderMode: "own_waba" }) }))).includes("wa-own-disconnected"));
  const own = r.buildAttentionItems(facts({ whatsapp: wa({ connectionStatus: "error", lastSenderMode: "own_waba", connectionError: "token expired" }) }));
  assert.equal(own[0].id, "wa-own-error");
  assert.equal(own[0].severity, "critical");
  const managed = r.buildAttentionItems(facts({ whatsapp: wa({ connectionStatus: "error", lastSenderMode: "managed" }) }));
  assert.equal(managed[0].id, "wa-own-config");
  assert.equal(managed[0].severity, "warning");
});

test("sender resolution", () => {
  assert.equal(r.resolveSender({ connectionStatus: "connected", lastSenderMode: "managed" }).kind, "own");
  assert.equal(r.resolveSender({ connectionStatus: null, lastSenderMode: null }).kind, "managed");
  assert.equal(r.resolveSender({ connectionStatus: "disconnected", lastSenderMode: "managed" }).kind, "managed");
});

test("issues are ordered critical first, then by importance", () => {
  const items = r.buildAttentionItems(facts({
    daysToExpiry: 3,
    whatsapp: wa({ balance: 0, failedMonth: 2, sent30d: 100, failureRate: 2 }),
    openAlerts: 1,
  }));
  assert.deepEqual(ids(items), ["wa-credits-zero", "subscription-ending", "wa-failed", "alerts"]);
});

test("every issue carries a real action link for this gym", () => {
  const items = r.buildAttentionItems(facts({ suspended: true, daysToExpiry: -4, whatsapp: wa({ paused: true, stuckCount: 2, failedMonth: 3, balance: 0 }), jobsFailed: 1, reconciliationIssues: 1, openAlerts: 2, dataHealthIssues: 1 }));
  assert.ok(items.length >= 8);
  for (const item of items) {
    assert.ok(item.action.label.length > 0);
    assert.match(item.action.href, /^\/admin\/gyms\/g1(\/|$)/);
  }
});

test("stuck messages and the degraded queue job are counted once", () => {
  const items = r.buildAttentionItems(facts({ whatsapp: wa({ stuckCount: 3 }), jobsDegraded: 1 }));
  assert.deepEqual(ids(items), ["wa-stuck"]);
  const both = r.buildAttentionItems(facts({ whatsapp: wa({ stuckCount: 3 }), jobsDegraded: 2 }));
  assert.deepEqual(ids(both), ["wa-stuck", "jobs"]);
});

test("a queued package silences the expiring warning but not an overdue one", () => {
  assert.deepEqual(ids(r.buildAttentionItems(facts({ daysToExpiry: 2, hasQueuedPackage: true }))), []);
  assert.deepEqual(ids(r.buildAttentionItems(facts({ daysToExpiry: -2, hasQueuedPackage: true }))), ["subscription-overdue"]);
});

test("plan-limit and owner-activity issues", () => {
  const items = r.buildAttentionItems(facts({ usage: [{ label: "Members", used: 95, cap: 100 }, { label: "Staff", used: 3, cap: 20 }, { label: "Branches", used: 1, cap: null }], ownerLastActiveAt: daysAgo(20) }));
  assert.deepEqual(ids(items), ["cap-members", "owner-inactive"]);
  assert.deepEqual(ids(r.buildAttentionItems(facts({ ownerNeverSignedIn: true, gymAgeDays: 1 }))), []);
  assert.deepEqual(ids(r.buildAttentionItems(facts({ ownerNeverSignedIn: true, gymAgeDays: 10 }))), ["owner-never"]);
});

test("WhatsApp status needs delivery evidence", () => {
  assert.equal(r.deriveWhatsAppStatus(wa({ lastSuccessAt: daysAgo(1) }), now).state, "working");
  assert.equal(r.deriveWhatsAppStatus(wa({ lastSuccessAt: daysAgo(40) }), now).state, "idle");
  assert.equal(r.deriveWhatsAppStatus(wa(), now).state, "unused");
  assert.equal(r.deriveWhatsAppStatus(wa({ lastSuccessAt: daysAgo(1), balance: 0 }), now).state, "attention");
  assert.equal(r.deriveWhatsAppStatus(wa(), now).sender.kind, "managed");
});

const ev = (o = {}) => ({ configured: true, tracked: true, failuresRecent: 0, lastRunAt: null, lastSuccessAt: null, cadenceHours: null, hasUpcoming: false, ...o });

test("health: an old successful run is not healthy", () => {
  assert.equal(r.classifyHealth(ev({ lastRunAt: daysAgo(90), lastSuccessAt: daysAgo(90) }), now).state, "none_due");
  assert.equal(r.classifyHealth(ev({ lastRunAt: daysAgo(2), lastSuccessAt: daysAgo(2) }), now).state, "healthy");
});

test("health: missing data is unknown, not zero failures", () => {
  assert.equal(r.classifyHealth(ev({ tracked: false }), now).state, "unknown");
  assert.equal(r.classifyHealth(ev({ cadenceHours: 24 }), now).state, "unknown");
});

test("health: cadence jobs go stale, not-configured and failures", () => {
  assert.equal(r.classifyHealth(ev({ cadenceHours: 24, lastRunAt: daysAgo(0.5), lastSuccessAt: daysAgo(0.5) }), now).state, "healthy");
  assert.equal(r.classifyHealth(ev({ cadenceHours: 24, lastRunAt: daysAgo(5), lastSuccessAt: daysAgo(5) }), now).state, "attention");
  assert.equal(r.classifyHealth(ev({ configured: false }), now).state, "not_configured");
  assert.equal(r.classifyHealth(ev({ failuresRecent: 2, lastRunAt: daysAgo(1), lastSuccessAt: daysAgo(1) }), now).state, "attention");
  assert.equal(r.classifyHealth(ev({ hasUpcoming: true }), now).state, "none_due");
});

test("member counts: distinct people can't exceed total, and a mismatch is reported not clamped", () => {
  assert.deepEqual(r.checkMemberCounts({ total: 160, active: 150, expiringSoon: 8, expired: 6, noPlan: 4, newThisMonth: 5 }), { consistent: true, problem: null });
  const bad = r.checkMemberCounts({ total: 160, active: 161, expiringSoon: 0, expired: 0, noPlan: 0, newThisMonth: 0 });
  assert.equal(bad.consistent, false);
  assert.match(bad.problem, /161/);
  assert.equal(r.checkMemberCounts({ total: 10, active: 3, expiringSoon: 5, expired: 0, noPlan: 0, newThisMonth: 0 }).consistent, false);
});

test("activity groups only by a shared member id, never by time", () => {
  assert.equal(r.sharedGroupKey({ memberId: "m1", groupCount: 3 }), "m1");
  assert.equal(r.sharedGroupKey({ memberId: "m1", groupCount: 1 }), null);
  assert.equal(r.sharedGroupKey({ memberId: null, groupCount: 4 }), null);
});

test("contact links", () => {
  assert.equal(r.telHref("+91 98765-43210"), "tel:+919876543210");
  assert.equal(r.telHref("098765 43210"), "tel:09876543210");
  assert.equal(r.telHref("12"), null);
  assert.equal(r.telHref(null), null);
  assert.equal(r.mailHref(" owner@gym.in "), "mailto:owner@gym.in");
  assert.equal(r.mailHref("not an email"), null);
});
