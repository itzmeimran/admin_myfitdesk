import { redirect } from "next/navigation";
import { createClient } from "@/core/db/server-client";
import { getActiveAdminEnvironment } from "@/core/env/active-environment";
import { ADMIN_ENVIRONMENT_LABEL } from "@/core/config/environments";
import { SetPasswordForm } from "./SetPasswordForm";

/** Reached only after a valid invitation token was redeemed (auth/confirm), so
 * there is a session to set a password on. Without one, send them to sign in. */
export default async function SetPasswordPage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) redirect("/login");

  const environment = await getActiveAdminEnvironment();
  return <SetPasswordForm environmentLabel={ADMIN_ENVIRONMENT_LABEL[environment]} email={(claims.claims.email as string | undefined) ?? ""} />;
}
