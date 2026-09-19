"use server";

/**
 * Gym Owner Onboarding — enables "Invite gym owner" (CLAUDE.md's Plan, P2
 * item 9: "needs new infra this pass doesn't have — email sending, an
 * invite-token flow"). Lives outside src/features/** for the same reason
 * FitDeskApp's src/app/signup/actions.ts and src/app/dashboard/staff/
 * actions.ts do: it needs `supabase.auth.admin.generateLink()` and Storage
 * writes, both of which require the service-role client, which the eslint
 * boundary rule blocks features/** from importing.
 *
 * Design, audited from FitDeskApp's own architecture before writing any of
 * this (see supabase/migrations/1012_gym_owner_onboarding.sql's own header
 * for the full reasoning): this REUSES FitDeskApp's existing
 * `staff_invitations` table and its whole `/invite/accept` flow — role=
 * 'owner' was already a supported value there (an existing owner inviting a
 * co-owner), so a platform-admin-created invitation for a brand-new gym's
 * very first owner takes the identical path once the row exists. Nothing in
 * FitDeskApp's own invite-accept UI needed to change for this to work.
 *
 * generateLink({type:"invite"}) + a self-sent branded email (never
 * Supabase's own default invite email) is the exact same pattern
 * FitDeskApp's own inviteStaff/signUpForGym actions use — reused here by
 * copying the pattern (D-B), not by importing across repos.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/core/db/server-client";
import { createServiceClient } from "@/core/db/service-client";
import { text } from "@/core/forms/form-values";
import { emailEnv, isEmailConfigured } from "@/core/config/email";
import { sendSystemEmail } from "@/core/email/system-email";
import { gymOwnerInviteEmail } from "@/core/email/templates";

import { ALLOWED_LOGO_TYPES, MAX_LOGO_BYTES, logoExtension } from "@/core/storage/logo-limits";

const billingModeSchema = z.enum(["trial", "paid", "custom"]);

const inviteSchema = z
  .object({
    gymName: z.string().trim().min(1, "Enter a gym name.").max(160),
    ownerFirstName: z.string().trim().min(1, "Enter the owner's first name.").max(100),
    ownerLastName: z.string().trim().max(100).optional().default(""),
    email: z.string().trim().min(1, "Enter an email address.").email("Enter a valid email address."),
    phone: z.string().trim().max(30).optional().default(""),
    addressLine: z.string().trim().max(200).optional().default(""),
    city: z.string().trim().max(120).optional().default(""),
    state: z.string().trim().max(120).optional().default(""),
    country: z.string().trim().max(120).optional().default(""),
    postalCode: z.string().trim().max(20).optional().default(""),
    defaultTimezone: z.string().trim().max(60).optional().default("Asia/Kolkata"),
    defaultCurrency: z.string().trim().max(10).optional().default("INR"),
    billingMode: billingModeSchema,
    trialDays: z.string().trim(),
    packageId: z.string().trim(),
    periodDays: z.string().trim(),
    customDays: z.string().trim(),
    notes: z.string().trim().max(500).optional().default(""),
  })
  .superRefine((val, ctx) => {
    if (val.billingMode === "paid" && !z.string().uuid().safeParse(val.packageId).success) {
      ctx.addIssue({ code: "custom", message: "Choose a subscription plan.", path: ["packageId"] });
    }
    if (val.billingMode === "custom") {
      const n = Number(val.customDays);
      if (!Number.isInteger(n) || n <= 0) {
        ctx.addIssue({ code: "custom", message: "Enter how many days of access to grant.", path: ["customDays"] });
      }
    }
  });

export type InviteFormState = {
  error: string | null;
  success?: { gymCode: string; organizationId: string; manualLink?: string };
};

function positiveIntOrUndefined(raw: string): number | undefined {
  const n = Number(raw.trim());
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

export async function inviteGymOwner(_prev: InviteFormState, formData: FormData): Promise<InviteFormState> {
  const parsed = inviteSchema.safeParse({
    gymName: text(formData, "gymName"),
    ownerFirstName: text(formData, "ownerFirstName"),
    ownerLastName: text(formData, "ownerLastName"),
    email: text(formData, "email"),
    phone: text(formData, "phone"),
    addressLine: text(formData, "addressLine"),
    city: text(formData, "city"),
    state: text(formData, "state"),
    country: text(formData, "country"),
    postalCode: text(formData, "postalCode"),
    defaultTimezone: text(formData, "defaultTimezone"),
    defaultCurrency: text(formData, "defaultCurrency"),
    billingMode: text(formData, "billingMode"),
    trialDays: text(formData, "trialDays"),
    packageId: text(formData, "packageId"),
    periodDays: text(formData, "periodDays"),
    customDays: text(formData, "customDays"),
    notes: text(formData, "notes"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  }
  const data = parsed.data;

  const logo = formData.get("logo");
  const hasLogo = logo instanceof File && logo.size > 0;
  if (hasLogo) {
    if ((logo as File).size > MAX_LOGO_BYTES) {
      return { error: "Gym logo must be smaller than 5 MB." };
    }
    if (!ALLOWED_LOGO_TYPES.has((logo as File).type)) {
      return { error: "Gym logo must be a PNG, JPEG or WebP image." };
    }
  }

  const supabase = await createClient();

  const { data: created, error: createError } = await supabase.rpc("admin_create_gym_owner_invitation", {
    p_gym_name: data.gymName,
    p_owner_first_name: data.ownerFirstName,
    p_owner_last_name: data.ownerLastName || undefined,
    p_email: data.email,
    p_phone: data.phone || undefined,
    p_address_line: data.addressLine || undefined,
    p_city: data.city || undefined,
    p_state: data.state || undefined,
    p_country: data.country || undefined,
    p_postal_code: data.postalCode || undefined,
    p_default_timezone: data.defaultTimezone || undefined,
    p_default_currency: data.defaultCurrency || undefined,
    p_billing_mode: data.billingMode,
    p_trial_days: data.billingMode === "trial" ? (positiveIntOrUndefined(data.trialDays) ?? 14) : undefined,
    p_package_id: data.billingMode === "paid" ? data.packageId : undefined,
    p_period_days:
      data.billingMode === "paid"
        ? positiveIntOrUndefined(data.periodDays)
        : data.billingMode === "custom"
          ? positiveIntOrUndefined(data.customDays)
          : undefined,
    p_notes: data.notes || undefined,
  });

  if (createError) {
    // The RPC's own messages (duplicate email, existing account, invalid
    // plan, ...) are already admin-legible — surface them as-is rather than
    // Postgres's raw wrapper text.
    return { error: createError.message };
  }

  const result = (Array.isArray(created) ? created[0] : created) as {
    organization_id: string;
    gym_code: string;
    invitation_id: string;
    email: string;
  };

  // Logo upload — best-effort, after the gym exists (it needs a real
  // organization id for its storage path), via the service client since a
  // brand-new gym has no staff_membership yet for the bucket's own
  // org-membership-scoped RLS policy to authorize against.
  if (hasLogo) {
    try {
      const serviceClient = await createServiceClient();
      const file = logo as File;
      const path = `${result.organization_id}/logo.${logoExtension(file.type)}`;
      const buffer = Buffer.from(await file.arrayBuffer());
      const { error: uploadError } = await serviceClient.storage
        .from("gym-logos")
        .upload(path, buffer, { contentType: file.type, upsert: true });
      if (!uploadError) {
        const { data: publicUrl } = serviceClient.storage.from("gym-logos").getPublicUrl(path);
        // Not a direct organizations update: admins have no UPDATE policy
        // there, so that would silently change zero rows.
        await supabase.rpc("admin_update_gym_logo", {
          p_organization_id: result.organization_id,
          p_logo_url: publicUrl.publicUrl,
        });
      }
      // A logo failure is never fatal to onboarding — the gym and its
      // invitation already exist; the admin can set a logo later from the
      // gym's Settings tab.
    } catch {
      // best-effort, as above
    }
  }

  revalidatePath("/admin/gyms");
  revalidatePath("/admin");

  const redirectTo = `${emailEnv.MYFITDESK_ORIGIN}/auth/confirm?type=invite&next=${encodeURIComponent("/invite/accept")}`;

  if (!isEmailConfigured()) {
    return {
      error: null,
      success: {
        gymCode: result.gym_code,
        organizationId: result.organization_id,
        manualLink: "Email isn't configured on this server — no invitation email was sent. Use \"Resend invitation\" from the gym's page once email is configured, or share the sign-up manually.",
      },
    };
  }

  const serviceClient = await createServiceClient();
  const { data: linkData, error: linkError } = await serviceClient.auth.admin.generateLink({
    type: "invite",
    email: result.email,
    options: { redirectTo },
  });

  if (linkError || !linkData) {
    return {
      error: null,
      success: {
        gymCode: result.gym_code,
        organizationId: result.organization_id,
        manualLink: `The gym was created, but the invitation email could not be generated (${linkError?.message ?? "unknown error"}). Use "Resend invitation" from the gym's page to try again.`,
      },
    };
  }

  const confirmationUrl = `${emailEnv.MYFITDESK_ORIGIN}/auth/confirm?token_hash=${encodeURIComponent(
    linkData.properties.hashed_token,
  )}&type=invite&next=${encodeURIComponent("/invite/accept")}`;

  const { subject, html, text: textBody } = gymOwnerInviteEmail({
    gymName: data.gymName,
    ownerFirstName: data.ownerFirstName,
    confirmationUrl,
  });
  const sendResult = await sendSystemEmail({ to: result.email, subject, html, text: textBody });

  if (!sendResult.ok) {
    return {
      error: null,
      success: {
        gymCode: result.gym_code,
        organizationId: result.organization_id,
        manualLink: `The gym was created, but the invitation email couldn't be sent (${sendResult.error}). Use "Resend invitation" from the gym's page to try again.`,
      },
    };
  }

  return { error: null, success: { gymCode: result.gym_code, organizationId: result.organization_id } };
}

type ActionResult = { error: string | null };

/** Resend — resets the invitation's 7-day expiry (admin_resend_gym_owner_
 * invitation) and re-sends a fresh branded link the same way the original
 * invite did. Covers "invitation expired", "user clicks invitation multiple
 * times" (the old link still redeems until a NEW one is generated — this
 * doesn't invalidate it, matching generateLink's own semantics) and "email
 * sending failure" from the task brief's error-handling list. */
