import { createClient } from "@/core/db/server-client";
import { getAdminAccess, hasPermission, requirePermission } from "@/core/auth/access";
import { getDataPolicy } from "@/features/settings/privacy";
import { SectionError, SettingsCard, TextLink, LABEL_CLASS, Provenance } from "../_components/ui";
import { RetentionForm } from "./retention-form";

/**
 * Settings -> Data & privacy. One editable policy that is really enforced (API
 * telemetry retention — the daily api-metrics-prune job reads it), plus plain
 * statements of how the platform already behaves. Backups and restores stay in
 * Recovery, deliberately.
 */
export default async function PrivacyPage() {
  await requirePermission("privacy.view");
  const access = await getAdminAccess();
  const supabase = await createClient();
  const policy = await getDataPolicy(supabase);

  return (
    <>
      <SettingsCard
        title="API telemetry retention"
        description="How long request-level performance data is kept. A daily job deletes anything older. Shortening it permanently removes older telemetry at the next run."
      >
        {policy.ok ? (
          policy.data ? (
            <>
              <RetentionForm
                key={policy.data.apiSettingsUpdatedAt ?? "initial"}
                rawDays={policy.data.apiRawRetentionDays}
                hourlyDays={policy.data.apiHourlyRetentionDays}
                canEdit={hasPermission(access, "privacy.manage")}
              />
              <Provenance at={policy.data.apiSettingsUpdatedAt} by={null} />
            </>
          ) : (
            <p className="text-[12.5px] text-mute">API monitoring isn&apos;t set up on this environment.</p>
          )
        ) : (
          <SectionError message={policy.error} notInstalled={policy.notInstalled} />
        )}
      </SettingsCard>

      <SettingsCard title="How platform data is handled" description="These describe how the platform already works; they are not switches.">
        <dl className="grid gap-4 md:grid-cols-2">
          <Fact term="Audit log">
            Admin actions are recorded in an append-only log and kept indefinitely. Nothing in the dashboard can edit or delete an entry.
          </Fact>
          <Fact term="Deleting data">
            Gyms, members and subscriptions are never hard-deleted by the dashboard. They are archived or soft-deleted and can be restored from the recycle bin in Recovery.
          </Fact>
          <Fact term="Backups and restores">
            Retention tiers, protection and restores are managed on <TextLink href="/admin/system/disaster-recovery">Recovery</TextLink>, which remains the operational page for them.
          </Fact>
          <Fact term="Personal data in audit entries">
            Audit entries record who did what and to which record. They never contain passwords, tokens or API keys.
          </Fact>
        </dl>
      </SettingsCard>
    </>
  );
}

function Fact({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-[1.5px] border-line p-3.5">
      <dt className={LABEL_CLASS}>{term}</dt>
      <dd className="text-[12.5px] leading-relaxed text-ink">{children}</dd>
    </div>
  );
}
