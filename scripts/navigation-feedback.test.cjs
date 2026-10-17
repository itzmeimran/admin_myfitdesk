/* eslint-disable @typescript-eslint/no-require-imports -- Matches the existing TypeScript component harness. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

function load(relative, mocks = {}) {
  const file = path.resolve(__dirname, "..", relative), m = new Module(file, module);
  m.filename = file; m.paths = module.paths;
  m.require = id => {
    if (Object.hasOwn(mocks, id)) return mocks[id];
    if (id.startsWith("@/") || id.startsWith(".")) {
      const base = id.startsWith("@/") ? path.resolve(__dirname, "../src", id.slice(2)) : path.resolve(path.dirname(file), id);
      const target = [".ts", ".tsx"].map(ext => base + ext).find(fs.existsSync);
      if (target) return load(path.relative(path.resolve(__dirname, ".."), target), mocks);
    }
    return require(id);
  };
  m._compile(ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, file);
  return m.exports;
}
function pendingLink(state) {
  const calls = [];
  const { PendingLink } = load("src/components/NavigationPending.tsx", {
    react: { ...React, useContext: () => ({ ...state, navigate: (...args) => calls.push(args) }), useTransition: () => [false, fn => fn()], useState: value => [value, () => {}], useCallback: fn => fn },
    "next/navigation": { useRouter: () => ({ push: () => assert.fail("must use shared navigation") }) },
    "next/link": ({ children, ...props }) => React.createElement("a", props, children),
  });
  return { PendingLink, calls };
}
function event(extra = {}) { return { defaultPrevented: false, button: 0, currentTarget: { hasAttribute: () => false }, preventDefault() { this.defaultPrevented = true; }, ...extra }; }

test("plain internal navigation activates shared loading while modified/download clicks keep browser behavior", () => {
  for (const extra of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }, { currentTarget: { hasAttribute: () => true } }]) {
    const { PendingLink, calls } = pendingLink({ pending: false, pendingHref: null });
    const e = event(extra); PendingLink({ href: "/admin/gyms?filter=Active", children: "Active" }).props.onClick(e);
    assert.equal(calls.length, 0); assert.equal(e.defaultPrevented, false);
  }
  const { PendingLink, calls } = pendingLink({ pending: false, pendingHref: null });
  const e = event(); PendingLink({ href: "/admin/gyms?filter=Active", scroll: false, children: "Active" }).props.onClick(e);
  assert.equal(e.defaultPrevented, true); assert.deepEqual(calls, [["/admin/gyms?filter=Active", { scroll: false }]]);
});

test("pending link announces busy, renders loading content and ignores repeated navigation", () => {
  const { PendingLink, calls } = pendingLink({ pending: true, pendingHref: "/admin/gyms?page=2" });
  const link = PendingLink({ href: "/admin/gyms?page=2", children: "Next", pendingChildren: "Loading next page…" });
  assert.equal(link.props["aria-busy"], true); assert.equal(link.props["data-navigation-pending"], true);
  assert.match(renderToStaticMarkup(link), /Loading next page…/);
  link.props.onClick(event()); assert.equal(calls.length, 0);
  const other = PendingLink({ href: "/admin/settings", children: "Settings", pendingChildren: "Loading…" });
  assert.equal(other.props["aria-busy"], undefined); assert.match(renderToStaticMarkup(other), />Settings</);
});

test("same-route results switch to a skeleton only for their own pending destination", () => {
  for (const [pending, pendingHref, expected] of [[true, "/admin/gyms?q=hunk", "skeleton"], [true, "/admin/gyms/one", "results"], [false, null, "results"]]) {
    const { NavigationPendingContent } = load("src/components/NavigationPendingContent.tsx", { "./NavigationPending": { useNavigationPending: () => ({ pending, pendingHref }) } });
    assert.equal(NavigationPendingContent({ pathname: "/admin/gyms", fallback: "skeleton", children: "results" }), expected);
  }
});

test("shared Select pending state preserves its label, disables interaction and shows exactly one spinner", () => {
  const { Select } = load("src/components/Select.tsx");
  const html = renderToStaticMarkup(React.createElement(Select, { value: "Active", options: [{ value: "Active", label: "Active" }], pending: true, "aria-label": "Gym status" }));
  assert.match(html, /aria-busy="true"/); assert.match(html, /disabled=""/); assert.match(html, />Active</);
  assert.equal((html.match(/animate-spin/g) ?? []).length, 1);
  assert.equal((html.match(/<svg/g) ?? []).length, 1);
});
