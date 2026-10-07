import "server-only";
import { createClient } from "@/core/db/server-client";
import { getActiveAdminEnvironment } from "@/core/env/active-environment";
import { tenantAppOrigin } from "@/core/config/tenant-app";

/** The tenant app owns OTP hashing and WhatsApp delivery. Forward only the
 * admin's project-scoped access token to the matching canonical application. */
export async function sendOwnerPhoneOtp(invitationId: string): Promise<string | null> {
  const environment = await getActiveAdminEnvironment();
  const client = await createClient();
  const { data: { session } } = await client.auth.getSession();
  if (!session) return "Your session ended. Sign in again to send the verification code.";
  const origin = tenantAppOrigin(environment);
  const bypass = environment === "dev" ? process.env.MYFITDESK_AUTOMATION_BYPASS_DEV : undefined;
  try {
    const response = await fetch(`${origin}/api/admin/gym-owner/phone-otp`, {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json",
        ...(bypass ? { "x-vercel-protection-bypass": bypass } : {}) },
      body: JSON.stringify({ invitationId }),
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(25000),
    });
    const body = await response.json() as { error?: string };
    return response.ok ? null : body.error ?? "Couldn't send the WhatsApp code. Use Resend OTP from the gym's page.";
  } catch {
    return "Couldn't confirm that the WhatsApp code was sent. The gym is saved; use Resend OTP from its page, or the owner can request a code at login.";
  }
}