export async function resendGymOwnerInvitation(invitationId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: resent, error } = await supabase.rpc("admin_resend_gym_owner_invitation", {
    p_invitation_id: invitationId,
  });
  if (error) return { error: error.message };

  const row = (Array.isArray(resent) ? resent[0] : resent) as { email: string; organization_id: string; organization_name: string };

  const redirectTo = `${emailEnv.MYFITDESK_ORIGIN}/auth/confirm?type=invite&next=${encodeURIComponent("/invite/accept")}`;

  if (!isEmailConfigured()) {
    return { error: "Email isn't configured on this server — the invitation was reset, but no email was sent." };
  }

  const serviceClient = await createServiceClient();
  const { data: linkData, error: linkError } = await serviceClient.auth.admin.generateLink({
    type: "invite",
    email: row.email,
    options: { redirectTo },
  });
  if (linkError || !linkData) {
    return { error: `Couldn't generate a new link: ${linkError?.message ?? "unknown error"}` };
  }

  const confirmationUrl = `${emailEnv.MYFITDESK_ORIGIN}/auth/confirm?token_hash=${encodeURIComponent(
    linkData.properties.hashed_token,
  )}&type=invite&next=${encodeURIComponent("/invite/accept")}`;

  const { subject, html, text: textBody } = gymOwnerInviteEmail({
    gymName: row.organization_name,
    ownerFirstName: "",
    confirmationUrl,
  });
  const sendResult = await sendSystemEmail({ to: row.email, subject, html, text: textBody });
  if (!sendResult.ok) return { error: sendResult.error };

  revalidatePath("/admin/gyms");
  revalidatePath("/admin/gyms/[id]", "layout");
  return { error: null };
}

export async function revokeGymOwnerInvitation(invitationId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_revoke_gym_owner_invitation", { p_invitation_id: invitationId });
  if (error) return { error: error.message };
  revalidatePath("/admin/gyms");
  revalidatePath("/admin/gyms/[id]", "layout");
  return { error: null };
}
