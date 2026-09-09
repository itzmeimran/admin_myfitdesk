import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/core/db/database.types";

/** Settings tab's "Configuration" section (task brief §10) — connection
 * *status* only, never a key or secret. Reads `admin_gym_configuration()`
 * (supabase/migrations/1006_admin_gym_detail.sql), a curated SECURITY
 * DEFINER function, rather than a blanket RLS SELECT policy on
 * payment_gateway_integrations/whatsapp_integrations/notification_preferences
 * — see that migration's header for why a curated RPC beats a blanket
 * policy for sensitive tenant tables. payment_gateway_secrets/
 * whatsapp_secrets are never touched by this function at all. */
export type GymConfiguration = {
  payment: { status: string; lastError: string | null } | null;
  whatsapp: { status: string; lastError: string | null } | null;
  notifications: {
    defaultChannel: string;
    weeklyDigestEnabled: boolean;
    renewalRemindersEnabled: boolean;
    paymentRemindersEnabled: boolean;
  } | null;
};

type AdminGymConfigurationJson = {
  payment: { status: string; last_error: string | null } | null;
  whatsapp: { status: string; last_error: string | null } | null;
  notifications: {
    default_channel: string;
    weekly_digest_enabled: boolean;
    renewal_reminders_enabled: boolean;
    payment_reminders_enabled: boolean;
  } | null;
};

export async function getGymConfiguration(
  supabase: SupabaseClient<Database>,
  organizationId: string,
): Promise<GymConfiguration> {
  const { data, error } = await supabase.rpc("admin_gym_configuration", { p_organization_id: organizationId });
  if (error) throw new Error(`Failed to load configuration: ${error.message}`);

  const raw = (Array.isArray(data) ? data[0] : data) as AdminGymConfigurationJson | null;
  if (!raw) return { payment: null, whatsapp: null, notifications: null };

  return {
    payment: raw.payment ? { status: raw.payment.status, lastError: raw.payment.last_error } : null,
    whatsapp: raw.whatsapp ? { status: raw.whatsapp.status, lastError: raw.whatsapp.last_error } : null,
    notifications: raw.notifications
      ? {
          defaultChannel: raw.notifications.default_channel,
          weeklyDigestEnabled: raw.notifications.weekly_digest_enabled,
          renewalRemindersEnabled: raw.notifications.renewal_reminders_enabled,
          paymentRemindersEnabled: raw.notifications.payment_reminders_enabled,
        }
      : null,
  };
}
