"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/core/db/server-client";

/**
 * Plain Supabase email+password sign-in against the same `auth.users` pool
 * FitDeskApp uses (same Supabase project — see CLAUDE.md D-B). No username
 * expansion here: FitDeskApp's synthetic-username sign-in
 * (isBareUsername/usernameToSyntheticEmail) exists only for owner-provisioned
 * staff/trainer logins, a tenant-app concept that has no equivalent for a
 * platform admin, who is a real person with a real email.
 *
 * Signing in here only proves *who* someone is — whether they're actually
 * allowed onto /admin is decided separately, and fail-closed, by
 * src/app/admin/layout.tsx's app.is_platform_admin() check. A successful
 * sign-in from a non-admin account still redirects to /admin and hits that
 * gate immediately.
 */
const signInSchema = z.object({
  email: z.string().trim().min(1, "Enter your email.").max(320, "That isn't a valid email."),
  password: z.string().min(1, "Enter your password."),
});

export type SignInState = {
  error: string | null;
  /** Echoed back so a failed attempt doesn't wipe what was typed. Never the
   * password. */
  email?: string;
};

export async function signIn(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    const submitted = formData.get("email");
    return {
      error: parsed.error.issues[0]?.message ?? "Check your details and try again.",
      email: typeof submitted === "string" ? submitted : undefined,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    return { error: "That email or password doesn't match an account.", email: parsed.data.email };
  }

  redirect("/admin");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
