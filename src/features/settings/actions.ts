"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/core/db/server-client";

/**
 * Admin roster writes — same shape as every other write path in this app
 * (features/packages/actions.ts, features/gyms/actions.ts): every mutation
 * calls a SECURITY DEFINER RPC (supabase/migrations/1007_admin_roster_rpcs.sql)
 * that does the table write and the admin_audit_log entry in one
 * transaction. There is deliberately no `.from("platform_admins")` call
 * anywhere here — that table has no client-write policy at all, by design.
 */

const grantSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
});

export type GrantAdminFormState = { error: string | null };

export async function grantPlatformAdmin(
  _prev: GrantAdminFormState,
  formData: FormData,
): Promise<GrantAdminFormState> {
  const parsed = grantSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Enter a valid email address." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_grant_platform_admin", { p_email: parsed.data.email });
  if (error) return { error: error.message };

  revalidatePath("/admin/settings");
  return { error: null };
}

export async function revokePlatformAdmin(userId: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_revoke_platform_admin", { p_user_id: userId });
  if (error) return { error: error.message };

  revalidatePath("/admin/settings");
  return { error: null };
}

/** Reactivating a revoked admin is the same RPC as granting a new one (the
 * upsert in 1007's admin_grant_platform_admin clears revoked_at either
 * way) — this just gives the roster table's "Reactivate" button a plain
 * imperative call instead of needing a form, matching revokePlatformAdmin's
 * shape above rather than grantPlatformAdmin's useActionState one. */
export async function reactivatePlatformAdmin(email: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_grant_platform_admin", { p_email: email });
  if (error) return { error: error.message };

  revalidatePath("/admin/settings");
  return { error: null };
}
