const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { runInNewContext } = require('node:vm');
const ts = require('typescript');
const yaml = require('js-yaml');

const workflow = yaml.load(readFileSync(resolve(__dirname, '../.github/workflows/database-backup.yml'), 'utf8'));
function jobRuns(job, event, environment, backupType) {
  return new Function('github', 'inputs', `return ${workflow.jobs[job].if};`)(
    { event_name: event }, { environment, backup_type: backupType },
  );
}

test('scheduled events and scheduled dispatches run PROD only', () => {
  assert.equal(jobRuns('development', 'schedule'), false);
  assert.equal(jobRuns('production', 'schedule'), true);
  for (const environment of ['development', 'production', 'both']) {
    assert.equal(jobRuns('development', 'workflow_dispatch', environment, 'scheduled'), false);
    assert.equal(jobRuns('production', 'workflow_dispatch', environment, 'scheduled'), environment !== 'development');
  }
});

test('explicit manual and pre-migration DEV backups remain available', () => {
  for (const type of ['manual', 'pre_migration']) {
    assert.equal(jobRuns('development', 'workflow_dispatch', 'development', type), true);
    assert.equal(jobRuns('development', 'workflow_dispatch', 'both', type), true);
    assert.equal(jobRuns('development', 'workflow_dispatch', 'production', type), false);
  }
});

function route(secret, result = { dispatched: true }) {
  const calls = [];
  const exports = {};
  const source = ts.transpileModule(readFileSync(resolve(__dirname, '../src/app/api/cron/backup/route.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  runInNewContext(source, {
    exports, process: { env: { CRON_SECRET: secret } }, Buffer, Response,
    require(name) {
      if (name === 'node:crypto') return require(name);
      if (name === '@/core/disaster-recovery/github-dispatch') return {
        async dispatchRecoveryWorkflow(...args) { calls.push(args); return result; },
      };
      throw new Error(`Unexpected import ${name}`);
    },
  });
  return { GET: exports.GET, calls };
}

test('cron route fails closed and accepts only the correct bearer secret', async () => {
  const unset = route(undefined);
  assert.equal((await unset.GET(new Request('https://admin.myfitdesk.app/api/cron/backup'))).status, 503);
  assert.equal(unset.calls.length, 0);
  const configured = route('test-backup-secret');
  for (const authorization of ['', 'Bearer wrong', 'Bearer test-backup-secrex']) {
    const response = await configured.GET(new Request('https://admin.myfitdesk.app/api/cron/backup', {
      headers: { authorization },
    }));
    assert.equal(response.status, 401);
  }
  assert.equal(configured.calls.length, 0);
});

test('authenticated cron dispatch targets only production and reports dispatch failure', async () => {
  for (const dispatched of [true, false]) {
    const configured = route('test-backup-secret', dispatched ? { dispatched: true } : { dispatched: false, reason: 'Unavailable' });
    const response = await configured.GET(new Request('https://admin.myfitdesk.app/api/cron/backup', {
      headers: { authorization: 'Bearer test-backup-secret' },
    }));
    assert.equal(response.status, dispatched ? 200 : 502);
    assert.equal(configured.calls.length, 1);
    // Values originate in the VM, so compare serialized objects across realms.
    assert.equal(JSON.stringify(configured.calls[0]), JSON.stringify([
      'database-backup.yml', { environment: 'production', backup_type: 'scheduled' },
    ]));
  }
});
