import { ButtonLink } from "@/components/ButtonLink";
import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/core/db/database.types";
import type { GymDetail } from "@/features/gyms/detail";
import { getGymOverview } from "@/features/gyms/overview";
import {
  getAccess,
  getAlerts,
  getCreditHistory,
  getDataHealth,
  getFeatureFlags,
  getJobs,
  getLocks,
  getOpsSummary,
  getReconciliation,
  getWebhooks,
  getWhatsAppOps,
} from "@/features/gyms/ops/queries";
import { LOCK_CATALOG, lockLabel, type CheckFinding } from "@/features/gyms/ops/types";
import { exactTime, relativeTime } from "@/features/gyms/ops/timeline-format";
import { CommandCenter } from "../command-center";
import { EmptyNote, Guard, JobStatusPill, SectionCard, StatusPill, Tile, When, hoursSince, whenText } from "../ops-ui";
import {
  AccessControls,
  AlertControls,
  DangerZone,
  ExportPanel,
  FlagRowControl,
  LockRowControl,
  RefreshAlertsButton,
  RetryButton,
  WebhookEventList,
  WhatsAppControls,
} from "../ops-controls";
import { DatabaseIcon } from "@/core/ui/icons";

type Client = SupabaseClient<Database>;
type Ctx = { supabase: Client; gym: GymDetail; tz: string };

const n = (value: number) => value.toLocaleString("en-IN");

/* ------------------------------------------------------------- Command center */

export function CommandSection({ supabase, gym }: Ctx) {
  return (
    <Guard
      title="Command center"
      load={async () => {
        const [summary, overview] = await Promise.all([
          getOpsSummary(supabase, gym.id),
          getGymOverview(supabase, gym.id).catch(() => null),
        ]);
        return { summary, overview };
      }}
    >
      {({ summary, overview }) => <CommandCenter gym={gym} summary={summary} overview={overview} />}
    </Guard>
  );
}

/* ------------------------------------------------------------- WhatsApp */

