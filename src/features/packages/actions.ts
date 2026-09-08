"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/core/db/server-client";
import { toMinorUnits } from "@/core/money/format";

/**
 * Package CRUD — the first real write path in this admin panel (CLAUDE.md's
 * Plan, P1). Every mutation calls a SECURITY DEFINER RPC (supabase/
 * migrations/1003_admin_package_write_rpcs.sql) that performs the table
 * write AND an admin_audit_log entry atomically — there is deliberately no
 * direct `.from("platform_packages").insert(...)`/`.update(...)` anywhere
 * in this file, since that would bypass the audit trail (see that
 * migration's header comment for why the blanket RLS write policy was
 * dropped in favor of this).
 *
 * `database.types.ts` predates these RPCs, hence the typed casts — same
 * pattern as every queries.ts in this app.
 */

const createSchema = z.object({
  code: z.string().trim().min(1, "Code is required.").max(60),
  name: z.string().trim().min(1, "Display name is required.").max(120),
  description: z.string().trim().max(500).optional().default(""),
  price: z.string().trim().min(1, "Price is required."),
  billingPeriod: z.enum(["Monthly", "Yearly"]),
  durationDays: z.coerce.number().int().positive("Duration must be a positive number of days."),
  maxBranches: z.string().trim(),
  maxMembers: z.string().trim(),
  maxStaff: z.string().trim(),
});

const updateSchema = createSchema.omit({ code: true, billingPeriod: true }).extend({
  id: z.string().uuid(),
});

export type PackageFormState = { error: string | null };

/** Blank string → unlimited (null); otherwise a positive integer. Returns
 * `undefined` (not `null`) for an invalid non-blank value, so the caller
 * can tell "unlimited" apart from "the admin typed something bad". */
function parseCap(raw: string): number | null | undefined {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

export async function createPackage(_prev: PackageFormState, formData: FormData): Promise<PackageFormState> {
  const parsed = createSchema.safeParse({
    code: formData.get("code"),
    name: formData.get("name"),
    description: formData.get("description"),
    price: formData.get("price"),
    billingPeriod: formData.get("billingPeriod"),
    durationDays: formData.get("durationDays"),
    maxBranches: formData.get("maxBranches"),
    maxMembers: formData.get("maxMembers"),
    maxStaff: formData.get("maxStaff"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  }

  const priceMinor = toMinorUnits(parsed.data.price);
  if (priceMinor === null) return { error: "Price isn't a valid amount." };

  const maxBranches = parseCap(parsed.data.maxBranches);
  const maxMembers = parseCap(parsed.data.maxMembers);
  const maxStaff = parseCap(parsed.data.maxStaff);
  if (maxBranches === undefined || maxMembers === undefined || maxStaff === undefined) {
    return { error: "Max branches/members/staff must be blank (unlimited) or a positive whole number." };
  }

  const supabase = await createClient();
  const rpc = supabase.rpc as unknown as (
    fn: "admin_create_package",
    args: {
      p_code: string;
      p_name: string;
      p_description: string;
      p_price_minor: number;
      p_currency: string;
      p_billing_period: string;
      p_duration_days: number;
      p_max_branches: number | null;
      p_max_members: number | null;
      p_max_staff: number | null;
      p_features: string[];
    },
  ) => Promise<{ error: { message: string } | null }>;

  const { error } = await rpc("admin_create_package", {
    p_code: parsed.data.code,
    p_name: parsed.data.name,
    p_description: parsed.data.description,
    p_price_minor: priceMinor,
    p_currency: "INR",
    p_billing_period: parsed.data.billingPeriod.toLowerCase(),
    p_duration_days: parsed.data.durationDays,
    p_max_branches: maxBranches,
    p_max_members: maxMembers,
    p_max_staff: maxStaff,
    p_features: [],
  });

  if (error) {
    // Postgres unique_violation on platform_packages.code.
    if (error.message.includes("duplicate key")) {
      return { error: `A package with the code "${parsed.data.code}" already exists.` };
    }
    return { error: error.message };
  }

  revalidatePath("/admin/packages");
  revalidatePath("/admin");
  return { error: null };
}

export async function updatePackage(_prev: PackageFormState, formData: FormData): Promise<PackageFormState> {
  const parsed = updateSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    description: formData.get("description"),
    price: formData.get("price"),
    durationDays: formData.get("durationDays"),
    maxBranches: formData.get("maxBranches"),
    maxMembers: formData.get("maxMembers"),
    maxStaff: formData.get("maxStaff"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  }

  const priceMinor = toMinorUnits(parsed.data.price);
  if (priceMinor === null) return { error: "Price isn't a valid amount." };

  const maxBranches = parseCap(parsed.data.maxBranches);
  const maxMembers = parseCap(parsed.data.maxMembers);
  const maxStaff = parseCap(parsed.data.maxStaff);
  if (maxBranches === undefined || maxMembers === undefined || maxStaff === undefined) {
    return { error: "Max branches/members/staff must be blank (unlimited) or a positive whole number." };
  }

  const supabase = await createClient();
  const rpc = supabase.rpc as unknown as (
    fn: "admin_update_package",
    args: {
      p_id: string;
      p_name: string;
      p_description: string;
      p_price_minor: number;
      p_duration_days: number;
      p_max_branches: number | null;
      p_max_members: number | null;
      p_max_staff: number | null;
      p_features: string[];
    },
  ) => Promise<{ error: { message: string } | null }>;

  const { error } = await rpc("admin_update_package", {
    p_id: parsed.data.id,
    p_name: parsed.data.name,
    p_description: parsed.data.description,
    p_price_minor: priceMinor,
    p_duration_days: parsed.data.durationDays,
    p_max_branches: maxBranches,
    p_max_members: maxMembers,
    p_max_staff: maxStaff,
    p_features: [],
  });

  if (error) return { error: error.message };

  revalidatePath("/admin/packages");
  revalidatePath("/admin");
  return { error: null };
}

export async function setPackageStatus(
  id: string,
  status: "active" | "archived",
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const rpc = supabase.rpc as unknown as (
    fn: "admin_set_package_status",
    args: { p_id: string; p_status: string },
  ) => Promise<{ error: { message: string } | null }>;

  const { error } = await rpc("admin_set_package_status", { p_id: id, p_status: status });
  if (error) return { error: error.message };

  revalidatePath("/admin/packages");
  revalidatePath("/admin");
  return { error: null };
}
