/* eslint-disable @typescript-eslint/no-require-imports -- Compile actual app modules, as in the existing IST harness. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const root = path.resolve(__dirname, "..");
const cache = new Map();
let groupAccess = { ok: true };
let groupClient;
function load(file) {
  const filename = path.join(root, file);
  if (cache.has(filename)) return cache.get(filename);
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const m = new Module(filename, module);
  m.filename = filename;
  m.paths = Module._nodeModulePaths(path.dirname(filename));
  const original = m.require.bind(m);
  m.require = name => {
    if (name === "server-only") return {};
    if (name === "@/core/auth/access") return { checkPermission: async () => groupAccess };
    if (name === "@/core/db/server-client") return { createClient: async () => groupClient };
    if (name.startsWith("@/") || name.startsWith(".")) {
      const target = name.startsWith("@/") ? path.join(root, "src", name.slice(2)) : path.resolve(path.dirname(filename), name);
      const file = [`${target}.ts`, `${target}.tsx`, target].find(p => fs.existsSync(p) && fs.statSync(p).isFile());
      if (file) return load(path.relative(root, file));
    }
    return original(name);
  };
  m._compile(compiled, filename);
  cache.set(filename, m.exports);
  return m.exports;
}
const f = load("src/features/gyms/ops/timeline-format.ts");
const { getTimeline, sanitizeTimelineEvent } = load("src/features/gyms/ops/queries.ts");
const tz = "Asia/Kolkata";
const org = "00000000-0000-4000-8000-000000000001";
const member = "00000000-0000-4000-8000-000000000002";
const event = overrides => ({ eventId: "audit:1", source: "audit", occurredAt: "2026-10-09T05:00:00Z", actionKey: "payments.update", operation: "UPDATE", entityType: "payments", entityId: member, actorId: null, actorLabel: "Actor not recorded", actorRole: "unknown", actorType: "unknown", category: "payments", status: "success", memberId: null, memberName: null, amountMinor: 150000, currency: "INR", oldValues: {}, newValues: {}, changedFields: null, detail: null, requestId: null, ipAddress: null, origin: "Gym app", recordName: null, recordExists: false, memberExists: false, memberDeleted: false, ...overrides });

test("deletion request, cancellation and completed deletion have distinct titles", () => {
  const e = event({ entityType: "organizations", actionKey: "organizations.update", oldValues: { deletion_requested_at: null }, newValues: { deletion_requested_at: "2026-10-09T05:00:00Z" } });
  assert.equal(f.eventTitle(e), "Gym deletion requested");
  assert.equal(f.eventEmphasis(e), "Deletion request");
  assert.equal(f.eventTitle({ ...e, operation: "DELETE", newValues: null }), "Gym deletion completed");
  assert.equal(f.eventTitle({ ...e, oldValues: e.newValues, newValues: e.oldValues }), "Gym deletion cancelled");
  assert.equal(f.eventTitle(event({ actionKey: "organization.deletion_requested", operation: null })), "Gym deletion requested");
});

test("invoice-only assignment is distinguishable from payment edits and voids", () => {
  const e = event({ oldValues: { invoice_number: null, updated_at: "old" }, newValues: { invoice_number: "INV-1", updated_at: "new" } });
  assert.equal(f.eventTitle(e), "Invoice number assigned");
  assert.equal(f.eventTitle({ ...e, newValues: { ...e.newValues, amount_minor: 200000 } }), "Payment updated");
  assert.equal(f.eventTitle(event({ oldValues: { voided_at: null }, newValues: { voided_at: "2026-10-09T05:00:00Z" } })), "Payment voided");
  assert.equal(f.eventEmphasis(event({ entityType: "staff_memberships", oldValues: { role: "staff" }, newValues: { role: "owner" } })), "Access change");
});

test("photo changes collapse duplicate fields and survive boundary redaction", () => {
  for (const [before, after, expected] of [[null, "private/a.webp", "Profile photo added"], ["private/a.webp", "private/b.webp", "Profile photo changed"], ["private/a.webp", null, "Profile photo removed"]]) {
    const e = sanitizeTimelineEvent(event({ entityType: "members", oldValues: { avatar_path: before, avatar_url: before }, newValues: { avatar_path: after, avatar_url: after } }));
    assert.equal(f.eventTitle(e), expected);
    assert.deepEqual(f.changeHighlights(e, tz), [expected]);
    assert.equal(f.fieldChanges(e, tz).changes.length, 1);
    assert.doesNotMatch(JSON.stringify(e), /private\//);
  }
});

test("readable diffs preserve before/after amounts and dates, hide technical fields", () => {
  const e = event({ oldValues: { amount_minor: 100050, start_date: null, member_id: "old", unknown_internal: "old" }, newValues: { amount_minor: 150025, start_date: "2026-10-09", member_id: "new", unknown_internal: "new" } });
  const changes = f.fieldChanges(e, tz).changes;
  assert.deepEqual(changes.map(c => c.key), ["amount_minor", "start_date"]);
  assert.equal(changes[0].before, "₹1,000.50");
  assert.equal(changes[0].after, "₹1,500.25");
  assert.equal(changes[1].before, "Not set");
  assert.match(changes[1].after, /9 Oct 2026/);
  assert.match(f.exactTime(e.occurredAt, tz), /10:30:00.*IST \(UTC\+05:30\)/);
  assert.equal(f.exactTime("invalid", tz), "Time not recorded");
});

test("credentials, nested secrets, tokens, photo paths and signed URLs are hidden", () => {
  const raw = { password: "do-not-send", access_token: "do-not-send", nested: [{ secret: "do-not-send", note: "Bearer abc123 https://private.example/photo?X-Amz-Signature=secret" }], avatar_path: "private/photo.webp", avatar_url: "https://private.example/photo?token=123" };
  const safe = JSON.stringify(f.sanitizeAuditValue(raw));
  assert.doesNotMatch(safe, /do-not-send|abc123|private\.example|private\/photo|X-Amz|token=123/);
  assert.match(safe, /Photo set/);
  const e = sanitizeTimelineEvent(event({ detail: raw, oldValues: raw, newValues: raw, memberName: "https://private.example?token=123" }));
  assert.doesNotMatch(JSON.stringify(e), /private\.example|do-not-send/);
});

test("links require live organization-scoped records, deleted snapshots still have names", () => {
  const e = event({ memberId: member, memberName: "Kai Green", memberExists: true, memberDeleted: true });
  assert.match(f.eventRecordLink(e, org).href, /roster=deleted/);
  assert.equal(f.eventRecordLink({ ...e, memberExists: false }, org), null);
  assert.equal(f.eventRecordLink(e, "invalid"), null);
  assert.match(f.eventSubject(event({ entityType: "members", oldValues: { first_name: "Kai", last_name: "Green" }, newValues: null, memberName: null }), tz), /Kai Green/);
  assert.equal(f.roleLabel("unknown"), "Role not recorded");
  assert.equal(f.sourceLabel("Platform admin"), "Admin panel");
});

test("full dataset filters and pagination reach the RPC; total survives an empty page", async () => {
  let call;
  const client = { rpc: async (name, args) => { call = { name, args }; return { data: { rows: [], total: 81 }, error: null }; } };
  const result = await getTimeline(client, org, { search: "Kai", actorSearch: "Imran", actorType: "owner", category: "members", status: "success", from: "2026-10-01T00:00:00+05:30", to: "2026-10-09T23:59:59.999+05:30" }, 25, 100);
  assert.equal(result.total, 81);
  assert.deepEqual(result.rows, []);
  assert.equal(call.name, "admin_gym_activity");
  assert.equal(call.args.p_actor_search, "Imran");
  assert.equal(call.args.p_search, "Kai");
  assert.equal(call.args.p_offset, 100);
  assert.equal(call.args.p_category, "members");
  assert.equal(call.args.p_sort_dir, "desc");
});

test("each original event has a keyboard disclosure; routine entries render safely", () => {
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const { TimelineFeed } = load("src/app/admin/gyms/[id]/activity/timeline-feed.tsx");
  const e = sanitizeTimelineEvent(event({ entityType: "members", oldValues: { avatar_path: null }, newValues: { avatar_path: "private/a.webp", token: "never-show" }, actorLabel: "Former or unavailable user" }));
  const html = renderToStaticMarkup(React.createElement(TimelineFeed, { events: [e, { ...e, eventId: "audit:2" }], organizationId: org, timeZone: tz, initialNow: "2026-10-09T05:05:00Z" }));
  assert.equal((html.match(/aria-expanded="false"/g) ?? []).length, 2);
  assert.equal((html.match(/aria-controls="activity-audit-/g) ?? []).length, 2);
  assert.match(html, /View details/);
  assert.match(html, /Former or unavailable user/);
  assert.doesNotMatch(html, /private\/a|never-show/);
});

test("a member group is one entry and requests all original events independently", async () => {
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const { TimelineFeed } = load("src/app/admin/gyms/[id]/activity/timeline-feed.tsx");
  const grouped = event({ memberId: member, memberName: "Kai Green", groupCount: 4, groupPlan: "Monthly membership", groupAmountMinor: 150000 });
  const html = renderToStaticMarkup(React.createElement(TimelineFeed, { events: [grouped], organizationId: org, timeZone: tz, initialNow: "2026-10-09T05:05:00Z" }));
  assert.equal((html.match(/<li/g) ?? []).length, 1);
  assert.match(html, /Kai Green activity/);
  assert.match(html, /View 4 related events/);
  assert.match(html, /Monthly membership/);
  assert.match(html, /aria-expanded="false"/);
  let call;
  groupClient = { rpc: async (name, args) => { call = { name, args }; return { data: { rows: [], total: 4, event_total: 4 }, error: null }; } };
  const { loadActivityGroup } = load("src/app/admin/gyms/[id]/activity/actions.ts");
  const result = await loadActivityGroup(org, member, { actorSearch: "Asha", category: "payments" }, 25);
  assert.equal(result.error, null);
  assert.equal(call.args.p_member_id, member);
  assert.equal(call.args.p_group_by_member, false);
  assert.equal(call.args.p_actor_search, "Asha");
  assert.equal(call.args.p_category, "payments");
  assert.equal(call.args.p_offset, 25);
  groupAccess = { ok: false, error: "Denied" };
  assert.equal((await loadActivityGroup(org, member, {}, 0)).error, "Denied");
  groupAccess = { ok: true };
  assert.equal((await loadActivityGroup(org, "invalid", {}, 0)).error, "Invalid activity filters.");
});
