"use server";

import { cookies } from "next/headers";
import { ADMIN_ENV_COOKIE, ADMIN_ENV_COOKIE_MAX_AGE } from "./cookie";
import { isAdminEnvironment, type AdminEnvironment } from "@/core/config/environments";

export type SetAdminEnvironmentResult = { error: string | null };

/**
 * The only place the `admin-env` cookie is ever written. Deliberately does
 * NOT call `redirect()`/`revalidatePath()` itself — every Supabase client
 * factory (core/db/{server,service}-client.ts) reads this cookie fresh on
 * every request, so a plain cookie write is already enough for the *data*
 * to be correct on the next navigation. The caller (environment-switcher.tsx)
 * forces a full browser reload after this resolves, which is what actually
 * guarantees no stale client-side state (Router Cache, component state,
 * anything held in memory) survives the switch — see that file's docblock.
 */
export async function setAdminEnvironment(environment: AdminEnvironment): Promise<SetAdminEnvironmentResult> {
  if (!isAdminEnvironment(environment)) {
    return { error: "Not a recognized environment." };
  }

  const cookieStore = await cookies();
  cookieStore.set(ADMIN_ENV_COOKIE, environment, {
    maxAge: ADMIN_ENV_COOKIE_MAX_AGE,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  return { error: null };
}
