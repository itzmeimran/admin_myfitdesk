import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getPublicSupabaseCredentials } from "@/core/config/public";
import { DEFAULT_ADMIN_ENVIRONMENT, isAdminEnvironment } from "@/core/config/environments";
import { ADMIN_ENV_COOKIE } from "@/core/env/cookie";
import type { Database } from "@/core/db/database.types";

/** Refresh before rendering: Server Components cannot persist rotated tokens
 * or delete an invalid session. Only the selected project's cookies change. */
export async function proxy(request: NextRequest) {
  const selected = request.cookies.get(ADMIN_ENV_COOKIE)?.value;
  const environment = isAdminEnvironment(selected) ? selected : DEFAULT_ADMIN_ENVIRONMENT;
  const { url, publishableKey } = getPublicSupabaseCredentials(environment);
  let response = NextResponse.next({ request });
  const supabase = createServerClient<Database>(url, publishableKey, {
    cookieOptions: { name: `sb-admin-${environment}` },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const pathname = request.nextUrl.pathname;
  if (!data?.claims?.sub && (pathname === "/admin" || pathname.startsWith("/admin/"))) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = "";
    const redirect = NextResponse.redirect(login);
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    for (const name of ["cache-control", "expires", "pragma"]) {
      const value = response.headers.get(name);
      if (value) redirect.headers.set(name, value);
    }
    response = redirect;
  }

  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: ["/", "/admin/:path*", "/login", "/set-password"],
};
