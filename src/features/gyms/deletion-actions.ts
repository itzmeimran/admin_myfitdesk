"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertPermission } from "@/core/auth/access";
import { createClient } from "@/core/db/server-client";
import { loose } from "@/core/db/loose-client";

export async function requestGymDeletion(input: { organizationId: string; days: number; reason: string; confirmation: string }) {
  await assertPermission("gyms.manage");
  const parsed = z.object({ organizationId: z.string().uuid(), days: z.number().int().min(3).max(7), reason: z.string().trim().min(3).max(500), confirmation: z.string().min(1) }).safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the deletion request." };
  const { error } = await loose(await createClient()).rpc("admin_request_gym_deletion", {
    p_organization_id: parsed.data.organizationId, p_days: parsed.data.days,
    p_reason: parsed.data.reason, p_confirmation: parsed.data.confirmation,
  });
  if (error) return { error: error.message };
  revalidatePath("/admin/gyms");
  revalidatePath("/admin/gyms/[id]", "layout");
  revalidatePath("/admin/system/disaster-recovery");
  return { error: null };
}

export async function restoreGymDeletion(organizationId: string) {
  await assertPermission("gyms.manage");
  if (!z.string().uuid().safeParse(organizationId).success) return { error: "Invalid gym." };
  const { error } = await loose(await createClient()).rpc("restore_gym_deletion", { p_organization_id: organizationId });
  if (error) return { error: error.message };
  revalidatePath("/admin/gyms");
  revalidatePath("/admin/gyms/[id]", "layout");
  revalidatePath("/admin/system/disaster-recovery");
  return { error: null };
}
