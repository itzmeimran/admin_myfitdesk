"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/core/db/server-client";
import { toMinorUnits } from "@/core/money/format";

/**
 * Dynamic Plans CRUD — every mutation calls a SECURITY DEFINER RPC
 * (supabase/migrations/1008_plans_schema_and_rpcs.sql) that performs the
 * table write and an admin_audit_log entry atomically, same discipline as
 * features/packages/actions.ts. There is deliberately no direct
 * `.from("plans"|"platform_packages"|"plan_features"|"plan_offers").insert/
 * update(...)` anywhere in this file — those tables have no client write
 * policy of any kind, by design.
 */

function revalidatePlans() {
  revalidatePath("/admin/plans");
  revalidatePath("/admin");
}

// ─────────────────────────────── Plans ────────────────────────────────

const createPlanSchema = z.object({
  code: z.string().trim().min(1, "Code is required.").max(60),
  name: z.string().trim().min(1, "Plan name is required.").max(120),
  description: z.string().trim().max(500).optional().default(""),
  isPurchasable: z.enum(["true", "false"]).optional().default("true"),
});

export type PlanFormState = { error: string | null };

export async function createPlan(_prev: PlanFormState, formData: FormData): Promise<PlanFormState> {
  const parsed = createPlanSchema.safeParse({
    code: formData.get("code"),
    name: formData.get("name"),
    description: formData.get("description"),
    isPurchasable: formData.get("isPurchasable") ?? "true",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form and try again." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_create_plan", {
    p_code: parsed.data.code,
    p_name: parsed.data.name,
    p_description: parsed.data.description,
    p_is_purchasable: parsed.data.isPurchasable === "true",
  });
  if (error) {
    if (error.message.includes("duplicate key")) {
      return { error: `A plan with the code "${parsed.data.code}" already exists.` };
    }
    return { error: error.message };
  }

  revalidatePlans();
  return { error: null };
}

const updatePlanSchema = createPlanSchema.omit({ code: true }).extend({ id: z.string().uuid() });

export async function updatePlan(_prev: PlanFormState, formData: FormData): Promise<PlanFormState> {
  const parsed = updatePlanSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    description: formData.get("description"),
    isPurchasable: formData.get("isPurchasable") ?? "true",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form and try again." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_update_plan", {
    p_id: parsed.data.id,
    p_name: parsed.data.name,
    p_description: parsed.data.description,
    p_is_purchasable: parsed.data.isPurchasable === "true",
  });
  if (error) return { error: error.message };

  revalidatePlans();
  return { error: null };
}

export async function setPlanStatus(id: string, status: "active" | "archived"): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_plan_status", { p_id: id, p_status: status });
  if (error) return { error: error.message };

  revalidatePlans();
  return { error: null };
}

export async function reorderPlans(ids: string[]): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_reorder_plans", { p_ids: ids });
  if (error) return { error: error.message };

  revalidatePlans();
  return { error: null };
}

/** Blank string → unlimited (null); otherwise a positive integer. `undefined`
 * (not `null`) for an invalid non-blank value, same convention as
 * features/packages/actions.ts's parseCap. */
function parseCap(raw: string): number | null | undefined {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

export async function setPlanCaps(
  planId: string,
  maxBranchesRaw: string,
  maxMembersRaw: string,
  maxStaffRaw: string,
): Promise<{ error: string | null }> {
  const maxBranches = parseCap(maxBranchesRaw);
  const maxMembers = parseCap(maxMembersRaw);
  const maxStaff = parseCap(maxStaffRaw);
  if (maxBranches === undefined || maxMembers === undefined || maxStaff === undefined) {
    return { error: "Max branches/members/staff must be blank (unlimited) or a positive whole number." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_plan_caps", {
    p_plan_id: planId,
    p_max_branches: maxBranches as number,
    p_max_members: maxMembers as number,
    p_max_staff: maxStaff as number,
  });
  if (error) return { error: error.message };

  revalidatePlans();
  return { error: null };
}

// ─────────────────────────── Plan features ────────────────────────────

const featureSchema = z.object({
  name: z.string().trim().min(1, "Feature name is required.").max(120),
  description: z.string().trim().max(300).optional().default(""),
});

export type PlanFeatureFormState = { error: string | null };

export async function addPlanFeature(_prev: PlanFeatureFormState, formData: FormData): Promise<PlanFeatureFormState> {
  const planId = formData.get("planId");
  const parsed = featureSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description"),
  });
  if (typeof planId !== "string" || !planId) return { error: "Missing plan." };
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form and try again." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_create_plan_feature", {
    p_plan_id: planId,
    p_name: parsed.data.name,
    p_description: parsed.data.description,
  });
  if (error) return { error: error.message };

  revalidatePlans();
  return { error: null };
}

