"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { cookies } from "next/headers";
import { createClientForEnvironment } from "@/core/db/server-client";
import { ADMIN_ENVIRONMENTS } from "@/core/config/environments";
import { getActiveAdminEnvironment } from "@/core/env/active-environment";

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

  const environment = await getActiveAdminEnvironment();
  const supabase = await createClientForEnvironment(environment);
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    return { error: "That email or password doesn't match an account.", email: parsed.data.email };
  }

  // Authenticate independently against the other project while the submitted
  // password is available. Never persist it or reuse one project's JWT in the
  // other. A mismatch/outage there must not prevent the selected login.
  const otherEnvironment = environment === "dev" ? "prod" : "dev";
  try {
    const other = await createClientForEnvironment(otherEnvironment);
    await other.auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.password,
    });
  } catch {
    // The selected session is valid; the other environment can be signed into later.
  }

  redirect("/admin");
}

export async function signOut() {
  await Promise.allSettled(ADMIN_ENVIRONMENTS.map(async (environment) => {
    const supabase = await createClientForEnvironment(environment);
    await supabase.auth.signOut();
  }));
  // Even if Auth is unreachable, remove both local sessions (including chunks)
  // so a later environment switch cannot restore a signed-out admin console.
  const cookieStore = await cookies();
  for (const { name } of cookieStore.getAll()) {
    if (ADMIN_ENVIRONMENTS.some((environment) =>
      name === `sb-admin-${environment}` || name.startsWith(`sb-admin-${environment}.`))) {
      cookieStore.set(name, "", { path: "/", maxAge: 0 });
    }
  }
  redirect("/login");
}
