"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/core/db/server-client";

type ActionResult = { error: string | null };

const packageSchema = z.object({
  id: z.string().uuid().optional(),
  code: z.string().trim().min(1, "Code is required.").max(80),
  name: z.string().trim().min(1, "Name is required.").max(120),
  credits: z.number().int().positive("Credits must be a positive whole number.").max(10_000_000),
  priceMinor: z.number().int().positive("Price must be positive."),
  currency: z.string().trim().min(3, "Currency is required.").max(10),
  sortOrder: z.number().int().min(0, "Sort order cannot be negative.").max(10_000),
});

export type WhatsAppCreditPackageInput = z.infer<typeof packageSchema>;

function revalidateCredits() {
  revalidatePath("/admin/whatsapp-credits");
}

export async function createWhatsAppCreditPackage(input: WhatsAppCreditPackageInput): Promise<ActionResult> {
  const parsed = packageSchema.omit({ id: true }).safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the package details." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_create_whatsapp_credit_package", {
    p_code: parsed.data.code,
    p_name: parsed.data.name,
    p_credits: parsed.data.credits,
    p_price_minor: parsed.data.priceMinor,
    p_currency: parsed.data.currency,
    p_sort_order: parsed.data.sortOrder,
  });
  if (error) {
    if (error.message.includes("duplicate key")) return { error: `The code “${parsed.data.code}” is already in use.` };
    return { error: error.message };
  }
  revalidateCredits();
  return { error: null };
}

export async function updateWhatsAppCreditPackage(input: WhatsAppCreditPackageInput): Promise<ActionResult> {
  const parsed = packageSchema.required({ id: true }).safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the package details." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_update_whatsapp_credit_package", {
    p_id: parsed.data.id,
    p_name: parsed.data.name,
    p_credits: parsed.data.credits,
    p_price_minor: parsed.data.priceMinor,
    p_currency: parsed.data.currency,
    p_sort_order: parsed.data.sortOrder,
  });
  if (error) return { error: error.message };
  revalidateCredits();
  return { error: null };
}

export async function setWhatsAppCreditPackageStatus(
  id: string,
  status: "active" | "archived",
): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(id).success) return { error: "Invalid package." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_whatsapp_credit_package_status", {
    p_id: id,
    p_status: status,
  });
  if (error) return { error: error.message };
  revalidateCredits();
  return { error: null };
}

export async function grantWhatsAppCredits(
  organizationId: string,
  credits: number,
  note: string,
): Promise<ActionResult & { balance?: number }> {
  const parsed = z
    .object({
      organizationId: z.string().uuid(),
      credits: z.number().int().positive("Credits must be a positive whole number.").max(10_000_000),
      note: z.string().trim().max(500, "Note must be 500 characters or fewer."),
    })
    .safeParse({ organizationId, credits, note });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the credit amount." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_grant_whatsapp_credits", {
    p_organization_id: parsed.data.organizationId,
    p_credits: parsed.data.credits,
    p_note: parsed.data.note || undefined,
  });
  if (error) return { error: error.message };
  revalidateCredits();
  return { error: null, balance: data };
}