const updateFeatureSchema = featureSchema.extend({ id: z.string().uuid(), isEnabled: z.enum(["true", "false"]) });

export async function updatePlanFeature(
  _prev: PlanFeatureFormState,
  formData: FormData,
): Promise<PlanFeatureFormState> {
  const parsed = updateFeatureSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    description: formData.get("description"),
    isEnabled: formData.get("isEnabled") ?? "true",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form and try again." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_update_plan_feature", {
    p_id: parsed.data.id,
    p_name: parsed.data.name,
    p_description: parsed.data.description,
    p_is_enabled: parsed.data.isEnabled === "true",
  });
  if (error) return { error: error.message };

  revalidatePlans();
  return { error: null };
}

export async function deletePlanFeature(id: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_delete_plan_feature", { p_id: id });
  if (error) return { error: error.message };

  revalidatePlans();
  return { error: null };
}

export async function setPlanFeatureEnabled(id: string, enabled: boolean): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_plan_feature_enabled", { p_id: id, p_is_enabled: enabled });
  if (error) return { error: error.message };

  revalidatePlans();
  return { error: null };
}

export async function reorderPlanFeatures(planId: string, ids: string[]): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_reorder_plan_features", { p_plan_id: planId, p_ids: ids });
  if (error) return { error: error.message };

  revalidatePlans();
  return { error: null };
}

// ─────────────────────────── Billing cycles ────────────────────────────

const createCycleSchema = z.object({
  code: z.string().trim().min(1, "Code is required.").max(60),
  billingPeriod: z.string().trim().min(1, "Billing period label is required.").max(40),
  price: z.string().trim().min(1, "Price is required."),
  durationDays: z.coerce.number().int().positive("Duration must be a positive number of days."),
  maxBranches: z.string().trim(),
  maxMembers: z.string().trim(),
  maxStaff: z.string().trim(),
});

export type PlanCycleFormState = { error: string | null };

export async function addPlanCycle(_prev: PlanCycleFormState, formData: FormData): Promise<PlanCycleFormState> {
  const planId = formData.get("planId");
  const parsed = createCycleSchema.safeParse({
    code: formData.get("code"),
    billingPeriod: formData.get("billingPeriod"),
    price: formData.get("price"),
    durationDays: formData.get("durationDays"),
    maxBranches: formData.get("maxBranches"),
    maxMembers: formData.get("maxMembers"),
    maxStaff: formData.get("maxStaff"),
  });
  if (typeof planId !== "string" || !planId) return { error: "Missing plan." };
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form and try again." };

  const priceMinor = toMinorUnits(parsed.data.price);
  if (priceMinor === null) return { error: "Price isn't a valid amount." };

  const maxBranches = parseCap(parsed.data.maxBranches);
  const maxMembers = parseCap(parsed.data.maxMembers);
  const maxStaff = parseCap(parsed.data.maxStaff);
  if (maxBranches === undefined || maxMembers === undefined || maxStaff === undefined) {
    return { error: "Max branches/members/staff must be blank (unlimited) or a positive whole number." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_create_plan_billing_cycle", {
    p_plan_id: planId,
    p_code: parsed.data.code,
    p_billing_period: parsed.data.billingPeriod,
    p_price_minor: priceMinor,
    p_currency: "INR",
    p_duration_days: parsed.data.durationDays,
    p_max_branches: maxBranches as number,
    p_max_members: maxMembers as number,
    p_max_staff: maxStaff as number,
  });
  if (error) {
    if (error.message.includes("duplicate key")) {
      return { error: `A billing cycle with the code "${parsed.data.code}" already exists.` };
    }
    return { error: error.message };
  }

  revalidatePlans();
  return { error: null };
}

const updateCycleSchema = createCycleSchema.omit({ code: true, billingPeriod: true }).extend({ id: z.string().uuid() });

