import { createClient } from "@/core/db/server-client";
import { getAdminAccess, hasPermission, requirePermission } from "@/core/auth/access";
import { getPlatformSettings } from "@/features/settings/platform-settings";
import { SettingsCard, SectionError, Provenance } from "./_components/ui";
import { GeneralForm } from "./general-form";

/**
 * Settings -> General: the platform's own identity and support contact. The
 * name and support contact are printed in the footer of every invitation email
 * this dashboard sends; nothing here is decorative.
 */
export default async function GeneralSettingsPage() {
  await requirePermission("settings.view");
  const access = await getAdminAccess();
  const supabase = await createClient();
  const result = await getPlatformSettings(supabase);

  return (
    <SettingsCard
      title="General"
      description="How the platform presents itself. The platform name and support contact appear in the footer of invitation emails sent from this dashboard."
    >
      {result.ok ? (
        <>
          <GeneralForm
            key={result.data.general?.at ?? "defaults"}
            values={result.data.values}
            canEdit={hasPermission(access, "settings.manage")}
          />
          <Provenance at={result.data.general?.at ?? null} by={result.data.general?.by ?? null} />
        </>
      ) : (
        <SectionError message={result.error} notInstalled={result.notInstalled} />
      )}
    </SettingsCard>
  );
}
