import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/core/db/database.types";
import type { OwnerInvitation, OwnerInvitationStatus } from "./onboarding-types";

/**
 * Read side of gym-owner onboarding (supabase/migrations/1012_gym_owner_
 * onboarding.sql) — reuses FitDeskApp's own `staff_invitations` table under
 * the hood (role='owner'), surfaced here as a jsonb round trip via
 * `admin_get_gym_owner_invitation()` so this app never has to know that
 * table's raw shape. Shared types/labels live in ./onboarding-types (no
 * `server-only`) so a Client Component can import them without pulling this
 * module's server-only guard along with it.
 */

type RawOwnerInvitation = {
  id: string;
  email: string;
  status: OwnerInvitation["status"];
  effective_status: OwnerInvitationStatus;
  invited_first_name: string | null;
  invited_last_name: string | null;
  invited_phone: string | null;
  invited_at: string;
  expires_at: string;
  email_verified_at: string | null;
  accepted_at: string | null;
  revoked_at: string | null;
  resend_count: number;
  last_resent_at: string | null;
};

export async function getGymOwnerInvitation(
  supabase: SupabaseClient<Database>,
  organizationId: string,
): Promise<OwnerInvitation | null> {
  const { data, error } = await supabase.rpc("admin_get_gym_owner_invitation", {
    p_organization_id: organizationId,
  });
  if (error) throw new Error(`Failed to load the owner invitation: ${error.message}`);

  const raw = (Array.isArray(data) ? data[0] : data) as RawOwnerInvitation | null;
  if (!raw) return null;

  return {
    id: raw.id,
    email: raw.email,
    status: raw.status,
    effectiveStatus: raw.effective_status,
    invitedFirstName: raw.invited_first_name,
    invitedLastName: raw.invited_last_name,
    invitedPhone: raw.invited_phone,
    invitedAt: raw.invited_at,
    expiresAt: raw.expires_at,
    emailVerifiedAt: raw.email_verified_at,
    acceptedAt: raw.accepted_at,
    revokedAt: raw.revoked_at,
    resendCount: raw.resend_count,
    lastResentAt: raw.last_resent_at,
  };
}
