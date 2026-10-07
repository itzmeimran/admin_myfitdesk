/* eslint-disable @typescript-eslint/no-require-imports -- Loads the actual TS components without a test-runner dependency. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const root = path.resolve(__dirname, "..");

function load(file, mocks = {}) {
  const filename = path.join(root, file);
  const source = fs.readFileSync(filename, "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
    jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText;
  const m = new Module(filename, module);
  m.filename = filename;
  m.paths = Module._nodeModulePaths(path.dirname(filename));
  const original = m.require.bind(m);
  m.require = name => {
    if (name in mocks) return mocks[name];
    if (name.startsWith("@/") || name.startsWith(".")) {
      const target = name.startsWith("@/") ? path.join(root, "src", name.slice(2)) : path.resolve(path.dirname(filename), name);
      const match = [`${target}.ts`, `${target}.tsx`].find(p => fs.existsSync(p));
      if (match) return load(path.relative(root, match), mocks);
    }
    return original(name);
  };
  m._compile(compiled, filename);
  return m.exports;
}

const { Button } = load("src/components/Button.tsx");
const { ConfirmIcon } = load("src/core/ui/icons.ts");
const { ButtonLink } = load("src/components/ButtonLink.tsx", {
  "next/link": ({ children, ...props }) => React.createElement("a", props, children),
});
const html = (component, props) => renderToStaticMarkup(React.createElement(component, props));

test("action buttons retain native form, event, ref and accessibility props", () => {
  const ref = { current: null };
  const onClick = () => {};
  const element = Button({ ref, onClick, form: "pricing", name: "action", value: "save", "aria-label": "Save pricing", children: "Save" });
  assert.equal(element.type, "button");
  assert.equal(element.props.type, "button");
  assert.equal(element.props.ref, ref);
  assert.equal(element.props.onClick, onClick);
  assert.equal(element.props.form, "pricing");
  assert.equal(element.props.name, "action");
  assert.equal(element.props.value, "save");
  assert.equal(element.props["aria-label"], "Save pricing");
  assert.equal(Button({ type: "submit" }).props.type, "submit");
  assert.equal(Button({ type: "reset" }).props.type, "reset");
});

test("loading disables the action, announces busy and replaces the existing icon once", () => {
  const markup = html(Button, { icon: ConfirmIcon, pending: true, pendingLabel: "Saving…", children: "Save" });
  assert.match(markup, /disabled=""/);
  assert.match(markup, /aria-busy="true"/);
  assert.match(markup, /Saving…/);
  assert.equal((markup.match(/<svg/g) || []).length, 1);
  assert.match(markup, /animate-spin/);
  const iconless = html(Button, { pending: true, children: "Working" });
  assert.equal((iconless.match(/<svg/g) || []).length, 1);
  const idle = html(Button, { icon: ConfirmIcon, children: "Save" });
  assert.doesNotMatch(idle, /animate-spin|aria-busy|disabled=/);
  assert.equal((idle.match(/<svg/g) || []).length, 1);
  assert.equal(Button({ disabled: true, pending: false }).props.disabled, true);
  for (const value of [true, "true"]) assert.equal(Button({ "aria-disabled": value }).props.disabled, true);
});

test("buttons and navigation share variants, sizes and selection without leaking style props", () => {
  for (const variant of ["primary", "secondary", "text", "ghost"]) {
    const props = { variant, layout: "content", size: "sm", selected: true, iconOnly: true, tone: "inverse", className: "ml-auto", "aria-label": "Action" };
    const button = Button(props);
    const link = ButtonLink({ ...props, href: "/admin" });
    assert.equal(button.props.className, link.props.className);
    assert.match(button.props.className, new RegExp(`mfd-button--${variant}(?: |$)`));
    assert.match(button.props.className, /mfd-button--content-layout.*mfd-button--sm.*mfd-button--icon.*mfd-button--inverse-tone.*ml-auto/);
    assert.equal(button.props["data-selected"], true);
    for (const key of ["variant", "layout", "size", "iconOnly", "tone", "selected", "pendingLabel"]) assert.equal(button.props[key], undefined);
  }
});

test("disabled links block navigation and callbacks; enabled links preserve href and click handlers", () => {
  let called = 0;
  let prevented = 0;
  let stopped = 0;
  const event = { preventDefault: () => prevented++, stopPropagation: () => stopped++ };
  for (const state of [{ disabled: true }, { "aria-disabled": true }, { "aria-disabled": "true" }]) {
    const link = ButtonLink({ ...state, href: "/admin/gyms?page=2", onClick: () => called++, tabIndex: 0 });
    assert.equal(link.props["aria-disabled"], true);
    assert.equal(link.props.tabIndex, -1);
    link.props.onClick(event);
  }
  assert.equal(called, 0);
  assert.equal(prevented, 3);
  assert.equal(stopped, 3);
  const link = ButtonLink({ href: "/admin/gyms?page=2", onClick: () => called++, tabIndex: 0 });
  link.props.onClick(event);
  assert.equal(link.props.href, "/admin/gyms?page=2");
  assert.equal(link.props.tabIndex, 0);
  assert.equal(called, 1);
});

test("SubmitButton connects form pending state to the shared loading behavior", () => {
  for (const pending of [false, true]) {
    const { SubmitButton } = load("src/components/SubmitButton.tsx", { "react-dom": { useFormStatus: () => ({ pending }) } });
    const markup = html(SubmitButton, { variant: "primary", pendingLabel: "Signing out…", children: "Sign out", form: "logout" });
    assert.match(markup, /type="submit"/);
    assert.match(markup, /form="logout"/);
    assert.match(markup, /mfd-button--primary/);
    assert.equal(markup.includes("disabled="), pending);
    assert.equal(markup.includes("Signing out…"), pending);
  }
});

test("imperative async actions reject same-tick duplicates and unlock when settled", async () => {
  const states = [];
  const { useAsyncAction } = load("src/components/AsyncButton.tsx", {
    react: { ...React, useContext: () => null, useState: () => [false, v => states.push(v)], useRef: value => ({ current: value }), useCallback: fn => fn },
  });
  let resolve;
  let calls = 0;
  const promise = new Promise(r => { resolve = r; });
  const { run } = useAsyncAction(async () => { calls++; await promise; });
  run(); run();
  await Promise.resolve();
  assert.equal(calls, 1);
  assert.deepEqual(states, [true]);
  resolve();
  await new Promise(r => setImmediate(r));
  assert.deepEqual(states, [true, false]);
  run();
  await new Promise(r => setImmediate(r));
  assert.equal(calls, 2);
  assert.deepEqual(states, [true, false, true, false]);
});

test("icon rule protects all action buttons while exempting links and backdrops", async () => {
  const { Linter } = require('eslint');
  const rule = (await import('./eslint-rules/button-icon.mjs')).default;
  const linter = new Linter();
  const check = (source, filename = 'test.js') => linter.verify(source, [{
    files: ['**/*.{js,tsx}'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { ui: { rules: { icon: rule } } }, rules: { 'ui/icon': 'error' },
  }], { filename });
  for (const source of [
    '<Button>Save</Button>;', '<Button pending>Save</Button>;',
    '<SubmitButton>Save</SubmitButton>;', '<AsyncButton>Retry</AsyncButton>;',
    '<Button>{selected ? <ConfirmIcon /> : null}Assign</Button>;',
    '<article role="button"><DetailsIcon />Open</article>;',
  ]) assert.equal(check(source).length, 1, source);
  for (const source of [
    '<Button icon={ConfirmIcon}>Save</Button>;', '<Button icon={ConfirmIcon} />;',
    '<Button><CancelIcon /></Button>;', '<Button><span><DetailsIcon />Details</span></Button>;',
    '<Button>{shown ? <HideIcon /> : <RevealIcon />}</Button>;',
    '<Button variant="text">Open</Button>;', '<ButtonLink href="/admin">Open</ButtonLink>;',
    '<Button variant="ghost" layout="overlay" aria-label="Dismiss" />;',
  ]) assert.deepEqual(check(source), [], source);
  assert.deepEqual(check('<Button role="gridcell">7</Button>;', 'src/components/DatePicker.tsx'), []);
  assert.equal(check('<Button>Apply</Button>;', 'src/components/DatePicker.tsx').length, 1);
  assert.equal(check('<Button role="gridcell">7</Button>;', 'src/features/calendar.tsx').length, 1);
});

