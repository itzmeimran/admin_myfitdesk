import type { GymDetail } from "@/features/gyms/detail";
import type { GymOverview } from "@/features/gyms/overview";
import type { OpsSummary, WebhookProvider } from "@/features/gyms/ops/types";
import { lockLabel } from "@/features/gyms/ops/types";
import { relativeTime } from "@/features/gyms/ops/timeline-format";
import { formatMinorWhole } from "@/core/money/format";
import { daysBetween } from "@/core/dates/format";
import { capitalizeBillingPeriod } from "@/core/text/billing-period";
import { SectionCard, StatusPill, Tile, whenText, type OpsTone } from "./ops-ui";
import { ReadOnlyIcon } from "@/core/ui/icons";

/**
 * Compact operational summary shown at the top of the Overview tab. Every
 * figure is computed by a curated admin RPC from live tables; anything that
 * cannot be measured says "Not available" or "Not tracked" — there is no
 * blended "health score", only plain per-area statuses.
 */
export function CommandCenter({
  gym,
  summary,
  overview,
}: {
  gym: GymDetail;
  summary: OpsSummary;
  overview: GymOverview | null;
}) {
  const tz = gym.defaultTimezone || "Asia/Kolkata";
  const currency = gym.defaultCurrency || "INR";
  const base = `/admin/gyms/${gym.id}/operations`;
  const now = new Date();

  const sub = gym.subscription;
  const expiry = sub?.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : null;
  const days = expiry ? daysBetween(now, expiry) : null;

  const readOnlyLock = summary.locks.find((l) => l.lockType === "read_only");
  const account = summary.suspendedAt
    ? { text: "Suspended", tone: "Suspended" }
    : readOnlyLock
      ? { text: "Read-only", tone: "Read-only" }
      : summary.locks.length
        ? { text: "Locked", tone: "Attention" }
        : gym.status === "Trialing"
          ? { text: "Trial", tone: "Trialing" }
          : { text: gym.status, tone: gym.status };

  const wa = summary.whatsapp;
  const webhookWorst = worstWebhook(summary.webhooks);
  const jobsText =
    summary.jobs.tracked === 0
      ? "Nothing to monitor"
      : summary.jobs.failed > 0
        ? `${summary.jobs.failed} failed`
        : summary.jobs.degraded > 0
          ? `${summary.jobs.degraded} degraded`
          : "Healthy";
  const jobsTone: OpsTone = summary.jobs.failed > 0 ? "Down" : summary.jobs.degraded > 0 ? "Attention" : summary.jobs.tracked === 0 ? "No data" : "Healthy";

  const backupAge = summary.backup.lastSuccessAt ? (now.getTime() - new Date(summary.backup.lastSuccessAt).getTime()) / 3_600_000 : null;
  const backupTone: OpsTone = backupAge === null ? "No data" : backupAge > 26 ? "Down" : backupAge > 12 ? "Attention" : "Healthy";

  const paymentIssues = summary.payments.reconciliationIssues + summary.payments.failed30d;

  return (
    <SectionCard
      title="Command center"
      description="Live operational status for this gym. Backup status is platform-wide, not per gym."
      id="command-center"
    >
      {summary.locks.length ? (
        <div className="flex flex-wrap items-center gap-2 border-[1.5px] border-accent bg-accent/8 px-3 py-2 text-[12px] text-accent">
          <ReadOnlyIcon size={14} aria-hidden />
          <strong>Restrictions active:</strong>
          <span className="text-ink2">
            {summary.locks.map((l) => lockLabel(l.lockType)).join(" · ")}
          </span>
          <a href={`${base}?section=locks`} className="ml-auto font-bold underline underline-offset-2">
            Manage
          </a>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-3 xl:grid-cols-5">
        <Tile label="Account" pill={{ text: account.text, tone: account.tone }} lines={[`Gym ID ${gym.gymCode}`]} />

        <Tile
          label="Subscription"
          value={sub?.packageName ?? (gym.status === "Trialing" ? "Trial" : "No package")}
          lines={[
            sub ? `${sub.priceMinor === null ? "Trial" : "Paid"} · ${capitalizeBillingPeriod(sub.billingPeriod)}` : "No subscription record",
            expiry
              ? `Expires ${new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: tz }).format(expiry)}${
                  days === null ? "" : ` · ${days < 0 ? `${Math.abs(days)} days overdue` : `${days} days left`}`
                }`
              : null,
          ]}
          tone={days !== null && days < 0 ? "accent" : "neutral"}
        />

        <Tile
          label="Owner activity"
          value={summary.owner?.lastSignInAt ? relativeTime(summary.owner.lastSignInAt) : "Never signed in"}
          lines={[
            summary.owner?.lastSignInAt ? `Last login ${whenText(summary.owner.lastSignInAt, tz)}` : null,
            summary.owner?.lastActiveAt ? `Last activity ${whenText(summary.owner.lastActiveAt, tz)}` : "No activity recorded",
          ]}
          href={`${base}?section=access`}
        />

        <Tile
          label="WhatsApp"
          value={`${wa.balance.toLocaleString("en-IN")} credits`}
          tone={wa.paused || wa.balance === 0 || (wa.failureRate ?? 0) >= 25 ? "accent" : "neutral"}
          lines={[
            wa.paused ? "Sending paused by admin" : null,
            `${wa.sent30d.toLocaleString("en-IN")} sent · ${wa.delivered30d.toLocaleString("en-IN")} delivered · ${wa.failed30d.toLocaleString("en-IN")} failed (30d)`,
            wa.failureRate === null ? "No sends to measure" : `${wa.failureRate}% failure rate`,
            wa.lastSuccessAt ? `Last success ${relativeTime(wa.lastSuccessAt)}` : "No successful message yet",
          ]}
          href={`${base}?section=whatsapp`}
        />

        <Tile
          label="Payments"
          value={overview ? formatMinorWhole(overview.gymRevenue.monthMinor, currency) : "Not available"}
          tone={summary.payments.reconciliationCritical > 0 ? "accent" : "neutral"}
          lines={[
            overview ? `${formatMinorWhole(overview.gymRevenue.todayMinor, currency)} today` : null,
            overview?.gymRevenue.lastPaymentAt ? `Last payment ${relativeTime(overview.gymRevenue.lastPaymentAt)}` : "No payments yet",
            paymentIssues > 0
              ? `${summary.payments.reconciliationIssues} reconciliation issue(s), ${summary.payments.failed30d} failed checkout(s)`
              : "No failed or mismatched payments",
          ]}
          href={`${base}?section=reconciliation`}
        />

        <Tile label="Background jobs" pill={{ text: jobsText, tone: jobsTone }} lines={[`${summary.jobs.tracked} monitored`]} href={`${base}?section=jobs`} />

        <div className="flex min-w-0 flex-col gap-1.5 border-[1.5px] border-line bg-paper p-3">
          <span className="text-[9.5px] font-bold uppercase tracking-[0.11em] text-mute3">Webhooks</span>
          <div className="flex flex-col gap-1">
            {summary.webhooks.map((w) => (
              <a key={w.provider} href={`${base}?section=webhooks`} className="flex items-center justify-between gap-2 text-[11px] hover:underline">
                <span className="text-ink2">{w.label}</span>
                <StatusPill tone={webhookTone(w.status)}>{webhookText(w.status)}</StatusPill>
              </a>
            ))}
          </div>
          {webhookWorst ? <span className="text-[10.5px] leading-snug text-mute">{webhookWorst}</span> : null}
        </div>

        <Tile
          label="Backup"
          pill={{ text: backupAge === null ? "No backup found" : relativeTime(summary.backup.lastSuccessAt as string), tone: backupTone }}
          lines={[backupAge !== null && backupAge > 12 ? "Older than expected — check Recovery" : "Latest successful backup (platform)"]}
          href={`/admin/system/disaster-recovery?org=${gym.id}`}
        />

        <Tile
          label="Open alerts"
          value={summary.alerts.open.toLocaleString("en-IN")}
          tone={summary.alerts.critical > 0 ? "accent" : "neutral"}
          lines={[
            summary.alerts.open === 0 ? "Nothing unresolved" : `${summary.alerts.unacknowledged} not yet acknowledged`,
            summary.dataHealth.issues > 0 ? `${summary.dataHealth.issues} data-health check(s) failing` : null,
          ]}
          href={`${base}?section=alerts`}
        />
      </div>
    </SectionCard>
  );
}

function webhookTone(status: WebhookProvider["status"]): OpsTone {
  if (status === "healthy") return "Healthy";
  if (status === "failed") return "Down";
  if (status === "warning") return "Attention";
  return "No data";
}

function webhookText(status: WebhookProvider["status"]): string {
  return (
    {
      healthy: "Healthy",
      failed: "Failed",
      warning: "Warning",
      no_events: "No events",
      not_configured: "Not set up",
      not_tracked: "Not tracked",
    } as const
  )[status];
}

function worstWebhook(webhooks: WebhookProvider[]): string | null {
  const bad = webhooks.find((w) => w.status === "failed") ?? webhooks.find((w) => w.status === "warning");
  return bad?.lastError ?? null;
}
