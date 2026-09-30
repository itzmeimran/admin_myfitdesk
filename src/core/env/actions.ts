"use server";

import { writeEnvironmentCookie } from "./set-cookie";
import { isAdminEnvironment, type AdminEnvironment } from "@/core/config/environments";
import { getActiveAdminEnvironment } from "./active-environment";
import { createClient } from "@/core/db/server-client";
import { loose } from "@/core/db/loose-client";
import { PRODUCTION_CONFIRMATION } from "@/core/auth/production-guard";

export type SetAdminEnvironmentResult = { error: string | null };

const FULL_NAME: Record<AdminEnvironment, "development" | "production"> = {
  dev: "development",
  prod: "production",
};

/**
 * The only place the `admin-env` cookie is ever written. Deliberately does
 * NOT call `redirect()`/`revalidatePath()` itself — every Supabase client
 * factory (core/db/{server,service}-client.ts) reads this cookie fresh on
 * every request, so a plain cookie write is already enough for the *data*
 * to be correct on the next navigation. The caller (environment-switcher.tsx)
 * forces a full browser reload after this resolves, which is what actually
 * guarantees no stale client-side state (Router Cache, component state,
 * anything held in memory) survives the switch — see that file's docblock.
 *
 * Entering Production requires the typed word PRODUCTION; that is checked HERE,
 * not just in the dialog, so the action can't be used to skip the prompt.
 * Going back to Development needs no confirmation.
 *
 * The switch is recorded (`platform_environment.switched`) in the audit log of
 * the environment being LEFT — that is the database the admin is signed in to
 * at this moment. The record is best-effort: a logging failure (for example the
 * Settings migration not yet applied there) must never trap someone in the
 * wrong environment.
 */
export async function setAdminEnvironment(
  environment: AdminEnvironment,
  confirmation?: string,
): Promise<SetAdminEnvironmentResult> {
  if (!isAdminEnvironment(environment)) {
    return { error: "Not a recognized environment." };
  }

  if (environment === "prod" && (confirmation ?? "").trim().toUpperCase() !== PRODUCTION_CONFIRMATION) {
    return { error: `Type ${PRODUCTION_CONFIRMATION} to switch to Production.` };
  }

  const previous = await getActiveAdminEnvironment();
  if (previous !== environment) {
    try {
      const supabase = await createClient();
      await loose(supabase).rpc("admin_log_environment_switch", {
        p_from: FULL_NAME[previous],
        p_to: FULL_NAME[environment],
      });
    } catch {
      // Best-effort by design — see the docblock.
    }
  }

  await writeEnvironmentCookie(environment);

  return { error: null };
}
