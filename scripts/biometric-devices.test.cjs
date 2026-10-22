/* eslint-disable @typescript-eslint/no-require-imports -- Compile the real module, as the other harnesses do. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const Module = require("node:module");

const file = path.resolve(__dirname, "../src/features/smart-access/devices.ts");
const out = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = new Module(file, module);
m.filename = file;
m._compile(out, file);
const r = m.exports;

const now = new Date("2026-10-22T06:00:00Z");
const ago = (ms) => new Date(now.getTime() - ms).toISOString();
const MIN = 60_000;
const branches = new Map([["b1", "Main"], ["b2", "Second"]]);

test("a serial is normalised to the form the database stores", () => {
  assert.equal(r.normalizeSerial("  nyu7252101091 "), "NYU7252101091");
});

test("serial problems are said in words, and a good serial has none", () => {
  assert.equal(r.serialProblem("NYU7252101091"), null);
  assert.equal(r.serialProblem(" nyu-7252_101091 "), null, "spaces and case are forgiven");
  assert.equal(r.serialProblem(""), "Enter the device serial.");
  assert.equal(r.serialProblem("   "), "Enter the device serial.");
  assert.match(r.serialProblem("NYU 725"), /letters, digits/);
  assert.match(r.serialProblem("NYU/725"), /letters, digits/);
  assert.match(r.serialProblem("x".repeat(65)), /at most 64/);
});

test("history titles are plain, and an unknown event still reads", () => {
  assert.equal(r.historyTitle("serial_changed"), "Serial changed");
  assert.equal(r.historyTitle("unlinked"), "Unlinked");
  assert.equal(r.historyTitle("something_new"), "Changed");
});

test("a serial change reads as from → to", () => {
  const lines = r.historyChanges({ event: "serial_changed", details: { serial: { from: "OLD1", to: "NEW2" } } }, branches);
  assert.deepEqual(lines, ["Serial: OLD1 → NEW2"]);
});

test("a move names both branches, and a branch that no longer exists is never shown as an id", () => {
  assert.deepEqual(r.historyChanges({ event: "moved", details: { branch_id: { from: "b1", to: "b2" } } }, branches), ["Branch: Main → Second"]);
  assert.deepEqual(r.historyChanges({ event: "moved", details: { branch_id: { from: "gone-id", to: "b2" } } }, branches), ["Branch: another branch → Second"]);
});

test("several changes in one entry are one line each, in a fixed order", () => {
  const lines = r.historyChanges(
    { event: "disabled", details: { label: { from: "Gate", to: "Entrance" }, status: { from: "active", to: "disabled" } } },
    branches,
  );
  assert.deepEqual(lines, ["Status: Active → Disabled", "Name: Gate → Entrance"]);
});

test("a cleared name reads as none, not as an empty gap", () => {
  assert.deepEqual(r.historyChanges({ event: "relabelled", details: { label: { from: "Gate", to: null } } }, branches), ["Name: Gate → none"]);
});

test("a link and an unlink list what the device was", () => {
  assert.deepEqual(
    r.historyChanges({ event: "linked", details: { serial: "NYU1", branch_id: "b1", label: "Front door" } }, branches),
    ["Serial: NYU1", "Branch: Main", "Name: Front door"],
  );
  assert.deepEqual(r.historyChanges({ event: "unlinked", details: { serial: "NYU1", branch_id: "b1", label: null } }, branches), ["Serial: NYU1", "Branch: Main"]);
});

test("relative time reads naturally and never goes negative", () => {
  assert.equal(r.relativeTime(null, now), null);
  assert.equal(r.relativeTime("garbage", now), null);
  assert.equal(r.relativeTime(ago(20_000), now), "just now");
  assert.equal(r.relativeTime(ago(5 * MIN), now), "5 min ago");
  assert.equal(r.relativeTime(ago(3 * 60 * MIN), now), "3 h ago");
  assert.equal(r.relativeTime(ago(30 * 60 * MIN), now), "yesterday");
  assert.equal(r.relativeTime(ago(5 * 24 * 60 * MIN), now), "5 days ago");
  assert.equal(r.relativeTime(new Date(now.getTime() + 5 * MIN).toISOString(), now), "just now", "a clock slightly ahead is not 'in the future'");
  assert.match(r.relativeTime(ago(90 * 24 * 60 * MIN), now), /2026/);
});

test("device status: never connected, connected, not connected, disabled", () => {
  assert.deepEqual(r.deviceStatusView({ status: "active", lastSeenAt: null }, now), { label: "Never connected", detail: "Waiting for the device to contact MyFitDesk.", tone: "idle" });
  assert.equal(r.deviceStatusView({ status: "active", lastSeenAt: ago(MIN) }, now).label, "Connected");
  assert.equal(r.deviceStatusView({ status: "active", lastSeenAt: ago(MIN) }, now).tone, "ok");
  const stale = r.deviceStatusView({ status: "active", lastSeenAt: ago(10 * MIN) }, now);
  assert.equal(stale.label, "Not connected");
  assert.equal(stale.detail, "Last contact 10 min ago");
  const off = r.deviceStatusView({ status: "disabled", lastSeenAt: ago(MIN) }, now);
  assert.equal(off.label, "Disabled");
  assert.equal(off.tone, "off");
});

test("unclaimed serials are newest contact first, and the input is not reordered in place", () => {
  const input = [
    { serial: "A", firmware: null, firstSeenAt: ago(9 * MIN), lastSeenAt: ago(8 * MIN) },
    { serial: "B", firmware: null, firstSeenAt: ago(5 * MIN), lastSeenAt: ago(1 * MIN) },
  ];
  assert.deepEqual(r.sortUnclaimed(input).map((d) => d.serial), ["B", "A"]);
  assert.deepEqual(input.map((d) => d.serial), ["A", "B"]);
});

test("devices group by gym", () => {
  const device = (id, org) => ({ id, organizationId: org });
  const grouped = r.groupDevicesByGym([device("1", "g1"), device("2", "g2"), device("3", "g1")]);
  assert.deepEqual(grouped.get("g1").map((d) => d.id), ["1", "3"]);
  assert.deepEqual(grouped.get("g2").map((d) => d.id), ["2"]);
  assert.equal(grouped.get("g3"), undefined);
});
