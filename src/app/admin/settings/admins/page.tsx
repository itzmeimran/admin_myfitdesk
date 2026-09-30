import { createClient } from "@/core/db/server-client";
import { getAdminAccess, hasPermission, requirePermission } from "@/core/auth/access";
import { getActiveAdminEnvironment } from "@/core/env/active-environment";
import { listPlatformAdmins, listPlatformRoles } from "@/features/settings/admins";
import { getOtherEnvironmentAccess } from "../_server/env-access";
import { SectionError } from "../_components/ui";
import { AdminsView } from "./admins-view";

/**
 * Settings -> Admins & permissions. Owner-only (admins.view). Everything shown
 * comes from the database's own roster function; the "other environment" column
 * is the only cross-project read (see _server/env-access.ts).
 */
export default async function AdminsPage() {
  await requirePermission("admins.view");
  const access = await getAdminAccess();
  const environment = await getActiveAdminEnvironment();
  const supabase = await createClient();

  const [adminsResult, rolesResult] = await Promise.all([listPlatformAdmins(supabase), listPlatformRoles(supabase)]);

  if (!adminsResult.ok) return <SectionError message={adminsResult.error} notInstalled={adminsResult.notInstalled} />;
  if (!rolesResult.ok) return <SectionError message={rolesResult.error} notInstalled={rolesResult.notInstalled} />;

  const otherEnv = await getOtherEnvironmentAccess(
    environment,
    adminsResult.data.map((admin) => admin.email),
  );

  return (
    <AdminsView
      admins={adminsResult.data}
      roles={rolesResult.data}
      otherEnvironment={otherEnv}
      currentEnvironment={environment}
      canManage={hasPermission(access, "admins.manage")}
    />
  );
}
