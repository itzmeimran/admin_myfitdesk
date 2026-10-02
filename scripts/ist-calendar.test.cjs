/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS harness compiles and loads the actual TypeScript app modules. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const root = path.resolve(__dirname, "..");

// Compile the actual app modules without adding a test-runner dependency.
function load(file, mocks = {}) {
  const filename = path.join(root, file);
  const source = fs.readFileSync(filename, "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const m = new Module(filename, module);
  m.filename = filename;
  m.paths = Module._nodeModulePaths(path.dirname(filename));
  const original = m.require.bind(m);
  m.require = name => {
    if (name in mocks) return mocks[name];
    if (name.startsWith("@/") || name.startsWith(".")) {
      const target = name.startsWith("@/") ? path.join(root, "src", name.slice(2)) : path.resolve(path.dirname(filename), name);
      const file = [target, `${target}.ts`, `${target}.tsx`].find(p => fs.existsSync(p));
      if (file) return load(path.relative(root, file), mocks);
    }
    return original(name);
  };
  m._compile(compiled, filename);
  return m.exports;
}
const ist = load("src/core/dates/ist.ts");
const dates = load("src/core/dates/format.ts");
const ranges = load("src/core/dates/zoned-range.ts");
const { buildSubscriptionPanelView } = load("src/app/admin/gyms/[id]/subscription-view.ts");
const gym = {
  status: "Trialing", defaultTimezone: "America/New_York",
  subscription: { packageName: null, billingPeriod: null, pending: null, graceDays: 3,
    currentPeriodStart: "2026-09-25T09:17:00Z", currentPeriodEnd: "2026-10-09T09:17:00Z" },
};

for (const zone of ["UTC", "Asia/Kolkata", "America/Los_Angeles"]) {
  test(`calendar behavior is IST with host timezone ${zone}`, () => {
    const previous = process.env.TZ;
    process.env.TZ = zone;
    try {
      const before = new Date("2026-10-01T18:29:59.999Z");
      const midnight = new Date("2026-10-01T18:30:00Z");
      assert.equal(ist.istDateKey(before), "2026-10-01");
      assert.equal(ist.istDateKey(midnight), "2026-10-02");
      assert.equal(ist.millisecondsUntilIstMidnight(before), 1);
      assert.equal(ist.millisecondsUntilIstMidnight(midnight), 86_400_000);
      assert.equal(dates.daysBetween(before, midnight), 1);
      assert.equal(dates.formatShortDate(midnight, midnight), "2 Oct");
      assert.equal(dates.formatShortDate(new Date("2026-12-31T18:30:00Z"), new Date("2026-12-31T18:29:59Z")), "1 Jan 27");
      assert.equal(ist.istInputToIso("2026-10-02T00:00"), "2026-10-01T18:30:00.000Z");
      assert.equal(ist.istInputToIso("invalid"), null);
      assert.equal(ist.istInputToIso("2026-02-30T12:00"), null);
      assert.deepEqual(ranges.zonedDayRange("2026-10-02", ist.IST_TIME_ZONE), {
        start: "2026-10-01T18:30:00.000Z", end: "2026-10-02T18:29:59.999Z",
      });
      assert.equal(ranges.zonedDayRange("2026-02-30", ist.IST_TIME_ZONE), null);
      assert.equal(dates.formatCalendarDate("2026-10-02"), "2 Oct 2026");
      const early = buildSubscriptionPanelView(gym, new Date("2026-10-01T00:00:00Z"));
      const atExpiryHour = buildSubscriptionPanelView(gym, new Date("2026-10-01T09:17:01Z"));
      const last = buildSubscriptionPanelView(gym, before);
      const next = buildSubscriptionPanelView(gym, midnight);
      assert.equal(early.headline.value, "8");
      assert.deepEqual(early, atExpiryHour);
      assert.deepEqual(early, last);
      assert.equal(next.headline.value, "7");
      assert.equal(next.meter.mid, "Day 8 of 14");
      assert.equal(next.anchor.value, "9 Oct 2026");
      const due = buildSubscriptionPanelView(gym, new Date("2026-10-09T09:17:00Z"));
      assert.equal(due.headline.value, "0");
      assert.equal(due.headline.unit, "days overdue");
      assert.equal(buildSubscriptionPanelView(gym, new Date("2026-10-09T18:30:00Z")).headline.value, "1");
      const month = ist.istPeriodRange("month", midnight);
      assert.equal(month.start.toISOString(), "2026-09-30T18:30:00.000Z");
      assert.equal(month.end.toISOString(), "2026-10-31T18:30:00.000Z");
      assert.equal(month.prevStart.toISOString(), "2026-08-31T18:30:00.000Z");
      const year = ist.istPeriodRange("year", new Date("2026-12-31T18:30:00Z"));
      assert.equal(year.start.toISOString(), "2026-12-31T18:30:00.000Z");
      assert.equal(year.label, "2027");
      assert.equal(ist.istPeriodRange("quarter", midnight).label, "Q4 2026");
    } finally {
      if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous;
    }
  });
}

test("open pages refresh at IST midnight and catch up after a hidden tab resumes", () => {
  let now = new Date("2026-10-01T18:29:59Z");
  let cleanup, timer, delay, refreshed = 0;
  const documentListeners = {}, windowListeners = {};
  const saved = { document: global.document, window: global.window, setTimeout: global.setTimeout, clearTimeout: global.clearTimeout };
  global.document = { addEventListener: (key, fn) => documentListeners[key] = fn, removeEventListener: key => delete documentListeners[key] };
  global.window = { addEventListener: (key, fn) => windowListeners[key] = fn, removeEventListener: key => delete windowListeners[key] };
  global.setTimeout = (fn, ms) => { timer = fn; delay = ms; return 1; };
  global.clearTimeout = () => {};
  try {
    const { AdminLiveRefresh } = load("src/app/admin/admin-live-refresh.tsx", {
      react: { useCallback: fn => fn, useEffect: fn => cleanup = fn() },
      "next/navigation": { useRouter: () => ({ refresh() {} }) },
      "@/core/realtime/refresh-scheduler": { requestRefresh: () => refreshed++ },
      "@/core/realtime/use-broadcast-channel": { useBroadcastChannel() {} },
      "@/core/dates/ist": { istDateKey: () => ist.istDateKey(now), millisecondsUntilIstMidnight: () => ist.millisecondsUntilIstMidnight(now) },
    });
    AdminLiveRefresh();
    assert.equal(delay, 1050);
    assert.equal(refreshed, 0);
    now = new Date("2026-10-01T18:30:00.050Z"); timer();
    assert.equal(refreshed, 1);
    windowListeners.focus();
    assert.equal(refreshed, 1);
    now = new Date("2026-10-03T04:00:00Z"); documentListeners.visibilitychange();
    assert.equal(refreshed, 2);
    cleanup();
    assert.deepEqual(documentListeners, {});
    assert.deepEqual(windowListeners, {});
  } finally { Object.assign(global, saved); }
});

test("date formatters and calendar constructors cannot fall back to the host timezone", () => {
  const failures = [];
  function inspect(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) { inspect(p); continue; }
      if (!/\.tsx?$/.test(p)) continue;
      const source = ts.createSourceFile(p, fs.readFileSync(p, "utf8"), ts.ScriptTarget.Latest, true);
      const directive = source.statements.find(n => ts.isExpressionStatement(n) && ts.isStringLiteral(n.expression) && ["use server", "use client"].includes(n.expression.text));
      if (directive && directive !== source.statements[0]) failures.push(`${p}: React directive must precede imports`);
      function visit(n) {
        if (ts.isNewExpression(n) && n.expression.getText(source) === "Date" && n.arguments?.length > 1) failures.push(`${p}: host-local date constructor`);
        if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)) {
          const name = n.expression.name.text;
          if (["toLocaleDateString", "toLocaleTimeString"].includes(name) || (name === "toLocaleString" && n.arguments.length > 1)) {
            const options = n.arguments[1];
            if (!options || !ts.isObjectLiteralExpression(options) || !options.properties.some(p => p.name?.getText(source) === "timeZone")) failures.push(`${p}: ${name} has no explicit timezone`);
          }
        }
        ts.forEachChild(n, visit);
      }
      visit(source);
    }
  }
  inspect(path.join(root, "src"));
  assert.deepEqual(failures, []);
});
