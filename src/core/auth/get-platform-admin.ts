import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/core/db/server-client";
import { loose } from "@/core/db/loose-client";

export type PlatformAdminContext = {
  userId: string;
  email: string | null;
};

export type PlatformAdminResult =
  | { authorized: true; context: PlatformAdminContext }
  | { authorized: false; reason: string };

/**
 * Resolves whether the signed-in user may reach /admin. Two steps, both
 * required:
 *
 * 1. Who is this — same technique as FitDeskApp's
 *    core/auth/get-session-context.ts: `getClaims()` verifies the access
 *    token's signature locally against the project's cached JWKS rather
 *    than a full network round trip to the auth server (`getUser()`).
 * 2. Are they a platform admin — `supabase.rpc("is_platform_admin")`,
 *    which calls the `public.is_platform_admin()` wrapper defined in
 *    supabase/migrations/1001_platform_admins.sql (that migration also
 *    defines the real predicate, `app.is_platform_admin()`, matching
 *    FitDeskApp's convention of keeping RLS-predicate logic in the `app`
 *    schema — the public wrapper exists only because PostgREST/`.rpc()`
 *    can't reach a non-public schema directly). Applied to the live
 *    project (CLAUDE.md's D-1); `platform_admins` still needs a row
 *    inserted (service-role only, by design) before anyone can pass this
 *    check.
 *
 * Fail-closed by design — the deliberate opposite of FitDeskApp's billing
 * check (`resolveBillingAccess`, which degrades OPEN on a missing table or
 * a read error, because locking every gym out of its own dashboard over a
 * transient billing-read failure is a worse outcome than a few days of
 * free access). There is no equivalent "safe to over-grant" argument for a
 * cross-tenant admin console: an error or an unexpected RPC result here
 * must always mean "no access", never "access, probably". A missing
 * function, a network blip, a malformed response, and an actual `false`
 * are all treated identically — denied.
 */
async function resolvePlatformAdminUncached(): Promise<PlatformAdminResult> {
  const supabase = await createClient();

  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;

  if (claimsError || !userId) {
    redirect("/login");
  }

  const email = (claimsData?.claims?.email as string | undefined) ?? null;

  let { data, error } = await supabase.rpc("is_platform_admin");

  // A person invited as a platform admin becomes active the first time they
  // sign in: claim_platform_admin_invitation() turns THEIR OWN pending,
  // unexpired invitation into access (self-scoped in the database — it can
  // only ever touch the caller's own row). Only attempted when the normal
  // check said no, so an existing admin pays nothing for it. Errors (e.g. the
  // function is not installed on this environment yet) are ignored: the
  // fail-closed result below stands.
  if (!error && data !== true) {
    const claim = await loose(supabase).rpc("claim_platform_admin_invitation");
    if (!claim.error && claim.data === "activated") {
      ({ data, error } = await supabase.rpc("is_platform_admin"));
    }
  }

  if (error) {
    return { authorized: false, reason: error.message };
  }
  if (data !== true) {
    return { authorized: false, reason: `is_platform_admin returned ${JSON.stringify(data)}, not true` };
  }

  return { authorized: true, context: { userId, email } };
}

export const resolvePlatformAdmin = cache(resolvePlatformAdminUncached);
