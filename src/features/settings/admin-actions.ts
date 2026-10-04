"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/core/db/server-client";
import { loose } from "@/core/db/loose-client";
import { checkPermission, type AdminAccess } from "@/core/auth/access";
import { requireProductionConfirmation } from "@/core/auth/production-guard";
import { getAdminDetail, type AdminDetail } from "./admins";
import { z } from 'zod';

/**
 * Admin-lifecycle writes (role, suspend / reactivate / revoke, sessions). Plain
 * RPC wrappers — every rule that matters (owner-only, no self-suspend, never
 * remove the last Platform Owner, audit row) is enforced INSIDE the database
 * function, so these can't be talked around by calling the action with odd
 * arguments. What the action adds: the permission check up front, and the typed
 * PRODUCTION confirmation on the live environment.
 *
 * Inviting (which must create an auth account with the service key) lives in
 * app/admin/settings/_server/invite-actions.ts, outside features/**.
 */

export type ActionResult = { error: string | null };
export async function changeSalesTeam(userId:string,team:string,confirmation?:string):Promise<ActionResult> {
  const allowed=await authorize('admins.manage',confirmation,true);
  if(!allowed.ok)return {error:allowed.error};
  if(!z.string().uuid().safeParse(userId).success||team.trim().length>80)return {error:'Invalid sales team'};
  const {error}=await loose(await createClient()).rpc('admin_sales_set_team',{p_user_id:userId,p_team:team.trim()||null});
  if(error)return {error:error.message};
  revalidatePath('/admin','layout');return {error:null};
}

async function authorize(
  permission: "admins.manage" | "admins.view",
  confirmation?: string,
  requireConfirmation = false,
): Promise<{ ok: true; access: AdminAccess } | { ok: false; error: string }> {
  const allowed = await checkPermission(permission);
  if (!allowed.ok) return allowed;
  if (requireConfirmation) {
    const problem = await requireProductionConfirmation(confirmation, allowed.access);
    if (problem) return { ok: false, error: problem };
  }
  return allowed;
}

function refresh() {
  revalidatePath("/admin/settings/admins");
  revalidatePath("/admin/settings/security");
}

export async function loadAdminDetail(userId: string): Promise<{ error: string | null; detail: AdminDetail | null }> {
  const allowed = await authorize("admins.view");
  if (!allowed.ok) return { error: allowed.error, detail: null };

  const supabase = await createClient();
  const result = await getAdminDetail(supabase, userId);
  if (!result.ok) return { error: result.error, detail: null };
  return { error: null, detail: result.data };
}

export async function changeAdminRole(userId: string, role: string, confirmation?: string): Promise<ActionResult> {
  const allowed = await authorize("admins.manage", confirmation, true);
  if (!allowed.ok) return { error: allowed.error };

  const supabase = await createClient();
  const { error } = await loose(supabase).rpc("admin_set_platform_admin_role", { p_user_id: userId, p_role: role });
  if (error) return { error: error.message };
  refresh();
  return { error: null };
}

export async function changeAdminStatus(
  userId: string,
  action: "suspend" | "reactivate" | "revoke",
  reason: string,
  confirmation?: string,
): Promise<ActionResult> {
  const allowed = await authorize("admins.manage", confirmation, true);
  if (!allowed.ok) return { error: allowed.error };

  const supabase = await createClient();
  const { error } = await loose(supabase).rpc("admin_set_platform_admin_status", {
    p_user_id: userId,
    p_action: action,
    p_reason: reason.trim() || null,
  });
  if (error) return { error: error.message };
  refresh();
  return { error: null };
}

export async function revokeAdminSession(sessionId: string, confirmation?: string): Promise<ActionResult> {
  const allowed = await authorize("admins.manage", confirmation, true);
  if (!allowed.ok) return { error: allowed.error };

  const supabase = await createClient();
  const { error } = await loose(supabase).rpc("admin_revoke_admin_session", { p_session_id: sessionId });
  if (error) return { error: error.message };
  refresh();
  return { error: null };
}

/** Emergency lever: ends every other platform admin's sessions. The caller's
 * own session survives. */
export async function signOutAllOtherAdmins(confirmation?: string): Promise<ActionResult & { revoked: number }> {
  const allowed = await authorize("admins.manage", confirmation, true);
  if (!allowed.ok) return { error: allowed.error, revoked: 0 };

  const supabase = await createClient();
  const { data, error } = await loose(supabase).rpc("admin_revoke_all_other_admin_sessions");
  if (error) return { error: error.message, revoked: 0 };
  refresh();
  return { error: null, revoked: Number(data ?? 0) };
}