export function WhatsAppSection({ supabase, gym, tz }: Ctx) {
  return (
    <Guard
      title="WhatsApp operations"
      load={async () => {
        const [ops, history] = await Promise.all([getWhatsAppOps(supabase, gym.id), getCreditHistory(supabase, gym.id, 10, 0)]);
        return { ops, history };
      }}
    >
      {({ ops, history }) => {
        const attempted = ops.sent30d + ops.failed30d;
        const failureRate = attempted > 0 ? ((ops.failed30d / attempted) * 100).toFixed(1) : null;
        return (
          <div className="flex flex-col gap-4">
            <SectionCard
              title="WhatsApp operations"
              description="Sends, delivery and credits for this gym. Figures are for the last 30 days unless stated."
              action={<WhatsAppControls organizationId={gym.id} gymName={gym.name} paused={ops.paused} retryEligible={ops.retryEligible} />}
            >
              {ops.paused ? (
                <div className="border-[1.5px] border-accent bg-accent/8 px-3 py-2 text-[12px] font-bold text-accent">
                  Sending is paused for this gym. Messages wait in the queue until it is resumed.
                </div>
              ) : null}
              <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4 xl:grid-cols-5">
                <Tile label="Credit balance" value={n(ops.balance)} tone={ops.balance === 0 ? "accent" : "neutral"} />
                <Tile label="Sent" value={n(ops.sent30d)} lines={[`${n(ops.totalSent)} all time`]} />
                <Tile label="Delivered" value={n(ops.delivered30d)} lines={[ops.sent30d ? `${((ops.delivered30d / ops.sent30d) * 100).toFixed(0)}% of sent` : null]} />
                <Tile label="Read" value={n(ops.read30d)} />
                <Tile label="Failed" value={n(ops.failed30d)} tone={ops.failed30d > 0 ? "accent" : "neutral"} lines={[failureRate === null ? "No sends to measure" : `${failureRate}% failure rate`]} />
                <Tile label="Queued now" value={n(ops.pending)} />
                <Tile label="Skipped" value={n(ops.skipped30d)} lines={["Mostly insufficient credits"]} />
                <Tile label="Last message" value={<span className="text-[13px]">{ops.lastMessageAt ? relativeTime(ops.lastMessageAt) : "None"}</span>} lines={[ops.lastMessageAt ? exactTime(ops.lastMessageAt, tz) : null]} />
                <Tile label="Last successful" value={<span className="text-[13px]">{ops.lastSuccessAt ? relativeTime(ops.lastSuccessAt) : "None"}</span>} lines={[ops.lastSuccessAt ? exactTime(ops.lastSuccessAt, tz) : null]} />
                <Tile
                  label="Last failure"
                  value={<span className="text-[13px]">{ops.lastFailure ? relativeTime(ops.lastFailure.at) : "None"}</span>}
                  lines={[ops.lastFailure?.message ?? (ops.lastFailure?.code ? `Code ${ops.lastFailure.code}` : null)]}
                  tone={ops.lastFailure ? "accent" : "neutral"}
                />
              </div>
            </SectionCard>

            <SectionCard title="Most common failure reasons" description="Last 30 days, grouped by provider error.">
              {ops.topFailures.length ? (
                <div className="divide-y divide-line border-[1.5px] border-line">
                  {ops.topFailures.map((f) => (
                    <div key={`${f.code}-${f.message}`} className="flex items-start justify-between gap-3 px-3 py-2.5 text-[12.5px]">
                      <span className="min-w-0">
                        <span className="font-bold text-ink">{f.message}</span>
                        <span className="block font-mono text-[10.5px] text-mute3">Code {f.code}</span>
                      </span>
                      <StatusPill tone="Attention">{n(f.count)}×</StatusPill>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyNote>No failed messages in the last 30 days.</EmptyNote>
              )}
              <div className="flex flex-wrap items-center gap-3">
                <Link href={`/admin/gyms/${gym.id}/whatsapp?status=failed`} className="text-[10.5px] font-bold uppercase tracking-[0.09em] text-accent hover:underline">
                  View failed messages →
                </Link>
                <Link href={`/admin/gyms/${gym.id}/whatsapp`} className="text-[10.5px] font-bold uppercase tracking-[0.09em] text-accent hover:underline">
                  Full message history →
                </Link>
              </div>
            </SectionCard>

            <SectionCard title="Credit adjustment history" description="Purchases and admin adjustments, newest first. Usage is not listed here.">
              {history.rows.length ? (
                <div className="overflow-x-auto border-[1.5px] border-line">
                  <table className="w-full min-w-[560px] text-left text-[12px]">
                    <thead className="bg-sand text-[9.5px] font-bold uppercase tracking-[0.1em] text-mute">
                      <tr>
                        <th className="px-3 py-2">When</th>
                        <th className="px-3 py-2">Change</th>
                        <th className="px-3 py-2">Balance after</th>
                        <th className="px-3 py-2">By</th>
                        <th className="px-3 py-2">Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.rows.map((r) => (
                        <tr key={r.id} className="mfd-table-row border-t border-line">
                          <td className="whitespace-nowrap px-3 py-2">{exactTime(r.createdAt, tz)}</td>
                          <td className={`px-3 py-2 font-bold ${r.delta < 0 ? "text-accent" : "text-ink"}`}>
                            {r.delta > 0 ? "+" : ""}
                            {n(r.delta)} <span className="font-normal text-mute3">({r.reason})</span>
                          </td>
                          <td className="px-3 py-2">{n(r.balanceAfter)}</td>
                          <td className="px-3 py-2">{r.createdByEmail ?? (r.reason === "purchase" ? "Gym owner" : "System")}</td>
                          <td className="px-3 py-2 text-mute">{r.adminReason ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyNote>No purchases or adjustments recorded yet.</EmptyNote>
              )}
              {history.total > history.rows.length ? <p className="text-[11px] text-mute3">Showing the latest {history.rows.length} of {n(history.total)}.</p> : null}
            </SectionCard>
          </div>
        );
      }}
    </Guard>
  );
}

/* ------------------------------------------------------------- Jobs */

export function JobsSection({ supabase, gym, tz }: Ctx) {
  return (
    <Guard title="Jobs & automations" load={() => getJobs(supabase, gym.id)}>
      {(jobs) => (
        <SectionCard
          title="Jobs & automations"
          description="Derived from what each scheduled job writes. Duration and per-run retry counts are not recorded, so they are not shown."
          action={<RetryButton organizationId={gym.id} eligible label="Retry failed WhatsApp sends" />}
        >
          <div className="overflow-x-auto border-[1.5px] border-line">
            <table className="w-full min-w-[720px] text-left text-[12px]">
              <thead className="bg-sand text-[9.5px] font-bold uppercase tracking-[0.1em] text-mute">
                <tr>
                  <th className="px-3 py-2">Job</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Last run</th>
                  <th className="px-3 py-2">Last success</th>
                  <th className="px-3 py-2">Next expected</th>
                  <th className="px-3 py-2">Failures (7d)</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((j) => (
                  <tr key={j.key} className="mfd-table-row border-t border-line align-top">
                    <td className="px-3 py-2.5">
                      <strong className="text-ink">{j.label}</strong>
                      {j.errorMessage ? <span className="block max-w-[260px] text-[11px] text-accent">{j.errorMessage}</span> : null}
                      <details className="mt-1 text-[11px] text-mute">
                        <summary className="cursor-pointer font-bold uppercase tracking-[0.08em]">Technical details</summary>
                        <pre className="mt-1 overflow-x-auto whitespace-pre-wrap bg-sand/60 p-2 font-mono text-[10.5px]">{JSON.stringify(j.detail, null, 2)}</pre>
                      </details>
                    </td>
                    <td className="px-3 py-2.5"><JobStatusPill status={j.status} /></td>
                    <td className="px-3 py-2.5"><When value={j.lastRunAt} timeZone={tz} empty="No runs yet" /></td>
                    <td className="px-3 py-2.5"><When value={j.lastSuccessAt} timeZone={tz} empty="—" /></td>
                    <td className="px-3 py-2.5">{j.nextExpectedAt ? whenText(j.nextExpectedAt, tz) : "Not scheduled here"}</td>
                    <td className={`px-3 py-2.5 font-bold ${j.failures7d > 0 ? "text-accent" : ""}`}>{j.failures7d}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] leading-relaxed text-mute3">
            Only the WhatsApp send queue can be retried from here (and only messages that are safe to resend). The other jobs are run by the gym
            app&apos;s scheduler; re-running them safely has to happen there.
          </p>
        </SectionCard>
      )}
    </Guard>
  );
}

/* ------------------------------------------------------------- Webhooks */

export function WebhooksSection({ supabase, gym, tz }: Ctx) {
  return (
    <Guard title="Webhook health" load={() => getWebhooks(supabase, gym.id)}>
      {(data) => (
        <SectionCard title="Webhook health" description="Razorpay events are matched to this gym by order / payment id. WhatsApp health comes from its last delivery receipt.">
          <div className="grid grid-cols-1 gap-2.5 md:grid-cols-3">
            {data.providers.map((p) => (
              <div key={p.provider} className="flex flex-col gap-1.5 border-[1.5px] border-line bg-paper p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <strong className="text-[13px]">{p.label}</strong>
                  <JobStatusPill status={p.status} />
                </div>
                <span className="text-[11.5px] text-mute">Last received: <When value={p.lastReceivedAt} timeZone={tz} empty="Never" /></span>
                <span className="text-[11.5px] text-mute">Last processed: <When value={p.lastProcessedAt} timeZone={tz} empty="Never" /></span>
                <span className={`text-[11.5px] ${p.failedCount > 0 ? "font-bold text-accent" : "text-mute"}`}>
                  {p.provider === "email" ? "Email delivery isn't tracked yet" : `${p.failedCount} failed · ${p.unprocessedCount} waiting`}
                </span>
                {p.lastError ? <span className="text-[11px] leading-snug text-accent">{p.lastError}</span> : null}
              </div>
            ))}
          </div>
          <h3 className="mfd-micro-label mt-1">Recent Razorpay events</h3>
          {data.recentEvents.length ? (
            <WebhookEventList events={data.recentEvents} timeZone={tz} />
          ) : (
            <EmptyNote>No Razorpay webhook events are linked to this gym yet.</EmptyNote>
          )}
        </SectionCard>
      )}
    </Guard>
  );
}

/* ------------------------------------------------------------- Findings (reconciliation + data health) */

function FindingList({ findings }: { findings: CheckFinding[] }) {
  const sorted = [...findings].sort((a, b) => {
    const rank = { critical: 0, warning: 1, info: 2 } as const;
    const fa = (a.total ?? a.count) > 0 ? 0 : 1;
    const fb = (b.total ?? b.count) > 0 ? 0 : 1;
    return fa - fb || rank[a.severity] - rank[b.severity];
  });
  return (
    <div className="divide-y divide-line border-[1.5px] border-line bg-paper">
      {sorted.map((f) => {
        const total = f.total ?? f.count;
        const failing = total > 0;
        return (
          <details key={f.key} className="group">
            <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-3.5 py-3 hover:bg-sand/40">
              <span className="flex min-w-0 flex-col">
                <strong className="text-[13px] text-ink">{f.title}</strong>
                <span className="text-[11.5px] text-mute">{f.description}</span>
              </span>
              <span className="flex items-center gap-2">
                <StatusPill tone={!failing ? "Healthy" : f.severity === "critical" ? "Down" : f.severity === "warning" ? "Attention" : "No data"}>
                  {failing ? `${n(total)} affected · ${f.severity}` : "Passing"}
                </StatusPill>
                {failing ? <span className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-mute">Inspect</span> : null}
              </span>
            </summary>
            {failing ? (
              <div className="border-t border-line bg-sand/35 px-3.5 py-3">
                <ul className="flex flex-col gap-1.5 text-[12px] text-ink2">
                  {f.samples.map((s) => (
                    <li key={s.id} className="flex flex-wrap justify-between gap-2">
                      <span>{s.label}</span>
                      {s.at ? <span className="text-mute3">{relativeTime(s.at)}</span> : null}
                    </li>
                  ))}
                </ul>
                {total > f.samples.length ? <p className="mt-2 text-[11px] text-mute3">Showing {f.samples.length} of {n(total)}.</p> : null}
                <p className="mt-2 text-[11px] text-mute3">Nothing is changed automatically. Investigate first, then correct in the gym app or with an explicit admin action.</p>
              </div>
            ) : null}
          </details>
        );
      })}
    </div>
  );
}

export function ReconciliationSection({ supabase, gym }: Ctx) {
  return (
    <Guard title="Payment reconciliation" load={() => getReconciliation(supabase, gym.id)}>
      {(findings) => (
        <SectionCard
          title="Payment reconciliation"
          description="Compares Razorpay webhook events with this gym's subscription and credit-purchase records. Razorpay itself is not queried live; events on file stand in for it."
        >
          <FindingList findings={findings} />
        </SectionCard>
      )}
    </Guard>
  );
}

export function HealthSection({ supabase, gym }: Ctx) {
  return (
    <Guard title="Data health" load={() => getDataHealth(supabase, gym.id)}>
      {(findings) => (
        <SectionCard title="Data health checks" description="Read-only checks on this gym's own records. Records are never changed or deleted from here.">
          <FindingList findings={findings} />
        </SectionCard>
      )}
    </Guard>
  );
}

/* ------------------------------------------------------------- Alerts */

export function AlertsSection({ supabase, gym, tz, showResolved }: Ctx & { showResolved: boolean }) {
  return (
    <Guard title="Alerts" load={() => getAlerts(supabase, gym.id, showResolved)}>
      {(alerts) => (
        <SectionCard
          title="Operational alerts"
          description="Raised automatically every 15 minutes from live data, and cleared when the condition goes away."
          action={
            <div className="flex flex-wrap gap-2">
              <ButtonLink
                href={`/admin/gyms/${gym.id}/operations?section=alerts${showResolved ? "" : "&resolved=1"}`}
                variant="secondary" size="sm"
              >
                {showResolved ? "Hide resolved" : "Show resolved"}
              </ButtonLink>
              <RefreshAlertsButton organizationId={gym.id} />
            </div>
          }
        >
          {alerts.length ? (
            <div className="flex flex-col gap-2">
              {alerts.map((a) => (
                <div key={a.id} className={`flex flex-col gap-2 border-[1.5px] p-3.5 ${a.severity === "critical" && a.status !== "resolved" ? "border-accent" : "border-line"}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill tone={a.severity === "critical" ? "Down" : a.severity === "warning" ? "Attention" : "No data"}>{a.severity}</StatusPill>
                    <StatusPill tone={a.status === "open" ? "Attention" : "No data"}>{a.status}</StatusPill>
                    <strong className="text-[13px]">{a.title}</strong>
                    <span className="ml-auto text-[11px] text-mute3">{relativeTime(a.createdAt)}</span>
                  </div>
                  <p className="text-[12px] leading-relaxed text-ink2">{a.message}</p>
                  <p className="text-[10.5px] text-mute3">
                    Raised {exactTime(a.createdAt, tz)}
                    {a.acknowledgedAt ? ` · acknowledged by ${a.acknowledgedByEmail ?? "an admin"}` : ""}
                    {a.resolvedAt ? ` · resolved ${exactTime(a.resolvedAt, tz)}${a.resolvedByEmail ? ` by ${a.resolvedByEmail}` : " automatically"}` : ""}
                    {a.resolutionNote ? ` — ${a.resolutionNote}` : ""}
                  </p>
                  <div className="flex flex-wrap items-center gap-3">
                    <AlertControls organizationId={gym.id} alert={a} />
                    <Link href={alertTarget(a.type, gym.id)} className="text-[10.5px] font-bold uppercase tracking-[0.09em] text-accent hover:underline">
                      Open related records →
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyNote>No {showResolved ? "" : "open "}alerts for this gym.</EmptyNote>
          )}
        </SectionCard>
      )}
    </Guard>
  );
}

function alertTarget(type: string, id: string): string {
  const base = `/admin/gyms/${id}`;
  switch (type) {
    case "whatsapp":
      return `${base}/operations?section=whatsapp`;
    case "payment":
      return `${base}/operations?section=reconciliation`;
    case "webhook":
      return `${base}/operations?section=webhooks`;
    case "job":
      return `${base}/operations?section=jobs`;
    case "data":
      return `${base}/operations?section=health`;
    case "subscription":
      return `${base}/billing`;
    case "backup":
      return `/admin/system/disaster-recovery?org=${id}`;
    default:
      return `${base}/activity`;
  }
}

/* ------------------------------------------------------------- Access */

export function AccessSection({ supabase, gym, tz }: Ctx) {
  return (
    <Guard title="Access & security" load={() => getAccess(supabase, gym.id)}>
      {(access) => (
        <SectionCard
          title="Access & security"
          description="Identity facts come from authentication. No password, OTP secret, token or IP address is ever shown."
          action={<AccessControls organizationId={gym.id} gymName={gym.name} />}
        >
          {access.owner ? (
            <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
              <Tile label="Owner" value={<span className="text-[14px]">{access.owner.name || "—"}</span>} lines={[access.owner.accessStatus === "active" ? "Access active" : `Access ${access.owner.accessStatus}`]} />
              <Tile label="Email" value={<span className="break-all text-[13px]">{access.owner.email ?? "—"}</span>} lines={[access.owner.email ? access.owner.emailVerified ? "Verified" : "Not verified" : "Phone login"]} tone={!access.owner.email || access.owner.emailVerified ? "neutral" : "accent"} />
              <Tile label="Phone" value={<span className="text-[13px]">{access.owner.phone ?? "—"}</span>} lines={[access.owner.phone ? (access.owner.phoneVerified ? "Verified" : "Not verified in authentication") : "No phone on file"]} />
              <Tile
                label="Last login"
                value={<span className="text-[13px]">{access.owner.lastSignInAt ? relativeTime(access.owner.lastSignInAt) : "Never"}</span>}
                lines={[access.owner.lastSignInAt ? exactTime(access.owner.lastSignInAt, tz) : null, access.owner.loginMethod ? `Method: ${access.owner.loginMethod} (inferred)` : null]}
              />
            </div>
          ) : (
            <EmptyNote>This gym has no owner account yet. Resend the invitation from “More actions”.</EmptyNote>
          )}
          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            <Tile label="Owner sessions" value={n(access.ownerSessionCount)} lines={["Currently valid"]} />
            <Tile label="All gym sessions" value={n(access.orgSessions)} lines={[`${n(access.orgSessionUsers)} user(s)`]} />
            <Tile label="Team members" value={n(access.staffTotal)} lines={[`${n(access.staffDisabled)} disabled`]} />
            <Tile label="Last owner activity" value={<span className="text-[13px]">{access.owner?.lastActiveAt ? relativeTime(access.owner.lastActiveAt) : "None"}</span>} lines={[access.owner?.lastActiveAt ? exactTime(access.owner.lastActiveAt, tz) : null]} />
          </div>
          {access.ownerSessions.length ? (
            <div className="divide-y divide-line border-[1.5px] border-line">
              {access.ownerSessions.map((s) => (
                <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-[12px]">
                  <span className="min-w-0 truncate text-ink2">{s.device ?? "Unknown device"}</span>
                  <span className="text-mute3">Signed in {exactTime(s.startedAt, tz)}</span>
                </div>
              ))}
            </div>
          ) : null}
        </SectionCard>
      )}
    </Guard>
  );
}

/* ------------------------------------------------------------- Locks */

export function LocksSection({ supabase, gym, tz }: Ctx) {
  return (
    <Guard title="Restrictions" load={() => getLocks(supabase, gym.id)}>
      {(locks) => {
        const byType = new Map(locks.map((l) => [l.lockType, l]));
        return (
          <SectionCard
            title="Operation locks"
            description="Restrict part of a gym without suspending it. Locks are recorded and audited here; the gym app enforces them through organization_operation_locked()."
          >
            <div className="divide-y divide-line border-[1.5px] border-line bg-paper">
              {LOCK_CATALOG.map((entry) => {
                const state = byType.get(entry.type) ?? null;
                return (
                  <div key={entry.type} className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-3">
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <strong className="text-[13px]">{entry.label}</strong>
                        <StatusPill tone={state?.isActive ? "Down" : "Healthy"}>{state?.isActive ? "Active" : "Off"}</StatusPill>
                      </div>
                      <span className="text-[11.5px] text-mute">{entry.impact}</span>
                      {state ? (
                        <span className="text-[10.5px] text-mute3">
                          {state.isActive ? "Set" : "Last lifted"} {exactTime(state.updatedAt, tz)} by {state.updatedByEmail ?? "an admin"} — “{state.reason}”
                          {state.isActive && state.expiresAt ? ` · lifts automatically ${exactTime(state.expiresAt, tz)}` : ""}
                          {state.isEnabled && !state.isActive ? " · expired" : ""}
                        </span>
                      ) : null}
                    </div>
                    <LockRowControl organizationId={gym.id} gymName={gym.name} lockType={entry.type} state={state} />
                  </div>
                );
              })}
            </div>
            <p className="rounded-none border-[1.5px] border-line bg-sand/50 p-3 text-[11.5px] leading-relaxed text-mute">
              <strong className="text-ink2">Enforcement status:</strong> the lock is stored and readable by the gym app today, but the gym app itself must
              call <code className="font-mono text-[11px]">organization_operation_locked(org, type)</code> before each restricted action. Until that change ships
              there, a lock is a recorded, audited instruction — not yet a block. See docs/gym-command-center.md.
            </p>
            <span className="sr-only">{locks.map((l) => lockLabel(l.lockType)).join(", ")}</span>
          </SectionCard>
        );
      }}
    </Guard>
  );
}

/* ------------------------------------------------------------- Flags */

export function FlagsSection({ supabase, gym, tz }: Ctx) {
  return (
    <Guard title="Feature flags" load={() => getFeatureFlags(supabase, gym.id)}>
      {(flags) => (
        <SectionCard title="Feature flags" description="Turn selected features on or off for this gym only. Stored per organization and audited. The gym app reads them via organization_feature_enabled().">
          <div className="divide-y divide-line border-[1.5px] border-line bg-paper">
            {flags.map((f) => (
              <div key={f.flagKey} className="flex items-center justify-between gap-3 px-3.5 py-3">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <strong className="text-[13px]">{f.label}</strong>
                  <span className="text-[11.5px] text-mute">{f.description}</span>
                  <span className="text-[10.5px] text-mute3">
                    {f.overridden
                      ? `Set ${f.updatedAt ? exactTime(f.updatedAt, tz) : ""} by ${f.updatedByEmail ?? "an admin"}${f.reason ? ` — “${f.reason}”` : ""}`
                      : `Using the platform default (${f.defaultEnabled ? "on" : "off"})`}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <StatusPill tone={f.isEnabled ? "Healthy" : "No data"}>{f.isEnabled ? "Enabled" : "Disabled"}</StatusPill>
                  <FlagRowControl organizationId={gym.id} flag={f} />
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}
    </Guard>
  );
}

/* ------------------------------------------------------------- Data & recovery */

export function DataSection({ supabase, gym, tz }: Ctx) {
  return (
    <div className="flex flex-col gap-4">
      <Guard title="Recovery status" load={() => getOpsSummary(supabase, gym.id)}>
        {(summary) => {
          const last = summary.backup.lastSuccessAt;
          const hours = hoursSince(last);
          return (
            <SectionCard title="Backup & recovery" description="Backups cover the whole platform database, not one gym. Restore actions stay inside Recovery.">
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                <Tile label="Latest successful backup" value={<span className="text-[14px]">{last ? relativeTime(last) : "None found"}</span>} lines={[last ? exactTime(last, tz) : null]} />
                <Tile label="Backup health" pill={{ text: hours === null ? "No backup" : hours > 26 ? "Stale" : hours > 12 ? "Late" : "On schedule", tone: hours === null || hours > 26 ? "Down" : hours > 12 ? "Attention" : "Healthy" }} />
                <ButtonLink href={`/admin/system/disaster-recovery?org=${gym.id}`} variant="primary" size="lg">
                  <DatabaseIcon size={14} aria-hidden />
                  Open Recovery
                </ButtonLink>
              </div>
            </SectionCard>
          );
        }}
      </Guard>
      <SectionCard title="Export this gym's data" description="Synchronous CSV export, capped at 20,000 rows per dataset. Every export is logged with your reason.">
        <ExportPanel organizationId={gym.id} />
      </SectionCard>
    </div>
  );
}

/* ------------------------------------------------------------- Danger zone */

export function DangerSection({ supabase, gym }: Ctx) {
  return (
    <Guard title="Danger zone" load={() => getLocks(supabase, gym.id)}>
      {(locks) => (
        <SectionCard title="Danger zone" description="Every action here explains its impact, needs a reason and explicit confirmation, and is audited. Permanent deletion is not offered.">
          <DangerZone
            organizationId={gym.id}
            gymName={gym.name}
            suspended={gym.status === "Suspended"}
            activeLocks={locks.filter((l) => l.isActive).map((l) => l.lockType)}
          />
        </SectionCard>
      )}
    </Guard>
  );
}
