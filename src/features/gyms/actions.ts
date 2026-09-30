"use server";
import { assertPermission } from "@/core/auth/access";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/core/db/server-client";
import { listGymsPage, type GymListParams } from "./queries";
import { PAYMENT_METHODS, type PaymentMethod } from "./payment-method";

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

/** An optional payment the admin actually collected (typically cash, handed
 * over in person) alongside an Extend — recorded on organization_subscriptions'
 * platform_payments via the RPC's own trailing args, never a separate write,
 * so it can never end up extending access without a matching invoice or vice
 * versa. */
export type ManualPaymentInput = { amountMinor: number; method: PaymentMethod; note?: string };

export async function extendSubscription(
  organizationId: string,
  days: number,
  payment?: ManualPaymentInput | null,
): Promise<ActionResult> {
  await assertPermission("subscriptions.manage");
  if (!Number.isInteger(days) || days <= 0) {
    return { error: "Days must be a positive whole number." };
  }
  if (payment) {
    if (!Number.isInteger(payment.amountMinor) || payment.amountMinor <= 0) {
      return { error: "Payment amount must be a positive amount." };
    }
    if (!PAYMENT_METHODS.some((m) => m.value === payment.method)) {
      return { error: "Choose a valid payment method." };
    }
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_extend_subscription", {
    p_organization_id: organizationId,
    p_days: days,
    p_payment_amount_minor: payment ? payment.amountMinor : undefined,
    p_payment_method: payment ? payment.method : undefined,
    p_payment_note: payment?.note || undefined,
  });
  if (error) return { error: error.message };
  revalidateGyms();
  revalidatePath("/admin/gyms/[id]", "layout");
  return { error: null };
}

/** Records an offline payment against the package the gym actually bought.
 * The RPC derives duration/currency from that package and follows the same
 * scheduling rule as online checkout: a different package waits for the
 * live period to finish; a same-package renewal extends immediately. */
export async function recordManualSubscriptionRenewal(
  organizationId: string,
  packageId: string,
  payment: ManualPaymentInput,
): Promise<ActionResult & { scheduled?: boolean }> {
  await assertPermission("subscriptions.manage");
  if (!Number.isInteger(payment.amountMinor) || payment.amountMinor <= 0) {
    return { error: "Payment amount must be a positive amount." };
  }
  if (!PAYMENT_METHODS.some((m) => m.value === payment.method)) {
    return { error: "Choose a valid payment method." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_record_manual_subscription_renewal", {
    p_organization_id: organizationId,
    p_package_id: packageId,
    p_payment_amount_minor: payment.amountMinor,
    p_payment_method: payment.method,
    p_payment_note: payment.note || undefined,
  });
  if (error) return { error: error.message };
  revalidateGyms();
  revalidatePath("/admin/gyms/[id]", "layout");
  return { error: null, scheduled: data };
}

/**
 * migration 1013 — schedules `packageId` to take over when the gym's
 * current period ends, rather than applying it today: if the gym is
 * already past its current_period_end (grace/read_only/no active period)
 * the RPC applies it immediately instead, since there is no live period
 * left to protect. See that migration's own header for the full reasoning.
 */
export async function changeSubscriptionPackage(organizationId: string, packageId: string): Promise<ActionResult> {
  await assertPermission("subscriptions.manage");
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_change_subscription_package", {
    p_organization_id: organizationId,
    p_package_id: packageId,
  });
  if (error) return { error: error.message };
  revalidateGyms();
  revalidatePath("/admin/gyms/[id]", "layout");
  return { error: null };
}

/** Undoes a queued "Change package" before it activates — a no-op target
 * (nothing scheduled) comes back as an error rather than silently
 * succeeding twice. */
export async function clearPendingSubscriptionPackage(organizationId: string): Promise<ActionResult> {
  await assertPermission("subscriptions.manage");
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_clear_pending_subscription_package", {
    p_organization_id: organizationId,
  });
  if (error) return { error: error.message };
  revalidateGyms();
  revalidatePath("/admin/gyms/[id]", "layout");
  return { error: null };
}

/**
 * FitDeskApp migration 0074's other half (supabase/migrations/1014_admin_
 * schedule_subscription_package.sql) — queues a package to start
 * automatically at the gym's existing renewal date, distinct from
 * changeSubscriptionPackage above (which reassigns immediately, at the
 * existing date, per 1004's own "no billing engine to prorate" design).
 * Surfaces on FitDeskApp's own /dashboard/billing as "Upcoming plan" —
 * nothing else needs telling; that page reads pending_package_id directly.
 */
export async function schedulePackage(organizationId: string, packageId: string): Promise<ActionResult> {
  await assertPermission("subscriptions.manage");
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_schedule_subscription_package", {
    p_organization_id: organizationId,
    p_package_id: packageId,
  });
  if (error) return { error: error.message };
  revalidateGyms();
  return { error: null };
}

export async function clearScheduledPackage(organizationId: string): Promise<ActionResult> {
  await assertPermission("subscriptions.manage");
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_clear_scheduled_package", { p_organization_id: organizationId });
  if (error) return { error: error.message };
  revalidateGyms();
  return { error: null };
}

export type ScheduledPackageInfo = {
  packageId: string;
  packageName: string;
  periodStart: string;
  periodEnd: string;
} | null;

/** Read side for the Manage Subscription sheet — fetched fresh every time
 * the sheet opens rather than threaded through as a prop, so it can never
 * show a stale schedule after the sheet itself just changed it. */
export async function getScheduledPackage(organizationId: string): Promise<ScheduledPackageInfo> {
  await assertPermission("gyms.view");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_get_scheduled_package", { p_organization_id: organizationId });
  if (error) throw new Error(error.message);
  const row = (Array.isArray(data) ? data[0] : data) as
    | { package_id: string | null; package_name: string | null; period_start: string | null; period_end: string | null }
    | null;
  if (!row?.package_id || !row.period_start || !row.period_end) return null;
  return {
    packageId: row.package_id,
    packageName: row.package_name ?? "Package",
    periodStart: row.period_start,
    periodEnd: row.period_end,
  };
}

export async function cancelSubscription(organizationId: string): Promise<ActionResult> {
  await assertPermission("subscriptions.manage");
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_cancel_subscription", { p_organization_id: organizationId });
  if (error) return { error: error.message };
  revalidateGyms();
  return { error: null };
}

export async function restoreSubscription(organizationId: string): Promise<ActionResult> {
  await assertPermission("subscriptions.manage");
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
  await assertPermission("gyms.manage");
  // A suspension must always carry a reason (Gym Command Center's dangerous-
  // action rule). The RPC itself still tolerates an empty one for old callers.
  if (reason.trim().length < 3) return { error: "A reason is required (at least 3 characters)." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_suspend_organization", {
    p_organization_id: organizationId,
    p_reason: reason.trim(),
  });
  if (error) return { error: error.message };
  revalidateGyms();
  revalidatePath("/admin/gyms/[id]", "layout");
  return { error: null };
}

export async function reactivateGym(organizationId: string): Promise<ActionResult> {
  await assertPermission("gyms.manage");
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
  await assertPermission("gyms.manage");
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
  await assertPermission("gyms.view");
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
