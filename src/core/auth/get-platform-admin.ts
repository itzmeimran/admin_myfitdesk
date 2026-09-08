import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/core/db/server-client";

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
 *    can't reach a non-public schema directly). **That migration is not
 *    yet applied to the live project** (see its own header comment and
 *    CLAUDE.md's D-1) — so today, in every environment, this RPC call
 *    fails with "function does not exist" and every user is denied.
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

  // database.types.ts predates migration 1001 and its own header comment
  // says to cast around it rather than hand-edit it for the tables/
  // functions that migration adds — `is_platform_admin` isn't a key of
  // Database["public"]["Functions"] yet, so `.rpc()` needs an explicit
  // (narrow, typed) cast rather than losing type-safety on the whole
  // client. Regenerate database.types.ts once 1001 is applied and this
  // cast can go away.
  //
  // The cast is applied to `supabase` itself, not to `supabase.rpc` —
  // extracting the method into its own variable (`const rpc = supabase.rpc`)
  // detaches it from `this`, and supabase-js's rpc() implementation reads
  // `this.rest` internally. Called that way it throws "Cannot read
  // properties of undefined (reading 'rest')" at runtime — a real
  // production bug this shape caused everywhere it was used (caught via
  // Vercel's runtime logs after deploy; tsc/eslint/build all stay green
  // for this mistake since it's a runtime `this`-binding issue, not a type
  // error). Casting the client and keeping `supabase.rpc(...)` as a normal
  // method call keeps `this` bound correctly.
  const typedSupabase = supabase as unknown as {
    rpc(fn: "is_platform_admin"): PromiseLike<{ data: unknown; error: { message: string } | null }>;
  };
  const rpcResult = await typedSupabase.rpc("is_platform_admin");

  if (rpcResult.error) {
    return { authorized: false, reason: rpcResult.error.message };
  }
  if (rpcResult.data !== true) {
    return { authorized: false, reason: `is_platform_admin returned ${JSON.stringify(rpcResult.data)}, not true` };
  }

  return { authorized: true, context: { userId, email } };
}

export const resolvePlatformAdmin = cache(resolvePlatformAdminUncached);
