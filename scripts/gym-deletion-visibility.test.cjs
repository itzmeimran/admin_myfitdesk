/* eslint-disable @typescript-eslint/no-require-imports -- Match the existing TypeScript test harnesses. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

function load(relative, mocks = {}) {
  const file = path.resolve(__dirname, "..", relative);
  const m = new Module(file, module);
  m.filename = file;
  m.paths = module.paths;
  m.require = id => Object.hasOwn(mocks, id) ? mocks[id] : require(id);
  m._compile(ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, file);
  return m.exports;
}
const { deletionDisplay, deletionStages } = load("src/features/gyms/deletion-display.ts");
const icons = load("src/core/ui/icons.ts");
const row = (extra = {}) => ({ id: "job", organizationId: "gym", gymName: "Fitlife", gymCode: "FF-1026A", city: "Kadapa", ownerName: "Mohammad", actorName: "Mohammad", actorRole: "owner", requestedAt: "2026-10-09T05:41:50Z", purgeAfter: "2026-10-16T05:41:50Z", completedAt: null, databaseDeletedAt: null, state: "quarantined", hasError: false, gymExists: true, reason: "Owner deletion request", ...extra });

test("checks gyms.view before creating an elevated database client", async () => {
  let created = false;
  const { getGymDeletions } = load("src/app/admin/gyms/deletions/_server/queries.ts", {
    "server-only": {},
    "@/core/auth/access": { assertPermission: async permission => { assert.equal(permission, "gyms.view"); throw Error("Denied"); } },
    "@/core/db/service-client": { createServiceClient: async () => { created = true; } },
    "@/core/db/loose-client": { loose: client => client },
  });
  await assert.rejects(getGymDeletions({ view: "pending", limit: 25, offset: 0 }), /Denied/);
  assert.equal(created, false);
});

test("expired pending requests do not claim restoration is available", () => {
  assert.equal(deletionDisplay(row(), Date.parse("2026-10-16T05:41:49Z")).label, "Pending deletion");
  const expired = deletionDisplay(row(), Date.parse("2026-10-16T05:41:50Z"));
  assert.equal(expired.label, "Awaiting cleanup");
  assert.doesNotMatch(expired.description, /Restore/);
});

test("database deletion alone never claims files or login accounts were cleaned", () => {
  const historical = deletionDisplay(row({ state: "database_deleted", gymExists: false, databaseDeletedAt: "2026-10-07T05:41:16Z" }));
  assert.equal(historical.label, "Historical database deletion");
  assert.match(historical.description, /different ID/);
  assert.equal(deletionDisplay(row({ state: "purging", gymExists: false, databaseDeletedAt: "2026-10-16T05:42:00Z" })).label, "File or account cleanup pending");
  assert.equal(deletionDisplay(row({ state: "completed", gymExists: false })).label, "Deletion completed");
});

async function render(rows, extra = {}) {
  const counts = { pending: 1, jobs: 1, deleted: 7 };
  const { DeletionRecords } = load("src/app/admin/gyms/deletions/records.tsx", {
    "@/components/ButtonLink": { ButtonLink: ({ href, children }) => React.createElement("a", { href }, children) },
    "@/components/Pagination": { parsePagination: () => ({ page: 1, pageSize: 25, offset: 0 }), Pagination: () => null },
    "@/features/gyms/deletion-display": { deletionDisplay, deletionStages },
    "@/core/ui/icons": icons,
    "./cleanup-inspection": { CleanupInspectionControl: () => React.createElement("button", null, "Inspect cleanup now") },
    "./_server/queries": { getGymDeletions: async () => ({ rows, counts, total: rows.length, jobsAvailable: true, error: null, ...extra }) },
  });
  return renderToStaticMarkup(await DeletionRecords({ view: extra.view ?? "pending", searchParams: {} }));
}

test("pending requests show gym identity, initiator, IST deadline and data links", async () => {
  const html = await render([row()]);
  for (const text of ["Fitlife", "FF-1026A", "Kadapa", "Mohammad", "Recovery deadline", "11:11", "IST", "View gym data", "Manage deletion"]) assert.ok(html.includes(text), text);
  assert.ok(html.includes('/admin/gyms/gym/operations?section=danger'));
  assert.ok(html.includes("Database deletions"));
});

test("deleted gyms and partial purges never link to missing gym pages", async () => {
  for (const state of ["database_deleted", "completed", "purging"]) {
    const html = await render([row({ state, gymExists: false, databaseDeletedAt: "2026-10-16T05:42:00Z" })]);
    assert.doesNotMatch(html, /View gym data|Manage deletion/);
  }
});

test("unavailable cleanup tracking is distinct from an empty history", async () => {
  const html = await render([], { jobsAvailable: false });
  assert.match(html, /Scheduled cleanup tracking is unavailable/);
  assert.match(html, /Pending gym requests and recorded database deletions are still shown/);
});

test("historical Hunk Fitness and its new same-code record keep separate identities", async () => {
  const html = await render([row({ organizationId: "old-hunk", gymName: "Hunk Fitness", gymExists: false, state: "database_deleted", databaseDeletedAt: "2026-10-07T05:41:16Z", gymCreatedAt: "2026-10-07T05:27:58Z", otherGymsWithSameCode: [{ organizationId: "new-hunk", name: "Hunk fitness", createdAt: "2026-10-16T14:09:34Z" }] })], { view: "deleted" });
  assert.match(html, /Historical gym ID: old-hunk/);
  assert.match(html, /different current gym uses this code: Hunk fitness/);
  assert.match(html, /Current gym ID: new-hunk/);
  assert.match(html, /href="\/admin\/gyms\/new-hunk"/);
  assert.doesNotMatch(html, /href="\/admin\/gyms\/old-hunk"/);
  assert.match(html, /Login accounts/);
  assert.match(html, /No cleanup receipt/);
  assert.match(html, /Inspect cleanup now/);
});

test("a historical delete never overrides a present gym with the same ID", () => {
  for (const state of ["database_deleted", "completed"]) {
    assert.equal(deletionDisplay(row({ state, gymExists: true })).label, "Gym record exists");
    assert.equal(deletionStages(row({ state, gymExists: true }))[0].status, "Gym record present");
    assert.notEqual(deletionStages(row({ state, gymExists: true }))[1].status, "Cleanup confirmed");
  }
});

test("stage details distinguish legacy evidence, partial cleanup, completion and restoration", () => {
  const historical = deletionStages(row({ state: "database_deleted", gymExists: false, databaseDeletedAt: "2026-10-07T05:41:16Z" }));
  assert.match(historical[0].detail, /does not list every/);
  assert.equal(historical[1].status, "No cleanup receipt");
  assert.equal(historical[2].status, "No cleanup receipt");
  const partial = deletionStages(row({ state: "purging", gymExists: false, databaseDeletedAt: "2026-10-16T05:42:00Z" }));
  assert.equal(partial[1].status, "Not completed");
  const completed = deletionStages(row({ state: "completed", gymExists: false }));
  assert.equal(completed[1].status, "Cleanup confirmed");
  assert.match(completed[2].detail, /retained/);
  assert.match(completed[2].detail, /totals are erased/);
  const restored = deletionStages(row({ state: "restored" }));
  assert.equal(restored[1].status, "Cancelled");
  assert.equal(restored[2].status, "Cancelled");
});

test("query counts and identity matching use database IDs and retain snapshot dates", async () => {
  const { createClient } = require("@supabase/supabase-js");
  const requests = [];
  const oldGym = "a4fb7057-7960-4d4e-95dc-3ffa942fbc8e";
  const newGym = "b7edc0d5-0cda-4e3a-9c0f-56510bb37790";
  const db = createClient("https://example.supabase.co", "test", { global: { fetch: async (url, options) => {
    const request = new URL(url); requests.push(request);
    const table = request.pathname.split("/").at(-1);
    if (options.method === "HEAD") return new Response(null, { status: 200, headers: { "content-range": `0-0/${table === "admin_audit_log" ? 7 : 0}` } });
    const data = table === "admin_audit_log" ? [{ id: 417, target_organization_id: oldGym, at: "2026-10-07T05:41:16Z", admin_id: null, actor_role: "system", gym_name: "Hunk Fitness", gym_code: "HF-1026A", gym_created_at: "2026-10-07T05:27:58Z" }] : table === "organizations" && request.searchParams.has("gym_code") ? [{ id: newGym, name: "Hunk fitness", gym_code: "HF-1026A", created_at: "2026-10-16T14:09:34Z" }] : [];
    return new Response(JSON.stringify(data), { status: 200, headers: { "content-type": "application/json" } });
  } } });
  const { getGymDeletions } = load("src/app/admin/gyms/deletions/_server/queries.ts", {
    "server-only": {}, "@/core/auth/access": { assertPermission: async () => {} }, "@/core/db/service-client": { createServiceClient: async () => db }, "@/core/db/loose-client": { loose: value => value },
  });
  const result = await getGymDeletions({ view: "deleted", limit: 25, offset: 0 });
  assert.equal(result.error, null);
  assert.equal(result.total, 7);
  assert.equal(result.rows[0].organizationId, oldGym);
  assert.equal(result.rows[0].gymExists, false);
  assert.equal(result.rows[0].gymCreatedAt, "2026-10-07T05:27:58Z");
  assert.equal(result.rows[0].otherGymsWithSameCode[0].organizationId, newGym);
  assert.ok(requests.some(url => url.searchParams.get("gym_code") === "in.(HF-1026A)"));
});
