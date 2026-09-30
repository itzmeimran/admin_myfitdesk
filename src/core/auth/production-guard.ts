import "server-only";
import { getActiveAdminEnvironment } from "@/core/env/active-environment";
import type { AdminAccess } from "@/core/auth/access";

/**
 * The word an admin must type before a sensitive change is allowed on
 * Production. The dialogs ask for it (ConfirmDialog.requireTypedConfirmation)
 * and pass the typed text along; THIS is where the server checks it, so a
 * sensitive action posted directly to the Server Action without the typed
 * confirmation is refused too. It is a mis-click guard for people, not a
 * substitute for the permission check.
 */
export const PRODUCTION_CONFIRMATION = "PRODUCTION";

/** Production = the live database (asked of the DATABASE, via the access
 * payload) OR the environment cookie says prod. Either is enough to demand the
 * typed confirmation; the cookie alone can only make the guard stricter. */
export async function isProductionContext(access?: AdminAccess): Promise<boolean> {
  if (access?.isProductionDatabase) return true;
  return (await getActiveAdminEnvironment()) === "prod";
}

/** Returns an error message when a typed confirmation is required and wasn't
 * supplied correctly, otherwise null. */
export async function requireProductionConfirmation(
  confirmation: string | undefined,
  access?: AdminAccess,
): Promise<string | null> {
  if (!(await isProductionContext(access))) return null;
  if ((confirmation ?? "").trim().toUpperCase() === PRODUCTION_CONFIRMATION) return null;
  return `You're on Production. Type ${PRODUCTION_CONFIRMATION} to confirm this change.`;
}
