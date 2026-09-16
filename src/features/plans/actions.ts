"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/core/db/server-client";
import { toMinorUnits } from "@/core/money/format";
import { text } from "@/core/forms/form-values";
import { TERMS, listPriceMinor, slugifyCode, type Term } from "./terms";
import { listSimplePackages, type PackageTerm, type SimplePackage } from "./queries";

/**
 * Writes for the one-package pricing screen (/admin/packages).
 *
 * Every mutation goes through a SECURITY DEFINER RPC from
 * supabase/migrations/1008_plans_schema_and_rpcs.sql, which performs the
 * table write and an admin_audit_log entry in one transaction — same
 * discipline as features/packages/actions.ts and features/gyms/actions.ts.
 * There is deliberately no `.from("plans"|"platform_packages"|
 * "plan_features"|"plan_offers").insert/update(...)` here: those tables
 * have no client write policy of any kind, by design.
 *
 * This file replaced a much larger one that exposed the plans schema's full
 * generality (many plans, arbitrary cycles, offers with date windows,
 * manual reordering). The product sells one package on three fixed terms,
 * so the actions below are shaped like that instead — `savePricing` writes
 * all three term prices and both discounts in a single submit.
 *
 * Every field is read via `text()` rather than `formData.get()`: a `get()`
 * on an absent field returns `null`, which zod reports as the opaque
 * "Invalid input: expected string, received null" instead of the field's
 * own required-message. See src/core/forms/form-values.ts.
 *
 * Two generated-type gaps are cast at the call site rather than widened
 * client-wide, both already documented in CLAUDE.md: Postgres codegen
 * doesn't mark a nullable function parameter as nullable, so the "blank =
 * unlimited" cap nulls and the offer's null date window each need a narrow
 * cast.
 */

function revalidatePackages() {
  revalidatePath("/admin/packages");
  revalidatePath("/admin");
}

export type PackageFormState = { error: string | null };

const OK: PackageFormState = { error: null };

/** setUpPackage's own return shape — a plain PackageFormState can't also
 * carry the new package's id, and the setup form needs it to navigate the
 * picker onto whatever it just created. */
export type SetupFormState = { error: string | null; createdId: string | null };

export const SETUP_INITIAL: SetupFormState = { error: null, createdId: null };

/** Blank → unlimited (null); otherwise a positive integer. `undefined` marks
 * "the admin typed something that isn't a cap", which the caller rejects. */
