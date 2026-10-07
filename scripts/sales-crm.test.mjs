import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
const hostRequire=createRequire(import.meta.url);
const scriptDirectory=path.dirname(fileURLToPath(import.meta.url));
const cache = new Map();
function load(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file);
  const loadedModule = { exports: {} };
  cache.set(file, loadedModule.exports);
  const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const requireLocal = id => {
    if (id.startsWith('@/')) return load(path.join(scriptDirectory, '..', 'src', id.slice(2)) + '.ts');
    if (id.startsWith('.')) return load(path.resolve(path.dirname(file), id) + '.ts');
    return hostRequire(id);
  };
  new Function('require', 'module', 'exports', compiled)(requireLocal, loadedModule, loadedModule.exports);
  cache.set(file, loadedModule.exports);
  return loadedModule.exports;
}
const { scheduledIso, dueState, revisitLabel, mapSnapshot } = load(path.join(scriptDirectory, '../src/features/sales/data.ts'));
const { manualLeadSchema } = load(path.join(scriptDirectory, '../src/features/sales/manual-lead.ts'));
const { salesConfirmation } = load(path.join(scriptDirectory, '../src/features/sales/confirmation.ts'));
test('field leads allow unknown size and missing email while normalizing Indian phones', () => {
  const input = { gym: ' Field Gym ', contact: ' Owner ', phone: '98765 43210', email: '', city: 'Kadapa', state: 'Andhra Pradesh', source: 'Field visit' };
  const parsed = manualLeadSchema.parse(input);
  assert.equal(parsed.phone, '+919876543210');
  assert.equal(parsed.gym, 'Field Gym');
  assert.equal(parsed.members, 'Unknown');
  assert.equal(parsed.email, '');
  for (const override of [{phone:'123'}, {email:'invalid'}, {source:'Website Demo'}, {state:''}]) {
    assert.equal(manualLeadSchema.safeParse({...input, ...override}).success, false);
  }
});
test('priority and conversion confirmations describe the requested effect', () => {
  const lead = { gym: 'Field Gym', priority: 'normal' };
  assert.match(salesConfirmation(lead, 'togglePriority', {}).description, /high priority.*Field Gym/);
  assert.match(salesConfirmation({...lead,priority:'high'}, 'togglePriority', {}).description, /Remove high priority/);
  assert.match(salesConfirmation(lead,'convert',{how:'invite'}).description, /trial.*invitation.*follow-ups remain open/);
  assert.match(salesConfirmation(lead,'convert',{how:'paid'}).description, /active on a paid plan.*follow-ups will stop/);
});
test('IST schedule values preserve noon, midnight and calendar days across device zones', () => {
  assert.equal(scheduledIso('2026-10-06', '4:00 PM'), '2026-10-06T10:30:00.000Z');
  assert.equal(scheduledIso('2026-10-06', '12:00 AM'), '2026-10-05T18:30:00.000Z');
  assert.equal(scheduledIso('2026-10-06', '12:00 PM'), '2026-10-06T06:30:00.000Z');
  assert.throws(() => scheduledIso('2026-02-30', '10:00 AM'));
  assert.throws(() => scheduledIso('2026-10-06', '13:00 PM'));
  const now = new Date('2026-10-05T18:31:00Z'); // 00:01 IST on 6 Oct.
  assert.equal(dueState('2026-10-05T18:30:00Z', now), 'overdue');
  assert.equal(dueState('2026-10-06T10:30:00Z', now), 'today');
  assert.equal(dueState('2026-10-06T18:30:00Z', now), 'upcoming');
});
test('month-end revisit dates match PostgreSQL interval calendar behavior', () => {
  assert.equal(revisitLabel(1, new Date('2026-01-31T10:00:00Z')), '28 Feb 2026');
  assert.equal(revisitLabel(3, new Date('2026-10-31T10:00:00Z')), '31 Jan 2027');
});
test('zero-data reports remain finite and do not fabricate sales results', () => {
  const snapshot = mapSnapshot({ me: 'owner', role: 'platform_owner', users: [{ id: 'owner', name: 'Owner', role: 'platform_owner', team: null, assignable: true }],
    leads: [], total: 0, summary: { total: 0, new: 0, due: 0, overdue: 0, demos: 0, trials: 0, converted: 0 }, attentionCount: 0, coverage: [],
    report: { total: 0, converted: 0, demoCompleted: 0, demoTrials: 0, trials: 0, trialPaid: 0, avgDays: null, stages: [], lostReasons: [], followUps: { done: 0, overdue: 0 }, sources: [], people: [] } }, 'https://www.myfitdesk.app/book-a-demo');
  assert.deepEqual(snapshot.coverage.n, [0, 0, 0, 0]);
  assert.ok(snapshot.analytics.kpis.every(k => k.value === '—'));
  assert.ok(snapshot.analytics.stages.every(row => row[1] === 0));
});
