import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/core/db/database.types";

export type OwnerAccount = {
  first_name: string;
  last_name: string | null;
  email: string | null;
  email_verified: boolean;
  phone: string | null;
  phone_verified: boolean;
  whatsapp_otp_available: boolean;
};

export async function getOwnerAccount(client: SupabaseClient<Database>, organizationId: string, staffId: string): Promise<OwnerAccount | null> {
  const { data, error } = await client.rpc("admin_gym_owner_account", {
    p_organization_id: organizationId, p_staff_id: staffId,
  });
  // An unavailable lookup must never be presented as an unverified account.
  if (error) {
    console.error("[gym-owner] Account lookup failed", { code: error.code });
    return null;
  }
  return data as OwnerAccount | null;
}