function parseCap(raw: string): number | null | undefined {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

type Caps = { branches: number | null; members: number | null; staff: number | null };

function parseCaps(formData: FormData): Caps | null {
  const branches = parseCap(text(formData, "maxBranches"));
  const members = parseCap(text(formData, "maxMembers"));
  const staff = parseCap(text(formData, "maxStaff"));
  if (branches === undefined || members === undefined || staff === undefined) return null;
  return { branches, members, staff };
}

const CAPS_ERROR = "Branch/member/staff limits must be blank (no limit) or a whole number above zero.";

// ─────────────────────────── First-time setup ───────────────────────────

const setupSchema = z.object({
  name: z.string().trim().min(1, "Give the package a name gym owners will recognise.").max(120),
  description: z.string().trim().max(500),
  monthlyPrice: z.string().trim().min(1, "Enter the monthly price."),
});

/**
 * Creates the whole package in one submit: the `plans` row, its caps, and
 * all three term rows (Monthly/Quarterly/Annual) priced at the monthly
 * figure × the term's months. Discounts start at zero — the admin sets them
 * afterwards on the pricing form, which is where they belong.
 *
 * These are separate RPC calls, so a failure partway leaves a partial
 * package rather than rolling back (there is no multi-RPC transaction over
 * PostgREST). That is recoverable by design: the screen renders whatever
 * exists and `savePricing` fills in any term whose row is missing, so
 * re-submitting finishes the job instead of erroring on the duplicate plan.
 */
export async function setUpPackage(_prev: SetupFormState, formData: FormData): Promise<SetupFormState> {
  const parsed = setupSchema.safeParse({
    name: text(formData, "name"),
    description: text(formData, "description"),
    monthlyPrice: text(formData, "monthlyPrice"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form and try again.", createdId: null };
  }

  const monthlyMinor = toMinorUnits(parsed.data.monthlyPrice);
  if (monthlyMinor === null || monthlyMinor <= 0) {
    return { error: "The monthly price isn't a valid amount.", createdId: null };
  }

  const caps = parseCaps(formData);
  if (!caps) return { error: CAPS_ERROR, createdId: null };

  const supabase = await createClient();
  const code = slugifyCode(parsed.data.name);

  const { data: planId, error: planError } = await supabase.rpc("admin_create_plan", {
    p_code: code,
    p_name: parsed.data.name,
    p_description: parsed.data.description,
    p_is_purchasable: true,
  });
  if (planError) {
    if (planError.message.includes("duplicate key")) {
      return {
        error: `A package with the code "${code}" already exists — pick a different name.`,
        createdId: null,
      };
    }
    return { error: planError.message, createdId: null };
  }

  const { error: capsError } = await supabase.rpc("admin_set_plan_caps", {
    p_plan_id: planId,
    p_max_branches: caps.branches as number,
    p_max_members: caps.members as number,
    p_max_staff: caps.staff as number,
  });
  if (capsError) return { error: capsError.message, createdId: planId };

  for (const term of TERMS) {
    const { error } = await createTermRow(supabase, planId, code, term, monthlyMinor, caps);
    if (error) return { error, createdId: planId };
  }

  revalidatePackages();
  return { error: null, createdId: planId };
}

type Client = Awaited<ReturnType<typeof createClient>>;

async function createTermRow(
  supabase: Client,
  planId: string,
  planCode: string,
  term: Term,
  monthlyPriceMinor: number,
  caps: Caps,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("admin_create_plan_billing_cycle", {
    p_plan_id: planId,
    p_code: `${planCode}_${term.key}`,
    p_billing_period: term.label,
    p_price_minor: listPriceMinor(monthlyPriceMinor, term),
    p_currency: "INR",
    p_duration_days: term.durationDays,
    p_max_branches: caps.branches as number,
    p_max_members: caps.members as number,
    p_max_staff: caps.staff as number,
    p_is_purchasable: true,
  });
  if (!error) return { error: null };
  if (error.message.includes("duplicate key")) {
    return { error: `A billing term with the code "${planCode}_${term.key}" already exists.` };
  }
  return { error: error.message };
}

// ───────────────────────────── Package details ──────────────────────────

const detailsSchema = setupSchema.omit({ monthlyPrice: true }).extend({
  planId: z.string().uuid("Reload the page and try again."),
});

/** Name, description and the three capacity limits. Limits are written
 * across every term of the package at once (admin_set_plan_caps) — a gym
 * paying annually gets the same limits as one paying monthly. */
export async function savePackageDetails(
  _prev: PackageFormState,
  formData: FormData,
): Promise<PackageFormState> {
  const parsed = detailsSchema.safeParse({
    planId: text(formData, "planId"),
    name: text(formData, "name"),
    description: text(formData, "description"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form and try again." };

  const caps = parseCaps(formData);
  if (!caps) return { error: CAPS_ERROR };

  const supabase = await createClient();

  const { error: planError } = await supabase.rpc("admin_update_plan", {
    p_id: parsed.data.planId,
    p_name: parsed.data.name,
    p_description: parsed.data.description,
    p_is_purchasable: true,
  });
  if (planError) return { error: planError.message };

  const { error: capsError } = await supabase.rpc("admin_set_plan_caps", {
    p_plan_id: parsed.data.planId,
    p_max_branches: caps.branches as number,
    p_max_members: caps.members as number,
    p_max_staff: caps.staff as number,
  });
  if (capsError) return { error: capsError.message };

  revalidatePackages();
  return OK;
}

// ──────────────────────────────── Pricing ───────────────────────────────

const discountSchema = z
  .string()
  .trim()
  .transform((raw) => (raw === "" ? 0 : Number(raw)))
  .refine((n) => Number.isFinite(n) && n >= 0 && n < 100, "A discount must be between 0 and 99%.");

const pricingSchema = z.object({
  planId: z.string().uuid("Reload the page and try again."),
  monthlyPrice: z.string().trim().min(1, "Enter the monthly price."),
  quarterlyDiscount: discountSchema,
  halfYearlyDiscount: discountSchema,
  annualDiscount: discountSchema,
});

/**
 * The whole pricing model in one submit: one monthly price, one discount
 * per longer term.
 *
 * A term's list price is always monthly × months — the discount, not a
 * separately typed price, is what makes a longer term cheaper per month.
 * That keeps the ladder impossible to get accidentally inconsistent (a
 * "quarterly" that costs more than three months of monthly), and it is
 * what gym owners see: the list price struck through, the discounted price
 * charged. The charge itself is always recomputed server-side by
 * `plan_effective_price()`; nothing here is trusted at checkout.
 */
export async function savePricing(_prev: PackageFormState, formData: FormData): Promise<PackageFormState> {
  const parsed = pricingSchema.safeParse({
    planId: text(formData, "planId"),
    monthlyPrice: text(formData, "monthlyPrice"),
    quarterlyDiscount: text(formData, "quarterlyDiscount"),
    halfYearlyDiscount: text(formData, "halfYearlyDiscount"),
    annualDiscount: text(formData, "annualDiscount"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form and try again." };

  const monthlyMinor = toMinorUnits(parsed.data.monthlyPrice);
  if (monthlyMinor === null || monthlyMinor <= 0) return { error: "The monthly price isn't a valid amount." };

  const supabase = await createClient();
  const packages = await listSimplePackages(supabase);
  const pkg = packages.find((p) => p.id === parsed.data.planId);
  if (!pkg) {
    return { error: "This package no longer exists — reload the page." };
  }

  const caps: Caps = { branches: pkg.maxBranches, members: pkg.maxMembers, staff: pkg.maxStaff };
  const wanted: Record<string, number> = {
    monthly: 0,
    quarterly: parsed.data.quarterlyDiscount,
    half_yearly: parsed.data.halfYearlyDiscount,
    annual: parsed.data.annualDiscount,
  };

  for (const term of TERMS) {
    const current = pkg.terms.find((t) => t.key === term.key);
    const priceMinor = listPriceMinor(monthlyMinor, term);

    if (!current?.cycleId) {
      const { error } = await createTermRow(supabase, pkg.id, pkg.code, term, monthlyMinor, caps);
      if (error) return { error };
      continue;
    }

    // An archived term can only come from the older general Plans screen —
    // this one never archives a standard term. Leave it alone rather than
    // failing the whole submit: admin_create_plan_offer refuses an archived
    // cycle outright, and silently reviving one isn't this form's call.
    if (current.status !== "active") continue;

    const { error: priceError } = await supabase.rpc("admin_update_plan_billing_cycle", {
      p_id: current.cycleId,
      p_price_minor: priceMinor,
      p_duration_days: term.durationDays,
      p_max_branches: caps.branches as number,
      p_max_members: caps.members as number,
      p_max_staff: caps.staff as number,
      p_is_purchasable: current.isPurchasable,
    });
    if (priceError) return { error: priceError.message };

    const { error: offerError } = await syncDiscount(supabase, current, wanted[term.key] ?? 0);
    if (offerError) return { error: offerError };
  }

  revalidatePackages();
  return OK;
}

/**
 * Brings a term's `plan_offers` rows in line with the single discount the
 * screen shows: at most one enabled percentage offer, no date window.
 *
 * Any other offer on the term (a second percentage discount, a fixed-amount
 * one, a leftover disabled row) is removed — `plan_effective_price()`
 * silently picks the largest active discount when several exist, so leaving
 * strays behind would mean the screen showing one number and buyers being
 * charged another. Deletion is disable-then-delete because the RPC refuses
 * to delete an enabled offer.
 */
async function syncDiscount(
  supabase: Client,
  term: PackageTerm,
  discountPercent: number,
): Promise<{ error: string | null }> {
  const cycleId = term.cycleId;
  if (!cycleId) return { error: null };

  const { data: offers, error: readError } = await supabase
    .from("plan_offers")
    .select("id, is_enabled")
    .eq("package_id", cycleId);
  if (readError) return { error: readError.message };

  const rows = offers ?? [];
  // Keep the offer the screen was showing, if the admin still wants a
  // discount — updating it in place preserves its audit history.
  const keepId = discountPercent > 0 ? (term.offerId ?? null) : null;

  for (const row of rows) {
    if (row.id === keepId) continue;
    if (row.is_enabled) {
      const { error } = await supabase.rpc("admin_set_plan_offer_enabled", { p_id: row.id, p_is_enabled: false });
      if (error) return { error: error.message };
    }
    const { error } = await supabase.rpc("admin_delete_plan_offer", { p_id: row.id });
    if (error) return { error: error.message };
  }

  if (discountPercent <= 0) return { error: null };

  if (keepId) {
    const { error } = await supabase.rpc("admin_update_plan_offer", {
      p_id: keepId,
      p_discount_type: "percent",
      p_discount_value: discountPercent,
      p_starts_at: null as unknown as string,
      p_expires_at: null as unknown as string,
    });
    return { error: error ? error.message : null };
  }

  const { error } = await supabase.rpc("admin_create_plan_offer", {
    p_package_id: cycleId,
    p_discount_type: "percent",
    p_discount_value: discountPercent,
    p_starts_at: null as unknown as string,
    p_expires_at: null as unknown as string,
    p_is_enabled: true,
  });
  return { error: error ? error.message : null };
}

/** Show or hide one term on the gym owner's subscription screen. Hiding a
 * term never touches a gym already paying on it — they keep renewing. */
export async function setTermOffered(cycleId: string, offered: boolean): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_plan_billing_cycle_purchasable", {
    p_id: cycleId,
    p_is_purchasable: offered,
  });
  if (error) return { error: error.message };

  revalidatePackages();
  return OK;
}

/** Retires a billing term that isn't one of the three this screen manages —
 * left over from the older, more general Plans screen. Archiving hides it
 * from new purchases; nothing is deleted. */
export async function archiveTerm(cycleId: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_plan_billing_cycle_status", { p_id: cycleId, p_status: "archived" });
  if (error) return { error: error.message };

  revalidatePackages();
  return OK;
}

// ─────────────────────────────── Features ───────────────────────────────

const featureSchema = z.object({
  planId: z.string().uuid("Reload the page and try again."),
  name: z.string().trim().min(1, "Name the feature.").max(120),
});

/** Features are marketing copy shown under the package name — they are not
 * enforced anywhere. What actually differs between gyms is the capacity
 * limits on the details form. */
export async function addFeature(_prev: PackageFormState, formData: FormData): Promise<PackageFormState> {
  const parsed = featureSchema.safeParse({
    planId: text(formData, "planId"),
    name: text(formData, "name"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form and try again." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_create_plan_feature", {
    p_plan_id: parsed.data.planId,
    p_name: parsed.data.name,
    p_description: "",
    p_is_enabled: true,
  });
  if (error) return { error: error.message };

  revalidatePackages();
  return OK;
}

export async function removeFeature(id: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_delete_plan_feature", { p_id: id });
  if (error) return { error: error.message };

  revalidatePackages();
  return OK;
}

// ───────────────────────────── Whole package ─────────────────────────────

/** Archives or restores an entire package (every term, at once) — full
 * control over the catalogue, not just its pricing. Archiving never touches
 * a gym already subscribed to one of its terms; it only stops new sales
 * (mirrors admin_set_package_status's own behaviour on the legacy screen).
 * Distinct from a single term's own offered/hidden toggle (setTermOffered),
 * which is finer-grained and stays available independently. */
export async function setPlanStatus(id: string, status: "active" | "archived"): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_plan_status", { p_id: id, p_status: status });
  if (error) return { error: error.message };

  revalidatePackages();
  return OK;
}

// ───────────────────────── Which catalogue is live ──────────────────────

/**
 * The global switch gym owners feel: `legacy` shows them the old
 * Starter/Growth/Pro tiers (/admin/packages/legacy), `dynamic` shows them
 * the package this screen manages. Flipping it never changes what an
 * existing subscriber pays or renews on — FitDeskApp looks a gym's own
 * current row up by package_id regardless of the mode.
 */
export async function setBillingModel(model: "legacy" | "dynamic"): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_billing_model", { p_model: model });
  if (error) return { error: error.message };

  revalidatePackages();
  revalidatePath("/admin/packages/legacy");
  revalidatePath("/admin/settings");
  return OK;
}

/**
 * One click: flips the global switch to dynamic, then archives every
 * still-active legacy Starter/Growth/Pro row (admin_set_package_status —
 * the same RPC the legacy screen's own Archive button calls). No new RPC:
 * both calls already exist and are already live.
 *
 * The switch flips first, deliberately — with no cross-table transaction
 * over PostgREST, a gym mid-checkout while the archive loop runs still
 * lands on a real picker either way, never a half-emptied one.
 *
 * Archiving is one-way from here: switching back to "legacy" later does not
 * restore these rows automatically. That is intentional (this action is
 * "retire the old tiers", not "hide them for a moment") and each one can
 * still be restored individually from /admin/packages/legacy.
 */
export async function goLiveAndArchiveLegacy(): Promise<{ error: string | null; archivedCount: number }> {
  const supabase = await createClient();

  const { error: modelError } = await supabase.rpc("admin_set_billing_model", { p_model: "dynamic" });
  if (modelError) return { error: modelError.message, archivedCount: 0 };

  const { data: legacyRows, error: readError } = await supabase
    .from("platform_packages")
    .select("id")
    .is("plan_id", null)
    .eq("status", "active");
  if (readError) return { error: readError.message, archivedCount: 0 };

  let archivedCount = 0;
  for (const row of legacyRows ?? []) {
    const { error } = await supabase.rpc("admin_set_package_status", { p_id: row.id, p_status: "archived" });
    if (error) return { error: error.message, archivedCount };
    archivedCount += 1;
  }

  revalidatePackages();
  revalidatePath("/admin/packages/legacy");
  revalidatePath("/admin/settings");
  return { error: null, archivedCount };
}

export type { SimplePackage };