test("button icons stay direct flex children and loading renders one glyph", () => {
  const markup = html(Button, { icon: ConfirmIcon, children: React.createElement('span', { className: 'flex-1' }, 'Save') });
  assert.match(markup, /<button[^>]*><svg/);
  assert.match(markup, /<\/svg><span class="flex-1">Save<\/span><\/button>/);
  const link = html(ButtonLink, { href: '/admin', children: 'Open' });
  assert.doesNotMatch(link, /<svg/);
});

test("dynamic action labels use the same icons as fixed action buttons", () => {
  const { iconForAction } = load('src/core/ui/action-icons.ts');
  const icons = load('src/core/ui/icons.ts');
  for (const [label, name] of [
    ['Save lead', 'ConfirmIcon'], ['Confirm demo', 'ConfirmIcon'], ['Save package', 'ConfirmIcon'],
    ['Add lead', 'AddIcon'], ['Create / link gym', 'AddIcon'], ['Cancel', 'CancelIcon'],
    ['Load more leads', 'LoadMoreIcon'], ['More', 'MoreIcon'], ['Copy demo link', 'CopyIcon'],
    ['Send template', 'SendIcon'], ['Review match', 'DetailsIcon'], ['Cancel subscription', 'ArchiveIcon'],
  ]) assert.equal(iconForAction(label), icons[name], label);
});
