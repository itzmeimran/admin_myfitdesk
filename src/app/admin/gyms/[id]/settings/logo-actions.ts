"use server";

/**
 * Replace or remove a gym's logo from the admin app. Outside src/features/**
 * because the storage write needs server-only credentials (R2 keys / the
 * service client — the admin has no staff_membership in any org, so the
 * gym-logos bucket's own org-scoped policy would refuse a Supabase write).
 * The organizations.logo_url write goes through admin_update_gym_logo, which
 * re-checks platform-admin itself and audits.
 *
 * Storage goes through core/storage/gym-logo-storage.ts — a port of
 * FitDeskApp's own R2/Supabase gym-logo pipeline — and the image is
 * validated-by-decoding and re-encoded to WebP through Sharp first, so a
 * MIME type alone (only what the client claimed) is never trusted.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/core/db/server-client";
import { createServiceClient } from "@/core/db/service-client";
import { ALLOWED_LOGO_TYPES, MAX_LOGO_BYTES } from "@/core/storage/logo-limits";
import { processLogoImage } from "@/core/storage/process-logo-image";
import { deleteGymLogoObject, uploadGymLogoObject } from "@/core/storage/gym-logo-storage";

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

  let processed;
  try {
    processed = await processLogoImage(Buffer.from(await file.arrayBuffer()));
  } catch (err) {
    // Nothing uploaded yet — the existing logo is untouched.
    return { error: err instanceof Error ? err.message : "Couldn't process this image." };
  }

  const supabase = await createClient();
  const service = await createServiceClient();

  const { url: baseUrl, error: uploadError } = await uploadGymLogoObject(
    service,
    organizationId,
    processed.buffer,
    processed.contentType,
  );
  if (uploadError || !baseUrl) return { error: uploadError ?? "Couldn't upload this logo." };

  // The key is deterministic (a replace overwrites in place), so version the
  // URL so the CDN/browser doesn't keep serving the replaced file.
  const url = `${baseUrl}?v=${Date.now()}`;
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

  await deleteGymLogoObject(await createServiceClient(), organizationId);

  revalidate();
  return { error: null, url: null };
}
