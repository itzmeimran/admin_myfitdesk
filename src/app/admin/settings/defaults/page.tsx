import { createClient } from "@/core/db/server-client";
import { getAdminAccess, hasPermission, requirePermission } from "@/core/auth/access";
import { getPlatformSettings } from "@/features/settings/platform-settings";
import { SettingsCard, SectionError, Provenance, Notice } from "../_components/ui";
import { DefaultsForm } from "./defaults-form";

/**
 * Settings -> Platform defaults: what a NEW gym gets. Changing these never
 * edits a gym that already exists (the gym's own Manage subscription sheet is
 * where an existing gym's trial or grace period is changed).
 */
export default async function PlatformDefaultsPage() {
  await requirePermission("settings.view");
  const access = await getAdminAccess();
  const supabase = await createClient();
  const result = await getPlatformSettings(supabase);

  return (
    <SettingsCard
      title="Platform defaults"
      description="The starting point for gyms created from the Invite gym owner screen. The form is pre-filled from these, and the grace period is applied to the new gym's subscription."
    >
      <Notice>
        Applies to <strong>new</strong> gyms only. Existing gyms keep their current trial, grace period, country, currency
        and timezone. Gyms that sign up on their own in the main MyFitDesk app don&apos;t read these values.
      </Notice>
      {result.ok ? (
        <>
          <DefaultsForm
            key={result.data.defaults?.at ?? "defaults"}
            values={result.data.values}
            timezones={listTimezones()}
            canEdit={hasPermission(access, "settings.manage")}
          />
          <Provenance at={result.data.defaults?.at ?? null} by={result.data.defaults?.by ?? null} />
        </>
      ) : (
        <SectionError message={result.error} notInstalled={result.notInstalled} />
      )}
    </SettingsCard>
  );
}

function listTimezones(): string[] {
  try {
    return (Intl as unknown as { supportedValuesOf: (key: string) => string[] }).supportedValuesOf("timeZone");
  } catch {
    return ["Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "Europe/London", "America/New_York", "UTC"];
  }
}
