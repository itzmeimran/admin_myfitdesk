import "server-only";
import { cookies } from "next/headers";
import { ADMIN_ENV_COOKIE, ADMIN_ENV_COOKIE_MAX_AGE } from "./cookie";
import type { AdminEnvironment } from "@/core/config/environments";

/** The one place the `admin-env` cookie is written. Callers decide WHETHER a
 * switch is allowed (core/env/actions.ts demands the typed PRODUCTION for
 * Production; the invitation pages land someone in the environment their
 * invitation belongs to); this only writes it. */
export async function writeEnvironmentCookie(environment: AdminEnvironment): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_ENV_COOKIE, environment, {
    maxAge: ADMIN_ENV_COOKIE_MAX_AGE,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}
