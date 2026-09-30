import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/core/db/server-client";
import { loose } from "@/core/db/loose-client";
import { resolvePlatformAdmin } from "@/core/auth/get-platform-admin";
import { PERMISSIONS, type Permission } from "@/core/auth/permissions";

export type AdminAccess = {
  userId: string;
  email: string | null;
  role: string;
  roleLabel: string;
  permissions: Permission[];
  /** True when this database is the live production project (from the DB
   * itself, not from the cookie the browser sends). */
  isProductionDatabase: boolean;
  /** The roles migration has not been applied to this environment yet, so every
   * existing admin keeps the access they always had (they can all do everything
   * until the migration gives them a role). */
  legacyUnmigrated: boolean;
};

type AccessPayload = {
  user_id: string;
  role: string;
  role_label: string;
  permissions: string[];
  is_production_database: boolean;
};

function isPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value);
}

/**
 * Who is this admin and what may they do? Answered by the DATABASE
 * (public.admin_my_access(), which reads platform_admins + the role's
 * permission rows under the caller's own JWT) — never by anything the browser
 * sends. Returns null for anyone who is not an active platform admin.
 *
 * Fail-closed on every error EXCEPT one: PostgREST's "function not found in
 * schema cache" (PGRST202) means the roles migration has not been applied to
 * this environment yet. In that one case the admin already passed the
 * is_platform_admin() gate, and before the migration that gate was all-or-
 * nothing, so they keep full access rather than the whole dashboard locking
 * everyone out. Any other error denies.
 */
async function getAdminAccessUncached(): Promise<AdminAccess | null> {
  const gate = await resolvePlatformAdmin();
  if (!gate.authorized) return null;

  const supabase = await createClient();
  const { data, error } = await loose(supabase).rpc("admin_my_access");

  if (error) {
    if (error.code === "PGRST202") {
      return {
        userId: gate.context.userId,
        email: gate.context.email,
        role: "platform_owner",
        roleLabel: "Platform Owner",
        permissions: [...PERMISSIONS],
        isProductionDatabase: false,
        legacyUnmigrated: true,
      };
    }
    return null;
  }
  if (!data) return null;

  const payload = data as AccessPayload;
  return {
    userId: payload.user_id,
    email: gate.context.email,
    role: payload.role,
    roleLabel: payload.role_label,
    permissions: payload.permissions.filter(isPermission),
    isProductionDatabase: payload.is_production_database,
    legacyUnmigrated: false,
  };
}

export const getAdminAccess = cache(getAdminAccessUncached);

export function hasPermission(access: AdminAccess | null, permission: Permission): boolean {
  return Boolean(access && access.permissions.includes(permission));
}

/**
 * Server-side route/action guard. Call at the top of every page, layout and
 * Server Action that needs a permission — a hidden nav link is not a
 * boundary, this is. Sends the caller to the friendly 403 page.
 */
export async function requirePermission(permission: Permission): Promise<AdminAccess> {
  const access = await getAdminAccess();
  if (!access || !access.permissions.includes(permission)) {
    redirect("/admin/forbidden");
  }
  return access;
}

/**
 * Defence-in-depth guard for the write actions of modules that predate roles
 * (gyms, packages, plans, WhatsApp credits, recovery). Their pages are already
 * closed to other roles by the section layouts; this stops the action being
 * invoked directly. Throws rather than returning, so it can be dropped in as
 * the first line of any action whatever its return shape. The database
 * functions behind those actions still only check "active platform admin" — see
 * the migration header.
 */
export async function assertPermission(permission: Permission): Promise<void> {
  const access = await getAdminAccess();
  if (!access || !access.permissions.includes(permission)) {
    throw new Error("You don't have permission to do that.");
  }
}

/** Same check for Server Actions, which must return an error instead of
 * redirecting mid-mutation. */
export async function checkPermission(permission: Permission): Promise<{ ok: true; access: AdminAccess } | { ok: false; error: string }> {
  const access = await getAdminAccess();
  if (!access || !access.permissions.includes(permission)) {
    return { ok: false, error: "You don't have permission to do that." };
  }
  return { ok: true, access };
}
