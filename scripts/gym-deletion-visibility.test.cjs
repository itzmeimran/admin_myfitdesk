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
const { deletionDisplay } = load("src/features/gyms/deletion-display.ts");
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
  assert.equal(historical.label, "Database deleted");
  assert.match(historical.description, /cannot be confirmed/);
  assert.equal(deletionDisplay(row({ state: "purging", databaseDeletedAt: "2026-10-16T05:42:00Z" })).label, "File or account cleanup pending");
  assert.equal(deletionDisplay(row({ state: "completed", gymExists: false })).label, "Deletion completed");
});

async function render(rows, extra = {}) {
  const counts = { pending: 1, jobs: 1, deleted: 7 };
  const Page = load("src/app/admin/gyms/deletions/page.tsx", {
    "@/components/ButtonLink": { ButtonLink: ({ href, children }) => React.createElement("a", { href }, children) },
    "@/components/Pagination": { parsePagination: () => ({ page: 1, pageSize: 25, offset: 0 }), Pagination: () => null },
    "@/features/gyms/deletion-display": { deletionDisplay },
    "./_server/queries": { getGymDeletions: async () => ({ rows, counts, total: rows.length, jobsAvailable: true, error: null, ...extra }) },
  }).default;
  return renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }));
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
