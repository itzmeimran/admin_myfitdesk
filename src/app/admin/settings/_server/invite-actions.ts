"use server";

/**
 * Inviting a platform admin. Lives outside src/features/** because creating the
 * invitee's auth account needs the service-role client (`auth.admin.generateLink`),
 * which features/** may not import — the same carve-out the gym-owner invite
 * uses (app/admin/gyms/invite-actions.ts).
 *
 * The order is the security model:
 *   1. The ACTOR's own session for each target environment is used first. The
 *      database function (admin_invite_platform_admin) checks, inside that
 *      environment, that the actor is an active Platform Owner — so nobody can
 *      grant themselves Production access from a Development login, and a
 *      Support admin can't invite at all.
 *   2. Only after that check passes is the service key used, and only to
 *      create the auth account the invitation needs (Postgres cannot).
 *   3. The invitation row is then written through the actor's session again,
 *      which lands the audit entry (`platform_admin.invited`, plus
 *      `platform_admin.production_access_granted` on Production).
 * Inviting to "both" environments repeats this per environment with that
 * environment's own session; if the actor isn't signed in to one of them, that
 * environment reports it and the other still goes through.
 */

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClientForEnvironment } from "@/core/db/server-client";
import { createServiceClientForEnvironment } from "@/core/db/service-client";
import { loose } from "@/core/db/loose-client";
import { checkPermission } from "@/core/auth/access";
import { requireProductionConfirmation } from "@/core/auth/production-guard";
import { ADMIN_ENVIRONMENT_LABEL, ADMIN_ENVIRONMENTS, isAdminEnvironment, type AdminEnvironment } from "@/core/config/environments";
import { ROLE_LABEL } from "@/core/auth/permissions";
import { isEmailConfigured } from "@/core/config/email";
import { platformAdminInviteEmail, type EmailBranding } from "@/core/email/templates";
import { sendSystemEmail } from "@/core/email/system-email";
import { text } from "@/core/forms/form-values";
import { getPlatformSettingsOrFallback } from "@/features/settings/platform-settings";
import { createClient } from "@/core/db/server-client";
import { getActiveAdminEnvironment } from "@/core/env/active-environment";

export type InviteEnvironmentResult = {
  environment: AdminEnvironment;
  ok: boolean;
  message: string;
  /** Only when email couldn't be sent for a brand-new account: the admin passes
   * it on themselves. Never stored; shown once. */
  manualLink?: string;
};

export type InviteState = { error: string | null; results: InviteEnvironmentResult[]; nonce: number };

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(254),
  role: z.string().refine((v) => v in ROLE_LABEL, "Choose a role."),
});

async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

async function inviteIntoEnvironment(input: {
  environment: AdminEnvironment;
  email: string;
  role: string;
  origin: string;
  branding: EmailBranding;
}): Promise<InviteEnvironmentResult> {
  const { environment, email, role, origin, branding } = input;
  const label = ADMIN_ENVIRONMENT_LABEL[environment];
  const fail = (message: string): InviteEnvironmentResult => ({ environment, ok: false, message });

  // 1. The actor's own session for THIS environment.
  const actor = await createClientForEnvironment(environment);
  const { data: claims } = await actor.auth.getClaims();
  if (!claims?.claims?.sub) {
    return fail(`You're not signed in to ${label} in this browser. Switch to ${label}, sign in, then invite from there.`);
  }

  let rpc = await loose(actor).rpc("admin_invite_platform_admin", { p_email: email, p_role: role });
  let tokenHash: string | null = null;
  let tokenType: "invite" | "recovery" = "invite";
  let createdUserId: string | null = null;

  if (rpc.error?.code === "P0002" && rpc.error.message === "NO_ACCOUNT") {
    // 2. A person with no account on this environment yet: create one (service
    //    key), now that the database has confirmed the actor may invite.
    let service;
    try {
      service = await createServiceClientForEnvironment(environment);
    } catch {
      return fail(`${label} can't create accounts from this deployment (its service key isn't configured).`);
    }
    const link = await service.auth.admin.generateLink({ type: "invite", email });
    if (link.error || !link.data?.user) {
      return fail(`Couldn't create the account on ${label}: ${link.error?.message ?? "unknown error"}`);
    }
    createdUserId = link.data.user.id;
    tokenHash = link.data.properties.hashed_token;

    // 3. Record the invitation (and its audit row) through the actor's session.
    rpc = await loose(actor).rpc("admin_invite_platform_admin", { p_email: email, p_role: role, p_user_id: createdUserId });
    if (rpc.error) {
      // Don't leave an orphan auth account behind for an invitation that failed.
      await service.auth.admin.deleteUser(createdUserId).catch(() => undefined);
      return fail(rpc.error.message);
    }
  } else if (rpc.error) {
    return fail(rpc.error.message);
  }

  const invited = rpc.data as { user_id: string; email_confirmed: boolean; expires_at: string };

  // An existing but unconfirmed account (a previous invite that was never
  // accepted): it needs a fresh link, not a plain sign-in.
  if (!tokenHash && !invited.email_confirmed) {
    try {
      const service = await createServiceClientForEnvironment(environment);
      let link = await service.auth.admin.generateLink({ type: "invite", email });
      tokenType = "invite";
      if (link.error) {
        link = await service.auth.admin.generateLink({ type: "recovery", email });
        tokenType = "recovery";
      }
      if (!link.error && link.data) tokenHash = link.data.properties.hashed_token;
    } catch {
      // fall through: the invitation exists; they can be re-sent later
    }
  }

  const actionUrl = tokenHash
    ? `${origin}/auth/confirm?token_hash=${encodeURIComponent(tokenHash)}&type=${tokenType}&env=${environment}`
    : `${origin}/auth/confirm?env=${environment}`;

  if (!isEmailConfigured()) {
    return {
      environment,
      ok: true,
      message: `Invitation recorded for ${label}, but email isn't configured on this server — nothing was sent.`,
      manualLink: actionUrl,
    };
  }

  const { subject, html, text: textBody } = platformAdminInviteEmail({
    roleLabel: ROLE_LABEL[role] ?? role,
    environmentLabel: label,
    actionUrl,
    hasToken: Boolean(tokenHash),
    branding,
  });
  const sent = await sendSystemEmail({ to: email, subject, html, text: textBody });
  if (!sent.ok) {
    return {
      environment,
      ok: true,
      message: `Invitation recorded for ${label}, but the email couldn't be sent (${sent.error}). Use Resend to try again.`,
      manualLink: actionUrl,
    };
  }
  return { environment, ok: true, message: `Invitation emailed for ${label}.` };
}

