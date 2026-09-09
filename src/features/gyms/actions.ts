"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/core/db/server-client";

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
