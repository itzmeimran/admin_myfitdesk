import { createClient } from "@/core/db/server-client";
import { requirePermission } from "@/core/auth/access";
import { getActiveAdminEnvironment } from "@/core/env/active-environment";
import { ADMIN_ENVIRONMENT_LABEL } from "@/core/config/environments";
import { getBuildInfo, getCronHealth, getSystemInfo } from "@/features/settings/system";
import { SectionError, SettingsCard, StatTile, StatusPill, TextLink, formatWhen, timeAgo, LABEL_CLASS } from "../_components/ui";

/**
 * Settings -> System: read-only facts about what this dashboard is connected
 * to and whether the scheduled jobs are running. Build details come from the
 * deployment's own environment and are shown as "not available" when absent
 * (local dev) rather than invented.
 */
export default async function SystemPage() {
  await requirePermission("system.view");
  const environment = await getActiveAdminEnvironment();
  const supabase = await createClient();
  const [info, cron] = await Promise.all([getSystemInfo(supabase), getCronHealth(supabase)]);
  const build = getBuildInfo();

  const failingJobs = cron.ok ? cron.data.filter((job) => job.failed24h > 0 || !job.active).length : 0;

  return (
    <>
      {info.ok ? (
        <section className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="System summary">
          <StatTile label="Environment" value={ADMIN_ENVIRONMENT_LABEL[environment]} />
          <StatTile
            label="Maintenance mode"
            value={info.data.maintenanceMode ? "On" : "Off"}
            tone={info.data.maintenanceMode ? "attention" : "default"}
            hint="Managed in Recovery"
          />
          <StatTile
            label="Critical alerts open"
            value={info.data.openCriticalAlerts}
            tone={info.data.openCriticalAlerts > 0 ? "attention" : "default"}
          />
          <StatTile
            label="Scheduled jobs"
            value={cron.ok ? (failingJobs ? `${failingJobs} need attention` : "All healthy") : "—"}
            tone={failingJobs ? "attention" : "default"}
            hint={cron.ok ? `${cron.data.length} job${cron.data.length === 1 ? "" : "s"}` : undefined}
          />
        </section>
      ) : (
        <SectionError message={info.error} notInstalled={info.notInstalled} />
      )}

      <SettingsCard title="Runtime" description="What this dashboard is running on.">
        <dl className="grid gap-x-6 gap-y-3 text-[12.5px] sm:grid-cols-2 lg:grid-cols-3">
          <Fact label="Database environment" value={info.ok ? (info.data.environment ?? "Not recorded") : "—"} />
          <Fact label="Database project" value={info.ok ? (info.data.databaseIdentifier ?? "Not recorded") : "—"} mono />
          <Fact label="Postgres version" value={info.ok ? info.data.postgresVersion : "—"} />
          <Fact label="Database time" value={info.ok ? formatWhen(info.data.serverTime) : "—"} />
          <Fact label="Deployment" value={build.vercelEnvironment ?? "Not available (local)"} />
          <Fact label="Build" value={build.commit ? `${build.commit}${build.branch ? ` · ${build.branch}` : ""}` : "Not available (local)"} mono />
          <Fact label="Region" value={build.region ?? "Not available"} />
          <Fact label="Node" value={build.nodeVersion} />
          <Fact label="Billing model" value={info.ok ? (info.data.billingModel ?? "—") : "—"} note={<TextLink href="/admin/packages">Change on Packages</TextLink>} />
        </dl>
      </SettingsCard>

      <SettingsCard
        title="Scheduled jobs"
        description="Background jobs running inside the database (payment expiry, WhatsApp queues, API metrics). Status comes from each job's own run history."
      >
        {cron.ok ? (
          cron.data.length === 0 ? (
            <p className="text-[12.5px] text-mute">
              {info.ok && !info.data.cronAvailable ? "The scheduler (pg_cron) isn't installed on this database." : "No scheduled jobs are registered."}
            </p>
          ) : (
            <>
              <div className="hidden overflow-x-auto border-[1.5px] border-line md:block">
                <table className="w-full min-w-[760px] border-collapse text-[12.5px]">
                  <thead>
                    <tr className="border-b-[1.5px] border-line bg-sand text-left text-[10px] font-bold uppercase tracking-[0.1em] text-mute">
                      <th className="px-3 py-2.5">Job</th>
                      <th className="px-3 py-2.5">Schedule</th>
                      <th className="px-3 py-2.5">Last run</th>
                      <th className="px-3 py-2.5">Result</th>
                      <th className="px-3 py-2.5 text-right">Runs / failed (24 h)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cron.data.map((job) => (
                      <tr key={job.name} className="mfd-table-row border-b border-line align-top last:border-b-0">
                        <td className="px-3 py-2.5 font-mono text-[12px] text-ink">{job.name}</td>
                        <td className="px-3 py-2.5 font-mono text-[11.5px] text-mute">{job.schedule}</td>
                        <td className="px-3 py-2.5 text-mute" title={job.lastRunAt ?? undefined}>{job.lastRunAt ? timeAgo(job.lastRunAt) : "Never"}</td>
                        <td className="px-3 py-2.5">
                          <JobStatus job={job} />
                          {job.lastError ? <div className="mt-1 max-w-[320px] break-words text-[11px] text-accent">{job.lastError}</div> : null}
                        </td>
                        <td className="px-3 py-2.5 text-right text-mute">{job.runs24h} / {job.failed24h}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="flex flex-col gap-2.5 md:hidden">
                {cron.data.map((job) => (
                  <li key={job.name} className="flex flex-col gap-1.5 border-[1.5px] border-line p-3.5">
                    <span className="flex items-start justify-between gap-2">
                      <span className="break-all font-mono text-[12px] text-ink">{job.name}</span>
                      <JobStatus job={job} />
                    </span>
                    <span className="font-mono text-[11px] text-mute">{job.schedule}</span>
                    <span className="text-[11.5px] text-mute">
                      {job.lastRunAt ? `Last ran ${timeAgo(job.lastRunAt)}` : "Never ran"} · {job.runs24h} runs, {job.failed24h} failed in 24 h
                    </span>
                    {job.lastError ? <span className="break-words text-[11px] text-accent">{job.lastError}</span> : null}
                  </li>
                ))}
              </ul>
            </>
          )
        ) : (
          <SectionError message={cron.error} notInstalled={cron.notInstalled} />
        )}
      </SettingsCard>

      <SettingsCard title="Feature flags" description="There is no feature-flag system in the platform today, so there is nothing to toggle here. The one global switch that does exist — which plan catalogue buyers see — lives on the Packages page.">
        <span className="text-[12px]">
          <TextLink href="/admin/packages">Open Packages</TextLink>
        </span>
      </SettingsCard>
    </>
  );
}

function JobStatus({ job }: { job: { active: boolean; lastStatus: string | null; failed24h: number } }) {
  if (!job.active) return <StatusPill label="Paused" tone="Cancelled" />;
  if (!job.lastStatus) return <StatusPill label="No runs yet" tone="No data" />;
  if (job.lastStatus === "failed") return <StatusPill label="Last run failed" tone="Down" />;
  if (job.failed24h > 0) return <StatusPill label="Some failures" tone="Attention" />;
  return <StatusPill label="Healthy" />;
}

function Fact({ label, value, mono, note }: { label: string; value: string; mono?: boolean; note?: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className={LABEL_CLASS}>{label}</dt>
      <dd className={`break-words text-ink ${mono ? "font-mono text-[12px]" : ""}`}>{value}</dd>
      {note ? <span className="text-[11px]">{note}</span> : null}
    </div>
  );
}
