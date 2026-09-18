# DEV/PROD environment switching

This app talks to two separate Supabase projects — DEV and PROD — and lets
a platform admin switch between them at runtime from Settings (or the
header/sidebar environment pill). This file is the map of how that works;
individual modules carry the narrower "why this line" comments.

## The moving pieces

- `core/config/environments.ts` — the `AdminEnvironment` type (`"dev" |
  "prod"`) and its default.
- `core/config/public.ts` / `core/config/server.ts` — DEV and PROD Supabase
  credentials, keyed by environment. Both environments' variables are
  required at startup (fail closed); see `.env.local.example`.
- `core/env/cookie.ts` — the `admin-env` cookie's name/max-age, shared by
  the reader and the writer below.
- `core/env/active-environment.ts` — the server-side read of that cookie
  (`getActiveAdminEnvironment()`), defaulting to DEV. Every server-side
  Supabase client factory calls this.
- `core/env/actions.ts` — `setAdminEnvironment()`, the only place the
  cookie is written.
- `core/env/context.tsx` — `AdminEnvironmentProvider`/`useAdminEnvironment()`,
  making the server-resolved value available to Client Components. Mounted
  once, at the root layout (`src/app/layout.tsx`), from the same cookie
  read every server client uses.
- `core/db/server-client.ts` / `core/db/browser-client.ts` /
  `core/db/service-client.ts` — the three Supabase client factories. This is
  the actual centralization point: every query/action module in the app
  calls `createClient()` with no arguments and transparently gets whichever
  project is currently selected. No feature module needs to know DEV/PROD
  exists.

## Why a hard reload on switch, not a soft navigation

`src/app/admin/settings/environment-switcher.tsx` sets the cookie via the
Server Action above, then calls `window.location.assign(...)` — a full
browser reload, not `router.refresh()`. This is deliberate: it's the only
way to guarantee that nothing from the previous environment (Next.js's
Router Cache, a component's in-memory state, an in-flight request already
reading the old project) can survive into the new render. The task this
was built for is explicit that DEV and PROD must never mix, and a full
reload removes an entire category of "did some stale state leak through"
risk for the cost of one brief blank moment during navigation.

## Why switching to PROD needs a fresh sign-in

Supabase Auth sessions are project-scoped: a session token issued by the
DEV project's GoTrue instance does not verify against PROD's, and vice
versa. `core/db/server-client.ts` and `core/db/browser-client.ts` both set
`cookieOptions.name` to `sb-admin-${environment}`, so a DEV session and a
PROD session are stored under different cookie names and can coexist in
the same browser without overwriting each other — but the first time an
admin switches to an environment they haven't signed into yet, the
fail-closed gate in `core/auth/get-platform-admin.ts` correctly finds no
valid session and sends them to `/login`. Signing in there uses whichever
environment is currently active (same `createClient()` factory), so it
authenticates against the right project. This is expected behavior, not a
bug to route around — it's what keeps a DEV credential from ever being
usable against PROD.

## Safety for PROD

- A persistent accent-colored border around the whole viewport
  (`html[data-admin-env="prod"]` in `globals.css`) and an `EnvironmentPill`
  in both the sidebar and mobile header — visible on every screen, not just
  Settings.
- Switching *to* PROD, and every already-dangerous mutation (suspend a gym,
  cancel a subscription, archive a package, retire a billing term, revoke
  an admin) while already on PROD, goes through `ConfirmDialog`'s
  `requireTypedConfirmation="PROD"` — a click alone isn't enough; the admin
  has to type the word.
