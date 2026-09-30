"use server";

import { redirect } from "next/navigation";
import { createClientForEnvironment } from "@/core/db/server-client";
import { isAdminEnvironment } from "@/core/config/environments";
import { writeEnvironmentCookie } from "@/core/env/set-cookie";
import { text } from "@/core/forms/form-values";

/**
 * Accepting a platform-admin invitation. Two deliberate choices:
 *
 *  - The email link only OPENS this page; the one-time token is spent when the
 *    person presses the button (a POST). Mail scanners and link previewers
 *    fetch URLs automatically, and if a plain GET redeemed the token they
 *    would burn the invitation before the human ever saw it.
 *  - The token is verified against the environment the invitation BELONGS to
 *    (`env` in the link), never against whichever one the browser happens to
 *    have selected — a Production invitation can only be redeemed on
 *    Production. On success the browser is pointed at that environment so the
 *    next screen (set a password) talks to the right project.
 */
export async function acceptInvitation(formData: FormData): Promise<void> {
  const env = text(formData, "env");
  const tokenHash = text(formData, "token_hash");
  const type = text(formData, "type");

  if (!isAdminEnvironment(env) || !tokenHash || (type !== "invite" && type !== "recovery")) {
    redirect("/auth/confirm?error=invalid");
  }

  const supabase = await createClientForEnvironment(env);
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) {
    redirect(`/auth/confirm?error=expired&env=${env}`);
  }

  await writeEnvironmentCookie(env);
  redirect("/set-password");
}

/** For people who already have an account on that environment: no token to
 * spend, just point the browser at the right environment and sign in. */
export async function continueToSignIn(formData: FormData): Promise<void> {
  const env = text(formData, "env");
  if (!isAdminEnvironment(env)) redirect("/login");
  await writeEnvironmentCookie(env);
  redirect("/login");
}
