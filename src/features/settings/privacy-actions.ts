"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/core/db/server-client";
import { loose } from "@/core/db/loose-client";
import { checkPermission } from "@/core/auth/access";
import { requireProductionConfirmation } from "@/core/auth/production-guard";
import { text } from "@/core/forms/form-values";

export type RetentionFormState = { error: string | null; saved: boolean; nonce: number };

const schema = z
  .object({
    rawDays: z.coerce.number().int("Enter whole days.").min(1, "Raw requests: 1 to 30 days.").max(30, "Raw requests: 1 to 30 days."),
    hourlyDays: z.coerce.number().int("Enter whole days.").min(7, "Hourly summaries: 7 to 365 days.").max(365, "Hourly summaries: 7 to 365 days."),
  })
  .refine((v) => v.hourlyDays >= v.rawDays, "Hourly summaries must be kept at least as long as raw requests.");

/** Shortening retention makes the next daily prune delete older telemetry for
 * good, so on Production it needs the typed confirmation. */
export async function saveApiRetention(_prev: RetentionFormState, formData: FormData): Promise<RetentionFormState> {
  const fail = (error: string): RetentionFormState => ({ error, saved: false, nonce: Date.now() });

  const allowed = await checkPermission("privacy.manage");
  if (!allowed.ok) return fail(allowed.error);

  const parsed = schema.safeParse({ rawDays: text(formData, "rawDays"), hourlyDays: text(formData, "hourlyDays") });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the values and try again.");

  const problem = await requireProductionConfirmation(text(formData, "confirmation"), allowed.access);
  if (problem) return fail(problem);

  const supabase = await createClient();
  const { error } = await loose(supabase).rpc("admin_update_api_retention", {
    p_raw_days: parsed.data.rawDays,
    p_hourly_days: parsed.data.hourlyDays,
  });
  if (error) return fail(error.message);

  revalidatePath("/admin/settings/privacy");
  return { error: null, saved: true, nonce: Date.now() };
}
