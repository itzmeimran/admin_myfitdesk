"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/core/db/server-client";
import { loose } from "@/core/db/loose-client";
import { checkPermission } from "@/core/auth/access";
import { text } from "@/core/forms/form-values";

/**
 * Saves for the General and Platform-defaults forms. Validated here for a
 * friendly message AND again by the database (app.validate_platform_setting),
 * which is the authority; the permission is checked here AND again inside
 * admin_update_platform_settings. One RPC call writes every changed key and a
 * single `platform_settings.updated` audit row with the old and new values.
 */
export type SettingsFormState = { error: string | null; saved: number | null; nonce: number };

const generalSchema = z.object({
  platformName: z.string().trim().min(1, "Enter the platform name.").max(80, "Platform name is too long."),
  supportEmail: z
    .string()
    .trim()
    .max(254)
    .refine((v) => v === "" || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), "Enter a valid support email."),
  supportPhone: z
    .string()
    .trim()
    .max(24)
    .refine((v) => v === "" || /^[+0-9 ()-]{6,24}$/.test(v), "Enter a valid support phone number."),
  contactAddress: z.string().trim().max(300, "Contact address is too long."),
});

const defaultsSchema = z.object({
  trialDays: z.coerce
    .number()
    .int("Trial length must be a whole number.")
    .min(1, "Trial must be at least 1 day.")
    .max(365, "Trial can be at most 365 days."),
  graceDays: z.coerce
    .number()
    .int("Grace period must be a whole number.")
    .min(0, "Grace period can't be negative.")
    .max(60, "Grace period can be at most 60 days."),
  country: z.string().trim().min(2, "Enter a default country.").max(80),
  currency: z.string().trim().regex(/^[A-Za-z]{3}$/, "Currency must be a 3-letter code such as INR."),
  timezone: z.string().trim().min(1, "Enter a timezone such as Asia/Kolkata.").max(64),
});

async function save(changes: Record<string, unknown>): Promise<SettingsFormState> {
  const allowed = await checkPermission("settings.manage");
  if (!allowed.ok) return { error: allowed.error, saved: null, nonce: Date.now() };

  const supabase = await createClient();
  const { data, error } = await loose(supabase).rpc("admin_update_platform_settings", { p_changes: changes });
  if (error) return { error: error.message, saved: null, nonce: Date.now() };

  revalidatePath("/admin/settings", "layout");
  revalidatePath("/admin/gyms");
  return { error: null, saved: Number(data ?? 0), nonce: Date.now() };
}

export async function saveGeneralSettings(_prev: SettingsFormState, formData: FormData): Promise<SettingsFormState> {
  const parsed = generalSchema.safeParse({
    platformName: text(formData, "platformName"),
    supportEmail: text(formData, "supportEmail"),
    supportPhone: text(formData, "supportPhone"),
    contactAddress: text(formData, "contactAddress"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form and try again.", saved: null, nonce: Date.now() };
  }

  return save({
    "general.platform_name": parsed.data.platformName,
    "general.support_email": parsed.data.supportEmail,
    "general.support_phone": parsed.data.supportPhone,
    "general.contact_address": parsed.data.contactAddress,
  });
}

export async function saveDefaultSettings(_prev: SettingsFormState, formData: FormData): Promise<SettingsFormState> {
  const parsed = defaultsSchema.safeParse({
    trialDays: text(formData, "trialDays"),
    graceDays: text(formData, "graceDays"),
    country: text(formData, "country"),
    currency: text(formData, "currency"),
    timezone: text(formData, "timezone"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form and try again.", saved: null, nonce: Date.now() };
  }

  return save({
    "defaults.trial_days": parsed.data.trialDays,
    "defaults.grace_days": parsed.data.graceDays,
    "defaults.country": parsed.data.country,
    "defaults.currency": parsed.data.currency.toUpperCase(),
    "defaults.timezone": parsed.data.timezone,
  });
}