export async function updatePlanCycle(_prev: PlanCycleFormState, formData: FormData): Promise<PlanCycleFormState> {
  const parsed = updateCycleSchema.safeParse({
    id: formData.get("id"),
    price: formData.get("price"),
    durationDays: formData.get("durationDays"),
    maxBranches: formData.get("maxBranches"),
    maxMembers: formData.get("maxMembers"),
    maxStaff: formData.get("maxStaff"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form and try again." };

  const priceMinor = toMinorUnits(parsed.data.price);
  if (priceMinor === null) return { error: "Price isn't a valid amount." };

  const maxBranches = parseCap(parsed.data.maxBranches);
  const maxMembers = parseCap(parsed.data.maxMembers);
  const maxStaff = parseCap(parsed.data.maxStaff);
  if (maxBranches === undefined || maxMembers === undefined || maxStaff === undefined) {
    return { error: "Max branches/members/staff must be blank (unlimited) or a positive whole number." };
  }

  const supabase = await createClient();
  // is_purchasable is intentionally left untouched here (toggled separately
  // by setPlanCyclePurchasable) — this form only ever edits price/duration/
  // caps, matching how features/packages' PackageSheet keeps price edits
  // and archive/restore as two separate actions.
  const { data: current, error: currentError } = await supabase
    .from("platform_packages")
    .select("is_purchasable")
    .eq("id", parsed.data.id)
    .single();
  if (currentError) return { error: currentError.message };

  const { error } = await supabase.rpc("admin_update_plan_billing_cycle", {
    p_id: parsed.data.id,
    p_price_minor: priceMinor,
    p_duration_days: parsed.data.durationDays,
    p_max_branches: maxBranches as number,
    p_max_members: maxMembers as number,
    p_max_staff: maxStaff as number,
    p_is_purchasable: current.is_purchasable,
  });
  if (error) return { error: error.message };

  revalidatePlans();
  return { error: null };
}

export async function setPlanCycleStatus(id: string, status: "active" | "archived"): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_plan_billing_cycle_status", { p_id: id, p_status: status });
  if (error) return { error: error.message };

  revalidatePlans();
  return { error: null };
}

export async function setPlanCyclePurchasable(id: string, purchasable: boolean): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_plan_billing_cycle_purchasable", {
    p_id: id,
    p_is_purchasable: purchasable,
  });
  if (error) return { error: error.message };

  revalidatePlans();
  return { error: null };
}

export async function reorderPlanCycles(planId: string, ids: string[]): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_reorder_plan_billing_cycles", { p_plan_id: planId, p_ids: ids });
  if (error) return { error: error.message };

  revalidatePlans();
  return { error: null };
}

// ────────────────────────────────  Offers  ─────────────────────────────

const offerSchema = z.object({
  discountType: z.enum(["percent", "fixed"]),
  discountValue: z.coerce.number().positive("Discount must be a positive number."),
  startsAt: z.string().trim().optional().default(""),
  expiresAt: z.string().trim().optional().default(""),
});

export type PlanOfferFormState = { error: string | null };

function toTimestamptz(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export async function addPlanOffer(_prev: PlanOfferFormState, formData: FormData): Promise<PlanOfferFormState> {
  const cycleId = formData.get("cycleId");
  const parsed = offerSchema.safeParse({
    discountType: formData.get("discountType"),
    discountValue: formData.get("discountValue"),
    startsAt: formData.get("startsAt"),
    expiresAt: formData.get("expiresAt"),
  });
  if (typeof cycleId !== "string" || !cycleId) return { error: "Missing billing cycle." };
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form and try again." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_create_plan_offer", {
    p_package_id: cycleId,
    p_discount_type: parsed.data.discountType,
    p_discount_value: parsed.data.discountValue,
    // Same codegen gap CLAUDE.md documents for admin_create_package's
    // nullable cap args: generated Args types don't mark a nullable
    // timestamptz param as nullable even though the RPC body accepts null.
    // Narrow cast at the call site, not a client-wide type widening.
    p_starts_at: toTimestamptz(parsed.data.startsAt) as string,
    p_expires_at: toTimestamptz(parsed.data.expiresAt) as string,
  });
  if (error) return { error: error.message };

  revalidatePlans();
  return { error: null };
}

const updateOfferSchema = offerSchema.extend({ id: z.string().uuid() });

export async function updatePlanOffer(_prev: PlanOfferFormState, formData: FormData): Promise<PlanOfferFormState> {
  const parsed = updateOfferSchema.safeParse({
    id: formData.get("id"),
    discountType: formData.get("discountType"),
    discountValue: formData.get("discountValue"),
    startsAt: formData.get("startsAt"),
    expiresAt: formData.get("expiresAt"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form and try again." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_update_plan_offer", {
    p_id: parsed.data.id,
    p_discount_type: parsed.data.discountType,
    p_discount_value: parsed.data.discountValue,
    // Same codegen gap CLAUDE.md documents for admin_create_package's
    // nullable cap args: generated Args types don't mark a nullable
    // timestamptz param as nullable even though the RPC body accepts null.
    // Narrow cast at the call site, not a client-wide type widening.
    p_starts_at: toTimestamptz(parsed.data.startsAt) as string,
    p_expires_at: toTimestamptz(parsed.data.expiresAt) as string,
  });
  if (error) return { error: error.message };

  revalidatePlans();
  return { error: null };
}

export async function setPlanOfferEnabled(id: string, enabled: boolean): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_plan_offer_enabled", { p_id: id, p_is_enabled: enabled });
  if (error) return { error: error.message };

  revalidatePlans();
  return { error: null };
}

export async function deletePlanOffer(id: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_delete_plan_offer", { p_id: id });
  if (error) return { error: error.message };

  revalidatePlans();
  return { error: null };
}
