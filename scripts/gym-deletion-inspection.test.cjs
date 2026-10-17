/* eslint-disable @typescript-eslint/no-require-imports -- Uses the existing TypeScript test harness. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const { createClient } = require("@supabase/supabase-js");
const ORG = "a4fb7057-7960-4d4e-95dc-3ffa942fbc8e";
const USER = "02e0e5dc-23c7-487f-b076-d12d1e29c05d";

function load(relative, mocks) {
  const file = path.resolve(__dirname, "..", relative);
  const m = new Module(file, module); m.filename = file; m.paths = module.paths;
  m.require = id => Object.hasOwn(mocks, id) ? mocks[id] : require(id);
  m._compile(ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, file);
  return m.exports;
}
function inspector(inventory = () => []) {
  return load("src/core/gym-deletion/inspection.ts", { "server-only": {}, "./worker": { deletionStorageConfig: inventory } }).inspectGymCleanup;
}
function client({ current = false, audits = [], authStatus = 404, referenced = false } = {}) {
  const requests = [];
  const db = createClient("https://example.supabase.co", "test", { global: { fetch: async (url, options) => {
    const request = new URL(url); requests.push({ request, method: options.method });
    assert.ok(["GET", "HEAD"].includes(options.method), "inspection only makes reads");
    if (options.method === "HEAD") return new Response(null, { status: 200, headers: { "content-range": `0-0/${referenced ? 1 : 0}` } });
    const table = request.pathname.split("/").at(-1);
    if (request.pathname.startsWith("/auth/")) return new Response(JSON.stringify(authStatus === 404 ? { code: "user_not_found", msg: "User not found" } : { id: USER }), { status: authStatus, headers: { "content-type": "application/json" } });
    const data = table === "organizations" ? (current ? { id: ORG } : null) : table === "admin_audit_log" ? audits : referenced ? [{ id: "membership" }] : [];
    return new Response(JSON.stringify(data), { status: 200, headers: { "content-type": "application/json" } });
  } } });
  // Exercise the traversal with a strict read-only storage adapter.
  db.storage.listBuckets = async () => ({ data: [{ id: "gym-logos" }], error: null });
  db.storage.from = bucket => ({ list: async folder => {
    requests.push({ bucket, folder });
    assert.equal(folder, ORG);
    return { data: [], error: null };
  } });
  return { db, requests };
}

test("present gyms do not scan current files or accounts as deletion residuals", async () => {
  const { db, requests } = client({ current: true });
  const result = await inspector()(db, "dev", ORG);
  assert.equal(result.database.status, "Gym record exists");
  assert.equal(result.files.status, "Not inspected");
  assert.equal(requests.length, 1);
});

test("historical account IDs are checked without claiming a complete original inventory", async () => {
  const { db, requests } = client({ audits: [{ old_user: USER, new_user: USER }] });
  const result = await inspector()(db, "dev", ORG);
  assert.equal(result.files.status, "No files found in configured storage");
  assert.equal(result.accounts.status, "Recovered account IDs checked");
  assert.match(result.accounts.detail, /1 historical account ID\(s\) recovered: 1 absent/);
  assert.match(result.accounts.detail, /not proof that every original account was deleted/);
  assert.equal(requests.filter(r => r.request?.pathname.startsWith("/auth/")).length, 1);
  assert.ok(requests.some(r => r.request?.searchParams.get("target_organization_id") === `eq.${ORG}`));
  assert.ok(requests.some(r => r.folder === ORG));
});

test("missing R2 inventory and missing original account IDs remain unverified", async () => {
  const { db } = client();
  const result = await inspector(() => { throw Error("not configured"); })(db, "dev", ORG);
  assert.equal(result.files.status, "Storage verification incomplete");
  assert.match(result.files.detail, /verified R2 inventory is unavailable/);
  assert.equal(result.accounts.status, "Original account inventory unavailable");
  assert.doesNotMatch(JSON.stringify(result), /Cleanup confirmed/);
});

test("existing accounts are reported for review and referenced accounts are distinguished", async () => {
  for (const referenced of [false, true]) {
    const { db } = client({ audits: [{ old_user: USER }], authStatus: 200, referenced });
    const result = await inspector()(db, "dev", ORG);
    assert.equal(result.accounts.status, referenced ? "Recovered account IDs checked" : "Existing accounts require review");
    assert.match(result.accounts.detail, referenced ? /1 still referenced/ : /1 present without those references/);
    assert.match(result.accounts.detail, /No accounts were changed/);
  }
});

test("file discovery paginates and recurses within the exact gym folder", async () => {
  const { db } = client();
  const scanned = [];
  db.storage.from = () => ({ list: async (folder, options) => {
    scanned.push([folder, options.offset]);
    if (folder === ORG && options.offset === 0) return { data: Array.from({ length: 100 }, (_, i) => ({ name: `image-${i}`, id: `id-${i}` })), error: null };
    if (folder === ORG) return { data: [{ name: "nested", id: null }], error: null };
    return { data: [{ name: "avatar.webp", id: "avatar" }], error: null };
  } });
  const result = await inspector()(db, "dev", ORG);
  assert.equal(result.files.status, "101 file(s) still present");
  assert.deepEqual(scanned, [[ORG, 0], [ORG, 100], [`${ORG}/nested`, 0]]);
});

test("invalid gym IDs are rejected before any elevated lookup", async () => {
  await assert.rejects(inspector()({}, "dev", "../other-gym"), /Invalid gym ID/);
});

test("inspection action checks permission before creating the service client", async () => {
  let created = false;
  const { inspectDeletionCleanup } = load("src/app/admin/gyms/deletions/_server/actions.ts", {
    "@/core/auth/access": { assertPermission: async permission => { assert.equal(permission, "gyms.view"); throw Error("Denied"); } },
    "@/core/db/service-client": { createServiceClientForEnvironment: async () => { created = true; } },
    "@/core/env/active-environment": { getActiveAdminEnvironment: async () => "dev" },
    "@/core/db/loose-client": { loose: value => value },
    "@/core/gym-deletion/inspection": { inspectGymCleanup: async () => assert.fail("must not inspect") },
  });
  await assert.rejects(inspectDeletionCleanup(ORG), /Denied/);
  assert.equal(created, false);
});
