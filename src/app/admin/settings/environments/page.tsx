import { requirePermission } from "@/core/auth/access";
import { getActiveAdminEnvironment } from "@/core/env/active-environment";
import { ADMIN_ENVIRONMENT_LABEL } from "@/core/config/environments";
import { getDeploymentConfig } from "@/features/settings/integrations";
import { SettingsCard, Notice, LABEL_CLASS } from "../_components/ui";
import { EnvironmentSwitcher } from "./environment-switcher";

/**
 * Settings -> Environments. Open to every platform admin (switching is
 * per-browser, like a bookmark — it grants nothing: what you can actually do in
 * an environment is decided by whether that environment's own database lists
 * you as an active admin).
 */
export default async function EnvironmentsPage() {
  await requirePermission("settings.view");
  const environment = await getActiveAdminEnvironment();
  const config = getDeploymentConfig(environment);

  return (
    <>
      <SettingsCard
        title="Environment"
        description="Development and Production are two completely separate databases. Everything in this dashboard — gyms, members, packages, payments, reports, logs — reads and writes whichever one is selected."
      >
        <EnvironmentSwitcher />
        <Notice>
          If you don&apos;t have access to the environment you switch to, you&apos;ll be asked to sign in to it, and will be
          refused if it doesn&apos;t list you as an active admin. Your Development and Production sessions are kept
          separately and never mixed.
        </Notice>
      </SettingsCard>

      <SettingsCard title="Connected to" description={`The database this ${ADMIN_ENVIRONMENT_LABEL[environment]} session is using right now.`}>
        <dl className="grid gap-x-6 gap-y-3 text-[12.5px] sm:grid-cols-2">
          <div className="flex flex-col gap-0.5">
            <dt className={LABEL_CLASS}>Environment</dt>
            <dd className="font-bold text-ink">{ADMIN_ENVIRONMENT_LABEL[environment]}</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className={LABEL_CLASS}>Database host</dt>
            <dd className="break-all font-mono text-[12px] text-ink">{config.supabaseHost}</dd>
          </div>
        </dl>
      </SettingsCard>
    </>
  );
}
