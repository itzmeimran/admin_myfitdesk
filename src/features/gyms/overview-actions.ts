"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/core/db/server-client";

const noteSchema = z.object({
  organizationId: z.string().uuid(),
  content: z.string().trim().min(1, "Write a note first.").max(2000, "Keep the note under 2,000 characters."),
  category: z.string().trim().max(60).optional(),
});

export type AddGymNoteState = { error: string | null; success?: boolean };

export async function addGymNote(_previous: AddGymNoteState, formData: FormData): Promise<AddGymNoteState> {
  const parsed = noteSchema.safeParse({
    organizationId: formData.get("organizationId"),
    content: formData.get("content"),
    category: formData.get("category") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the note and try again." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_add_gym_note", {
    p_organization_id: parsed.data.organizationId,
    p_content: parsed.data.content,
    p_category: parsed.data.category,
  });
  if (error) return { error: error.message };

  revalidatePath(`/admin/gyms/${parsed.data.organizationId}`);
  return { error: null, success: true };
}
