/* eslint-disable @typescript-eslint/no-require-imports -- Exercise TS modules using the existing CommonJS harness. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { NextRequest } = require('next/server');
const { createServerClient } = require('@supabase/ssr');
const root = path.resolve(__dirname, '..');

function load(file, mocks = {}) {
  const filename = path.join(root, file);
  const m = new Module(filename, module);
  m.filename = filename;
  m.paths = Module._nodeModulePaths(path.dirname(filename));
  const original = m.require.bind(m);
  m.require = name => {
    if (name in mocks) return mocks[name];
    if (name.startsWith('@/')) return load(`src/${name.slice(2)}.ts`, mocks);
    return original(name);
  };
  m._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
  return m.exports;
}

const user = { id: '00000000-0000-4000-8000-000000000001', email: 'admin@example.com' };
function jwt(expires) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: user.id, exp: expires, email: user.email })}.c2ln`;
}
function sessionCookie() {
  return 'base64-' + Buffer.from(JSON.stringify({
    access_token: jwt(1), refresh_token: 'stale-test-refresh-token', expires_at: 1, user,
  })).toString('base64url');
}
function proxyHarness(environment, cookie, refreshError = null) {
  const calls = [];
  const proxyModule = load('src/proxy.ts', {
    '@/core/config/public': { getPublicSupabaseCredentials: env => ({ url: `https://${env}.example.com`, publishableKey: 'test-key' }) },
    '@supabase/ssr': { createServerClient: (url, key, options) => createServerClient(url, key, {
      ...options,
      global: { fetch: async (input, init) => {
        const target = String(input);
        calls.push({ target, body: init?.body });
        if (target.includes('/token?')) {
          if (refreshError) return Response.json({ code: refreshError, message: 'Invalid Refresh Token: Refresh Token Not Found' }, {
            status: 400, headers: { 'x-supabase-api-version': '2024-01-01' },
          });
          return Response.json({ access_token: jwt(Math.floor(Date.now() / 1000) + 3600), refresh_token: 'rotated-token', expires_in: 3600, token_type: 'bearer', user });
        }
        if (target.endsWith('/user')) return Response.json(user);
        throw new Error(`Unexpected Auth request ${target}`);
      } },
    }) },
  });
  const request = new NextRequest('https://admin.example.com/admin/settings/environments');
  if (environment) request.cookies.set('mfd-admin-env', environment);
  // Chunk the stale session to check that cleanup includes every chunk.
  if (cookie) {
    const split = Math.floor(cookie.length / 2);
    request.cookies.set(`sb-admin-${environment}.0`, cookie.slice(0, split));
    request.cookies.set(`sb-admin-${environment}.1`, cookie.slice(split));
  }
  request.cookies.set(`sb-admin-${environment === 'prod' ? 'dev' : 'prod'}`, 'inactive-session');
  return { proxy: proxyModule.proxy, request, calls };
}

for (const environment of ['dev', 'prod']) {
  test(`${environment}: invalid refresh redirects to login and expires only its session chunks`, async () => {
    const h = proxyHarness(environment, sessionCookie(), 'refresh_token_not_found');
    const response = await h.proxy(h.request);
    assert.equal(response.status, 307);
    assert.equal(response.headers.get('location'), 'https://admin.example.com/login');
    for (const suffix of ['.0', '.1']) {
      const removed = response.cookies.get(`sb-admin-${environment}${suffix}`);
      assert.equal(removed.value, '');
      assert.equal(removed.maxAge, 0);
      assert.equal(h.request.cookies.get(`sb-admin-${environment}${suffix}`).value, '');
    }
    const other = environment === 'dev' ? 'prod' : 'dev';
    assert.equal(response.cookies.get(`sb-admin-${other}`), undefined);
    assert.equal(h.request.cookies.get(`sb-admin-${other}`).value, 'inactive-session');
    assert.equal(h.request.cookies.get('mfd-admin-env').value, environment);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.equal(response.headers.get('pragma'), 'no-cache');
    assert.ok(h.calls.every(call => call.target.startsWith(`https://${environment}.example.com/`)));
  });

  test(`${environment}: expired access token rotates once before rendering and reaches the browser`, async () => {
    const h = proxyHarness(environment, sessionCookie());
    const response = await h.proxy(h.request);
    assert.equal(response.status, 200);
    const saved = response.cookies.get(`sb-admin-${environment}`);
    const session = JSON.parse(Buffer.from(saved.value.slice('base64-'.length), 'base64url').toString());
    assert.equal(session.refresh_token, 'rotated-token');
    assert.equal(h.request.cookies.get(`sb-admin-${environment}`).value, saved.value);
    assert.equal(h.calls.filter(call => call.target.includes('/token?')).length, 1);
    assert.ok(h.calls.every(call => call.target.startsWith(`https://${environment}.example.com/`)));
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
  });
}

test('missing/malformed environment defaults to dev; login remains accessible with no session', async () => {
  for (const environment of [null, 'unexpected']) {
    const h = proxyHarness(environment);
    assert.equal((await h.proxy(h.request)).status, 307);
    h.request.nextUrl.pathname = '/login';
    assert.equal((await h.proxy(h.request)).status, 200);
    assert.equal(h.calls.length, 0);
  }
});

function actionsHarness(environment, errors = {}) {
  const calls = [];
  const writes = [];
  const actions = load('src/features/auth/actions.ts', {
    'next/navigation': { redirect: to => { throw new Error(`redirect:${to}`); } },
    'next/headers': { cookies: async () => ({
      getAll: () => ['sb-admin-dev', 'sb-admin-dev.0', 'sb-admin-prod.0', 'sb-admin-prod.1', 'mfd-admin-env', 'unrelated'].map(name => ({ name, value: 'old' })),
      set: (...args) => writes.push(args),
    }) },
    '@/core/env/active-environment': { getActiveAdminEnvironment: async () => environment },
    '@/core/db/server-client': { createClientForEnvironment: async env => ({ auth: {
      signInWithPassword: async input => {
        calls.push({ env, input });
        if (errors[env] === 'throw') throw new Error('Auth unavailable');
        return { error: errors[env] ?? null };
      },
      signOut: async () => { calls.push({ env, signOut: true }); throw new Error('Auth unavailable'); },
    } }) },
  });
  const form = new FormData();
  form.set('email', ' admin@example.com ');
  form.set('password', 'submitted-test-password');
  return { ...actions, calls, writes, form };
}

for (const environment of ['dev', 'prod']) {
  test(`${environment}: one sign-in establishes two independent sessions with matching credentials`, async () => {
    const h = actionsHarness(environment);
    await assert.rejects(h.signIn({ error: null }, h.form), /redirect:\/admin/);
    assert.deepEqual(h.calls.map(call => call.env), [environment, environment === 'dev' ? 'prod' : 'dev']);
    assert.deepEqual(h.calls[0].input, h.calls[1].input);
    assert.equal(h.calls[0].input.email, user.email);
    assert.deepEqual(h.writes, []); // No password storage.
  });
}

test('failed selected login never attempts the other environment', async () => {
  const h = actionsHarness('dev', { dev: { message: 'Invalid credentials' } });
  const result = await h.signIn({ error: null }, h.form);
  assert.ok(result.error);
  assert.deepEqual(h.calls.map(call => call.env), ['dev']);
  assert.equal('password' in result, false);
});

test('other environment mismatch or outage does not block selected login', async () => {
  for (const error of [{ message: 'Invalid credentials' }, 'throw']) {
    const h = actionsHarness('prod', { dev: error });
    await assert.rejects(h.signIn({ error: null }, h.form), /redirect:\/admin/);
    assert.deepEqual(h.calls.map(call => call.env), ['prod', 'dev']);
  }
});

test('sign-out clears both sessions and all chunks even when both Auth services fail', async () => {
  const h = actionsHarness('dev');
  await assert.rejects(h.signOut(), /redirect:\/login/);
  assert.deepEqual(h.calls.map(call => call.env), ['dev', 'prod']);
  assert.deepEqual(h.writes.map(([name]) => name), ['sb-admin-dev', 'sb-admin-dev.0', 'sb-admin-prod.0', 'sb-admin-prod.1']);
  assert.ok(h.writes.every(([, value, options]) => value === '' && options.maxAge === 0));
});
