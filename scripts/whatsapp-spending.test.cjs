/* eslint-disable @typescript-eslint/no-require-imports -- Load the actual TypeScript modules without another runner. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
function load(file, mocks = {}) {
  const filename = path.join(root, file);
  const m = new Module(filename, module); m.filename = filename; m.paths = Module._nodeModulePaths(path.dirname(filename));
  const original = m.require.bind(m);
  m.require = name => name in mocks ? mocks[name] : name.startsWith('@/')
    ? load('src/' + name.slice(2) + '.ts', mocks) : name.startsWith('./')
      ? load(path.relative(root, path.resolve(path.dirname(filename), name + '.ts')), mocks) : original(name);
  m._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, filename);
  return m.exports;
}
const { spendSelection, aggregateMetaPricing } = load('src/features/whatsapp-credits/meta-spend-logic.ts');
const now = new Date('2026-10-11T12:00:00Z');
const start = Date.parse('2026-10-01T00:00:00+05:30') / 1000;
function point(cost, volume, category = 'UTILITY', type = 'REGULAR') {
  return { start, end: start + 86400, cost, volume, pricing_category: category, pricing_type: type };
}
test('all four reporting periods have explicit IST boundaries', () => {
  assert.deepEqual([spendSelection({}, now).fromDate, spendSelection({}, now).toDate], ['2026-10-01', '2026-10-11']);
  const previous = spendSelection({ period: 'last_month' }, now);
  assert.equal(previous.from, '2026-08-31T18:30:00.000Z'); assert.equal(previous.to, '2026-09-30T18:30:00.000Z');
  const custom = spendSelection({ period: 'custom', from: '2026-09-27', to: '2026-10-02' }, now);
  assert.equal(custom.from, '2026-09-26T18:30:00.000Z'); assert.equal(custom.to, '2026-10-02T18:30:00.000Z');
  const lifetime = spendSelection({ period: 'lifetime' }, now, Date.parse('2026-09-23T09:27:42Z') / 1000);
  assert.equal(lifetime.fromDate, '2026-09-23'); assert.equal(lifetime.to, now.toISOString());
  assert.equal(spendSelection({ period: 'last_month' }, new Date('2027-01-01T00:00:00Z')).fromDate, '2026-12-01');
});
test('invalid, reversed, incomplete and future custom ranges are rejected', () => {
  for (const dates of [{ from: '2026-02-30', to: '2026-03-01' }, { from: '2026-10-10', to: '2026-10-01' }, { from: '2026-10-01' }, { from: '2026-10-01', to: '2026-10-12' }]) {
    assert.ok(spendSelection({ period: 'custom', ...dates }, now).error);
  }
});
test('Meta costs retain fractional precision and include authentication and unfamiliar categories', () => {
  const total = aggregateMetaPricing([point(0.115, 1), point(0.115, 1), point(0.8631, 1, 'MARKETING'), point(0.115, 1, 'AUTHENTICATION'), point(0.25, 1, 'AI_BOT'), point(0, 2, 'SERVICE', 'FREE_CUSTOMER_SERVICE')]);
  assert.equal(total.costMinor, 145.81); assert.equal(total.paidMessages, 5); assert.equal(total.freeMessages, 2);
  assert.equal(total.categories.length, 5); assert.equal(total.days[0].date, '2026-10-01');
});
test('omitted costs are never silently treated as zero spending', () => {
  assert.throws(() => aggregateMetaPricing([{ ...point(1, 1), cost: undefined }]), /complete message cost/);
  assert.equal(aggregateMetaPricing([]).costMinor, 0);
});
test('server queries Meta with environment-specific credentials and account-wide COST/VOLUME', async () => {
  const original = global.fetch; const calls = []; let authorized = false;
  const mocks = { 'server-only': {}, '@/core/auth/access': { assertPermission: async p => { assert.equal(p, 'whatsapp.view'); authorized = true; } },
    '@/core/env/active-environment': { getActiveAdminEnvironment: async () => 'prod' },
    '@/core/config/whatsapp': { managedWhatsAppConfig: env => { assert.equal(env, 'prod'); return { version: 'v21.0', wabaId: '123', accessToken: 'test-only' }; } } };
  const current = Date.parse(new Date().toISOString().slice(0, 7) + '-02T00:00:00+05:30') / 1000;
  global.fetch = async (url, options) => {
    assert(authorized); assert.equal(options.headers.Authorization, 'Bearer test-only'); assert.equal(options.cache, 'no-store');
    calls.push(url.searchParams.get('fields'));
    return new Response(JSON.stringify(calls.length === 1 ? { name: 'Test WABA', currency: 'INR', creation_time: current }
      : { pricing_analytics: { data: [{ data_points: [{ ...point(3.335, 29, 'AUTHENTICATION'), start: current, end: current + 86400 }] }] } }));
  };
  try {
    const { getMetaSpending } = load('src/features/whatsapp-credits/meta-spend.ts', mocks);
    const report = await getMetaSpending({ period: 'lifetime' });
    assert.equal(report.status, 'ready'); assert.equal(report.totals.costMinor, 333.5);
    assert.match(calls[1], /metric_types\(\["COST","VOLUME"\]\)/); assert(!calls[1].includes('phone_numbers'));
  } finally { global.fetch = original; }
});
test('Meta access failure produces unavailable spending, never a calculated substitute', async () => {
  const original = global.fetch;
  global.fetch = async () => new Response('{}', { status: 403 });
  try {
    const { getMetaSpending } = load('src/features/whatsapp-credits/meta-spend.ts', { 'server-only': {},
      '@/core/auth/access': { assertPermission: async () => {} }, '@/core/env/active-environment': { getActiveAdminEnvironment: async () => 'prod' },
      '@/core/config/whatsapp': { managedWhatsAppConfig: () => ({ version: 'v21.0', wabaId: '123', accessToken: 'test-only' }) } });
    const report = await getMetaSpending({}); assert.equal(report.status, 'unavailable'); assert(!('totals' in report));
  } finally { global.fetch = original; }
});
