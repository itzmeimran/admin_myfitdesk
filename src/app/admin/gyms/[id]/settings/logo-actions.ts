"use server";

/**
 * Replace or remove a gym's logo from the admin app. Outside src/features/**
 * because the Storage write needs the service client (the admin has no
 * staff_membership in any org, so the gym-logos bucket's own org-scoped
 * policy would refuse it); the organizations.logo_url write goes through
 * admin_update_gym_logo, which re-checks platform-admin itself and audits.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/core/db/server-client";
import { createServiceClient } from "@/core/db/service-client";
import { ALLOWED_LOGO_TYPES, LOGO_EXTENSIONS, MAX_LOGO_BYTES, logoExtension } from "@/core/storage/logo-limits";

const BUCKET = "gym-logos";

export type LogoResult = { error: string | null; url?: string | null };

function revalidate() {
  revalidatePath("/admin/gyms");
  revalidatePath("/admin/gyms/[id]", "layout");
}

export async function updateGymLogo(organizationId: string, formData: FormData): Promise<LogoResult> {
  if (!z.string().uuid().safeParse(organizationId).success) return { error: "Invalid gym." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose an image to upload." };
  if (file.size > MAX_LOGO_BYTES) return { error: "Gym logo must be smaller than 5 MB." };
  if (!ALLOWED_LOGO_TYPES.has(file.type)) return { error: "Gym logo must be a PNG, JPEG or WebP image." };

  const supabase = await createClient();
  const service = await createServiceClient();
  const ext = logoExtension(file.type);
  const path = `${organizationId}/logo.${ext}`;

  // Drop a previous logo saved under a different extension so it can't linger.
  const stale = LOGO_EXTENSIONS.filter((e) => e !== ext).map((e) => `${organizationId}/logo.${e}`);
  await service.storage.from(BUCKET).remove(stale);

  const { error: uploadError } = await service.storage
    .from(BUCKET)
    .upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: true });
  if (uploadError) return { error: `Couldn't upload the logo: ${uploadError.message}` };

  // Version the URL so the CDN/browser doesn't keep serving the replaced file.
  const url = `${service.storage.from(BUCKET).getPublicUrl(path).data.publicUrl}?v=${Date.now()}`;
  const { error } = await supabase.rpc("admin_update_gym_logo", {
    p_organization_id: organizationId,
    p_logo_url: url,
  });
  if (error) return { error: error.message };

  revalidate();
  return { error: null, url };
}

export async function removeGymLogo(organizationId: string): Promise<LogoResult> {
  if (!z.string().uuid().safeParse(organizationId).success) return { error: "Invalid gym." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_update_gym_logo", {
    p_organization_id: organizationId,
    p_logo_url: null,
  });
  if (error) return { error: error.message };

  const service = await createServiceClient();
  await service.storage.from(BUCKET).remove(LOGO_EXTENSIONS.map((e) => `${organizationId}/logo.${e}`));

  revalidate();
  return { error: null, url: null };
}
