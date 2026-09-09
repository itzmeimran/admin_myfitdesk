"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/core/db/server-client";
import { listGymsPage, type GymListParams } from "./queries";

/**
 * Subscription management on the Gyms directory (CLAUDE.md's Plan, P1 item
 * 5) — the first write path for `organization_subscriptions`, which had no
 * client-write policy at all before supabase/migrations/1004_admin_
 * subscription_write_rpcs.sql. Same shape as features/packages/actions.ts:
 * every mutation is a SECURITY DEFINER RPC that does the write and the
 * admin_audit_log entry in one transaction, never a direct `.update(...)`.
 *
 * These take plain arguments and return `{ error }` rather than being
 * useActionState-style form actions — every input here is a single
 * primitive (a day count, a package id), so gyms-view.tsx calls them
 * directly from a button/select handler via useTransition, same pattern
 * packages-view.tsx already uses for setPackageStatus.
 */

type ActionResult = { error: string | null };

function revalidateGyms() {
  revalidatePath("/admin/gyms");
  revalidatePath("/admin");
}

export async function extendSubscription(organizationId: string, days: number): Promise<ActionResult> {
  if (!Number.isInteger(days) || days <= 0) {
    return { error: "Days must be a positive whole number." };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_extend_subscription", {
    p_organization_id: organizationId,
    p_days: days,
  });
  if (error) return { error: error.message };
  revalidateGyms();
  return { error: null };
}

export async function changeSubscriptionPackage(organizationId: string, packageId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_change_subscription_package", {
    p_organization_id: organizationId,
    p_package_id: packageId,
  });
  if (error) return { error: error.message };
  revalidateGyms();
  return { error: null };
}

export async function cancelSubscription(organizationId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_cancel_subscription", { p_organization_id: organizationId });
  if (error) return { error: error.message };
  revalidateGyms();
  return { error: null };
}

export async function restoreSubscription(organizationId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_restore_subscription", { p_organization_id: organizationId });
  if (error) return { error: error.message };
  revalidateGyms();
  return { error: null };
}

/**
 * Hard-suspend (supabase/migrations/1009_admin_gym_detail.sql) — a new,
 * separate concept from the subscription lifecycle above: it cuts a gym off
 * independent of billing state, via `organizations.suspended_at`, not
 * `organization_subscriptions.status`. See that migration's header for the
 * one real scope limit: this flags the org and every screen in this admin
 * app reflects it, but it does not (and, per CLAUDE.md's D-B, cannot from
 * this repo) make FitDeskApp's own session/RLS layer actually deny a
 * suspended org's staff from logging in — that enforcement is separate
 * follow-up work in the tenant app's own repo.
 */
export async function suspendGym(organizationId: string, reason: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_suspend_organization", {
    p_organization_id: organizationId,
    p_reason: reason || undefined,
  });
  if (error) return { error: error.message };
  revalidateGyms();
  revalidatePath("/admin/gyms/[id]", "layout");
  return { error: null };
}

export async function reactivateGym(organizationId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_reactivate_organization", { p_organization_id: organizationId });
  if (error) return { error: error.message };
  revalidateGyms();
  revalidatePath("/admin/gyms/[id]", "layout");
  return { error: null };
}

const profileSchema = z.object({
  organizationId: z.string().uuid(),
  name: z.string().trim().min(1, "Gym name is required.").max(160),
  city: z.string().trim().max(120).optional().default(""),
  addressLine: z.string().trim().max(200).optional().default(""),
  postalCode: z.string().trim().max(20).optional().default(""),
  state: z.string().trim().max(120).optional().default(""),
  country: z.string().trim().max(120).optional().default(""),
  contactEmail: z.string().trim().max(200).optional().default(""),
  contactPhone: z.string().trim().max(30).optional().default(""),
  defaultTimezone: z.string().trim().max(60).optional().default(""),
  defaultCurrency: z.string().trim().max(10).optional().default(""),
  gracePeriodDays: z.coerce.number().int().min(0, "Grace period must be zero or more days."),
});

export type ProfileFormState = { error: string | null; success?: boolean };

/**
 * Settings tab's "Edit gym" form (task brief §2/§10) —
 * `admin_update_organization_profile()` (supabase/migrations/1009_admin_
 * gym_detail.sql). Never touches secrets (payment/WhatsApp integration
 * tables aren't part of this RPC at all) — see that RPC's own comment.
 */
export async function updateGymProfile(_prev: ProfileFormState, formData: FormData): Promise<ProfileFormState> {
  const parsed = profileSchema.safeParse({
    organizationId: formData.get("organizationId"),
    name: formData.get("name"),
    city: formData.get("city"),
    addressLine: formData.get("addressLine"),
    postalCode: formData.get("postalCode"),
    state: formData.get("state"),
    country: formData.get("country"),
    contactEmail: formData.get("contactEmail"),
    contactPhone: formData.get("contactPhone"),
    defaultTimezone: formData.get("defaultTimezone"),
    defaultCurrency: formData.get("defaultCurrency"),
    gracePeriodDays: formData.get("gracePeriodDays"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_update_organization_profile", {
    p_organization_id: parsed.data.organizationId,
    p_name: parsed.data.name,
    p_city: parsed.data.city,
    p_address_line: parsed.data.addressLine,
    p_postal_code: parsed.data.postalCode,
    p_state: parsed.data.state,
    p_country: parsed.data.country,
    p_contact_email: parsed.data.contactEmail,
    p_contact_phone: parsed.data.contactPhone,
    p_default_timezone: parsed.data.defaultTimezone,
    p_default_currency: parsed.data.defaultCurrency,
    p_grace_period_days: parsed.data.gracePeriodDays,
  });
  if (error) return { error: error.message };

  revalidateGyms();
  revalidatePath("/admin/gyms/[id]", "layout");
  return { error: null, success: true };
}

export type ExportGymsResult = { rows: string[][] } | { error: string };

export const GYMS_CSV_HEADERS = [
  "Gym",
  "Owner",
  "Owner email",
  "City",
  "Package",
  "Billing period",
  "Status",
  "Members",
  "Member cap",
  "Branches",
  "Staff",
  "Renews",
  "Lifetime paid",
  "Created",
];

/**
 * Export CSV, ported to the server-paginated Gyms list (main's own version
 * of this feature exported `filtered` straight out of client state, which
 * only worked because that page loaded every gym into the browser — this
 * page deliberately doesn't, per the redesign's whole point). Re-runs the
 * same admin_gyms_list() query with the caller's current filters and a
 * generous limit instead of the page size, so "export CSV" means "export
 * everything matching your filters," not just the current page.
 */
export async function exportGymsCsv(params: GymListParams): Promise<ExportGymsResult> {
  try {
    const supabase = await createClient();
    const { rows } = await listGymsPage(supabase, { ...params, limit: 5000, offset: 0 });
    return {
      rows: rows.map((g) => [
        g.name,
        g.ownerName,
        g.ownerEmail,
        g.city,
        g.packageName,
        g.period,
        g.status,
        g.members,
        g.cap,
        g.branches,
        g.staff,
        g.renews,
        g.ltv,
        new Date(g.createdAt).toLocaleDateString("en-IN"),
      ]),
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to export gyms." };
  }
}
