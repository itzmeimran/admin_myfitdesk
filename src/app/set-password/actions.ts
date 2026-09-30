"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/core/db/server-client";
import { loose } from "@/core/db/loose-client";
import { text } from "@/core/forms/form-values";

export type SetPasswordState = { error: string | null };

const schema = z
  .object({
    password: z
      .string()
      .min(10, "Use at least 10 characters.")
      .max(128, "That password is too long."),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: "The two passwords don't match.", path: ["confirm"] });

/**
 * Final step of a platform-admin invitation: the invited person chooses their
 * OWN password (nobody else ever sees or sets it), then their pending
 * invitation is claimed — claim_platform_admin_invitation() is self-scoped in
 * the database, so it can only ever activate the signed-in person's own,
 * unexpired invitation.
 */
export async function setInvitedPassword(_prev: SetPasswordState, formData: FormData): Promise<SetPasswordState> {
  const parsed = schema.safeParse({ password: text(formData, "password"), confirm: text(formData, "confirm") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the password and try again." };

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) {
    return { error: "Your invitation session has expired. Open the link from your email again." };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: error.message };

  const claim = await loose(supabase).rpc("claim_platform_admin_invitation");
  if (claim.error) return { error: "Your password was saved, but activating your access failed. Try signing in." };
  if (claim.data === "expired") {
    return { error: "Your password was saved, but this invitation has expired. Ask a Platform Owner to resend it." };
  }

  redirect("/admin");
}
