import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { publicEnv } from "@/core/config/public";
import type { Database } from "./database.types";

/**
 * RLS applies — uses the signed-in user's session, not the secret key. The
 * default client for Server Components, Server Actions, and Route Handlers.
 *
 * Copied from FitDeskApp/src/core/db/server-client.ts, with the
 * `core/perf/*` instrumented-fetch wiring stripped out — that's tenant-app
 * performance tooling this admin app doesn't have yet, not something this
 * client needs to function.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
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
    },
  );
}