export async function invitePlatformAdmin(_prev: InviteState, formData: FormData): Promise<InviteState> {
  const done = (error: string | null, results: InviteEnvironmentResult[] = []): InviteState => ({
    error,
    results,
    nonce: Date.now(),
  });

  const allowed = await checkPermission("admins.manage");
  if (!allowed.ok) return done(allowed.error);

  const parsed = inviteSchema.safeParse({ email: text(formData, "email"), role: text(formData, "role") });
  if (!parsed.success) return done(parsed.error.issues[0]?.message ?? "Check the form and try again.");

  const environments = formData
    .getAll("environments")
    .filter((v): v is string => typeof v === "string")
    .filter(isAdminEnvironment);
  const unique = ADMIN_ENVIRONMENTS.filter((env) => environments.includes(env));
  if (!unique.length) return done("Choose at least one environment.");

  // Granting Production access, or acting while on Production, needs the typed word.
  const confirmation = text(formData, "confirmation");
  if (unique.includes("prod")) {
    if (confirmation.trim().toUpperCase() !== "PRODUCTION") {
      return done("Type PRODUCTION to grant Production access.");
    }
  } else {
    const problem = await requireProductionConfirmation(confirmation, allowed.access);
    if (problem) return done(problem);
  }

  const supabase = await createClient();
  const branding = await getPlatformSettingsOrFallback(supabase);
  const origin = await requestOrigin();

  const results: InviteEnvironmentResult[] = [];
  for (const environment of unique) {
    try {
      results.push(
        await inviteIntoEnvironment({
          environment,
          email: parsed.data.email,
          role: parsed.data.role,
          origin,
          branding,
        }),
      );
    } catch (error) {
      results.push({
        environment,
        ok: false,
        message: error instanceof Error ? error.message : "Something went wrong.",
      });
    }
  }

  revalidatePath("/admin/settings/admins");
  revalidatePath("/admin/settings/security");
  return done(null, results);
}

/** Re-send a pending / expired / revoked invitation in the CURRENT environment.
 * Resets the 7-day window and emails a fresh link. */
export async function resendPlatformAdminInvite(
  email: string,
  role: string,
  confirmation?: string,
): Promise<InviteState> {
  const done = (error: string | null, results: InviteEnvironmentResult[] = []): InviteState => ({
    error,
    results,
    nonce: Date.now(),
  });

  const allowed = await checkPermission("admins.manage");
  if (!allowed.ok) return done(allowed.error);
  const problem = await requireProductionConfirmation(confirmation, allowed.access);
  if (problem) return done(problem);

  const environment = await getActiveAdminEnvironment();
  const supabase = await createClient();
  const branding = await getPlatformSettingsOrFallback(supabase);

  const result = await inviteIntoEnvironment({
    environment,
    email: email.trim().toLowerCase(),
    role,
    origin: await requestOrigin(),
    branding,
  });
  revalidatePath("/admin/settings/admins");
  return done(null, [result]);
}
