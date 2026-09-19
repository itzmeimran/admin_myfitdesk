import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { getPublicSupabaseCredentials } from "@/core/config/public";
import { getActiveAdminEnvironment } from "@/core/env/active-environment";
import type { Database } from "./database.types";

/**
 * A token minted by Supabase Auth a moment ago can be rejected by PostgREST
 * with "JWT issued at future" when the two services' clocks differ by a
 * second or so — seen right after sign-in, when the first dashboard render
 * fires several RPCs at once. It resolves itself as soon as the clocks catch
 * up, so retry briefly instead of crashing the page to the error boundary.
 */
async function fetchTolerantOfClockSkew(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const delaysMs = [400, 900, 1600];
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(input, init);
    if (response.status !== 401 || attempt >= delaysMs.length) return response;
    const body = await response.clone().text().catch(() => "");
    if (!body.includes("JWT issued at future")) return response;
    await new Promise((resolve) => setTimeout(resolve, delaysMs[attempt]));
  }
}

/**
 * RLS applies — uses the signed-in user's session, not the secret key. The
 * default client for Server Components, Server Actions, and Route Handlers.
 *
 * Copied from FitDeskApp/src/core/db/server-client.ts, with the
 * `core/perf/*` instrumented-fetch wiring stripped out — that's tenant-app
 * performance tooling this admin app doesn't have yet, not something this
 * client needs to function.
 *
 * **DEV/PROD switching**: which Supabase project this resolves to is read
 * once, here, from `getActiveAdminEnvironment()` (the `admin-env` cookie) —
 * every one of this app's ~15 call sites (every queries.ts and actions.ts
 * module under `features`) just calls `createClient()` with no arguments
 * and automatically gets the admin's currently-selected environment, with
 * zero per-call-site changes. That's the whole point of centralizing this
 * in one factory rather than threading an environment argument through
 * every query/action function.
 *
 * `cookieOptions.name` is set explicitly (rather than left to `@supabase/
 * ssr`'s own project-ref-derived default) so the auth session cookie name
 * is deterministic and visibly environment-scoped in code, not an
 * implementation detail of URL parsing: a DEV sign-in and a PROD sign-in
 * are stored under different cookie names and can coexist in the same
 * browser without either overwriting the other. Switching the `admin-env`
 * cookie to an environment with no matching auth cookie yet correctly
 * yields "not signed in" for *that* project — Supabase Auth sessions are
 * project-scoped, so an admin who has only ever signed into DEV must sign
 * in again the first time they switch to PROD. That's expected, not a bug:
 * see core/env/README.md.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const environment = await getActiveAdminEnvironment();
  const { url, publishableKey } = getPublicSupabaseCredentials(environment);

  return createServerClient<Database>(url, publishableKey, {
    global: { fetch: fetchTolerantOfClockSkew },
    cookieOptions: { name: `sb-admin-${environment}` },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component that can't set cookies — a
          // middleware/proxy layer would refresh the session cookie on the
          // next request instead, same as FitDeskApp's proxy.ts.
        }
      },
    },
  });
}
