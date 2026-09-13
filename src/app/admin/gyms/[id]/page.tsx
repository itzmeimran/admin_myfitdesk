import { notFound } from "next/navigation";
import { createClient } from "@/core/db/server-client";
import { getGymDetail } from "@/features/gyms/detail";
import { getMemberExpirySnapshot } from "@/features/gyms/members";
import { getGymConfiguration } from "@/features/gyms/config";
import { UsageBar } from "@/components/UsageBar";
import { formatMinorWhole } from "@/core/money/format";
import { formatShortDate, daysBetween } from "@/core/dates/format";
import { capitalizeBillingPeriod } from "@/core/text/billing-period";
import { AlertIcon } from "@/core/ui/icons";

/**
 * Overview tab — matches the Claude Design "MyFitDesk Gym Detail" canvas's
 * Overview section: usage vs caps, an activity snapshot, the gym's own
 * revenue, its profile, membership plans and integrations, and reminder
 * settings. Two sections in the design (the gym's own monthly revenue
 * rollup, and the list of membership plans it sells with a member-share
 * breakdown) have no admin-readable data source in this schema today — no
 * RPC reads the tenant `payments` or `membership_plans` tables for an
 * admin — so those sections say so plainly rather than fabricating numbers,
 * the same honest-scope call this app made for the old Entitlements tab.
 */
export default async function GymOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [gym, snapshot, config] = await Promise.all([
    getGymDetail(supabase, id),
    getMemberExpirySnapshot(supabase, id),
    getGymConfiguration(supabase, id),
  ]);
  if (!gym) notFound();

  const now = new Date();
  const sub = gym.subscription;
  const isTrialing = gym.status === "Trialing";

  const usage = [
    { label: "Members", used: gym.usage.memberCount, cap: gym.usage.memberCap },
    { label: "Branches", used: gym.usage.branchCount, cap: gym.usage.branchCap },
    { label: "Staff", used: gym.usage.staffCount, cap: gym.usage.staffCap },
  ];
  const nearCap = usage.some((u) => u.cap !== null && u.cap > 0 && u.used / u.cap >= 0.9);

  const tiles = [
    { label: "Total members", value: gym.usage.memberCount },
    { label: "Active memberships", value: snapshot.activeMembershipCount },
    { label: "Expiring in 7 days", value: snapshot.expiringSoonCount, accent: true },
    { label: "Expired", value: snapshot.expiredCount },
  ];

  const profile = [
    { label: "Contact phone", value: gym.contactPhone ?? "—" },
    { label: "Contact email", value: gym.contactEmail ?? "—" },
    { label: "Street address", value: gym.addressLine ?? "—" },
    { label: "City", value: gym.city ?? "—" },
    { label: "State", value: gym.state ?? "—" },
    { label: "Country", value: gym.country ?? "—" },
    { label: "PIN code", value: gym.postalCode ?? "—" },
    { label: "Opens at", value: gym.opensAt ?? "—" },
    { label: "Closes at", value: gym.closesAt ?? "—" },
    { label: "Timezone", value: gym.defaultTimezone },
    { label: "Currency", value: gym.defaultCurrency },
    { label: "Week starts on", value: gym.weekStart },
    { label: "Membership grace period", value: `${gym.gracePeriodDays} days` },
    { label: "Gym record id", value: gym.id },
  ];

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <h2 className="mfd-micro-label">Plan usage vs limits</h2>
          <span className="text-[11.5px] text-mute3">
            {gym.subscription?.packageName ?? "No package"} · caps enforced at the gym&apos;s next write
          </span>
          {nearCap ? (
            <span className="ml-auto inline-flex items-center gap-1.5 bg-accent px-2 py-1 text-[9.5px] font-bold uppercase tracking-[0.1em] text-paper">
              <AlertIcon size={11} aria-hidden />
              Near cap
            </span>
          ) : null}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {usage.map((u) => {
            const flagged = u.cap !== null && u.cap > 0 && u.used / u.cap >= 0.9;
            return (
              <div
                key={u.label}
                className={`flex flex-col gap-2 border-[1.5px] bg-paper p-3.5 ${flagged ? "border-accent" : "border-line"}`}
              >
                <UsageBar label={u.label} used={u.used} cap={u.cap} />
              </div>
            );
          })}
        </div>
      </section>

      <section className="flex flex-col gap-2.5">
        <h2 className="mfd-micro-label">Gym activity snapshot</h2>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {tiles.map((t) => (
            <div key={t.label} className="flex flex-col gap-1 border-[1.5px] border-line bg-paper p-3.5">
              <span className="text-[10.5px] font-bold uppercase tracking-[0.11em] text-mute3">{t.label}</span>
              <span className={`font-display text-[24px] tracking-[-0.03em] ${t.accent ? "text-accent" : "text-ink"}`}>
                {t.value.toLocaleString("en-IN")}
              </span>
            </div>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
        <section className="flex flex-col gap-2.5 border-[1.5px] border-ink bg-paper p-4">
          <div className="flex flex-col gap-0.5">
            <h2 className="mfd-micro-label">The gym&apos;s own revenue</h2>
            <span className="text-[11.5px] text-mute3">What members pay this gym — not what it pays MyFitDesk</span>
          </div>
          <p className="border-t border-line pt-3 text-[11.5px] leading-relaxed text-mute">
            Not available yet — no admin read of this gym&apos;s own <code className="text-[10.5px]">payments</code>{" "}
            table exists in this schema today. What this gym pays <em>MyFitDesk</em> is on the Subscription &amp;
            Billing tab.
          </p>
        </section>

        <section className="flex flex-col gap-2.5 border-[1.5px] border-line bg-paper p-4">
          <h2 className="mfd-micro-label">Gym profile</h2>
          <div className="grid grid-cols-1 gap-x-4 gap-y-0 sm:grid-cols-2">
            {profile.map((p) => (
              <div key={p.label} className="flex flex-col gap-0.5 border-b border-line py-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.11em] text-mute3">{p.label}</span>
                <span className="break-words text-[12.5px] text-ink">{p.value}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="flex flex-col gap-2.5 border-[1.5px] border-line bg-paper p-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <h2 className="mfd-micro-label">Membership plans this gym sells</h2>
        </div>
        <p className="text-[11.5px] leading-relaxed text-mute">
          Not available yet — no admin read of this gym&apos;s own <code className="text-[10.5px]">membership_plans</code>{" "}
          table (with a member-share breakdown) exists in this schema today.
        </p>
      </section>

      <section className="flex flex-col gap-2.5">
        <h2 className="mfd-micro-label">Integrations</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <IntegrationCard
            title="WhatsApp Business"
            connected={!!config.whatsapp}
            status={config.whatsapp?.status ?? "Not connected"}
            lastError={config.whatsapp?.lastError}
          />
          <IntegrationCard
            title="Payment gateway"
            connected={!!config.payment}
            status={config.payment?.status ?? "Not connected"}
            lastError={config.payment?.lastError}
          />
        </div>
      </section>

      <section className="flex flex-col gap-2.5 border-[1.5px] border-line bg-paper p-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <h2 className="mfd-micro-label">Reminder settings</h2>
          <span className="ml-auto text-[11px] text-mute3">Owner-controlled · read-only here</span>
        </div>
        {config.notifications ? (
          <div className="grid grid-cols-1 gap-x-4 gap-y-0 sm:grid-cols-2">
            <ReminderRow label="Renewal reminders" value={config.notifications.renewalRemindersEnabled ? "On" : "Off"} />
            <ReminderRow label="Payment reminders" value={config.notifications.paymentRemindersEnabled ? "On" : "Off"} />
            <ReminderRow label="Weekly owner digest" value={config.notifications.weeklyDigestEnabled ? "On" : "Off"} />
            <ReminderRow label="Default channel" value={config.notifications.defaultChannel} />
            <ReminderRow label="Last reminder run" value="Not tracked" muted />
            <ReminderRow label="Failures in last run" value="Not tracked" muted />
          </div>
        ) : (
          <p className="text-[12px] text-mute">Default configuration — the owner hasn&apos;t changed reminder settings.</p>
        )}
      </section>

      <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
        <section className="flex flex-col gap-3 border-[1.5px] border-line bg-paper p-4">
          <h2 className="mfd-micro-label">Subscription</h2>
          {sub ? (
            <dl className="flex flex-col gap-2 text-[12.5px]">
              <Row k="Plan" v={sub.packageName ?? "No package"} />
              <Row
                k="Price"
                v={sub.priceMinor !== null ? formatMinorWhole(sub.priceMinor, sub.currency ?? "INR") : "—"}
              />
              <Row k="Billing cycle" v={capitalizeBillingPeriod(sub.billingPeriod)} />
              <Row k="Status" v={gym.status} />
              <Row k="Auto-renew" v={sub.autoRenew ? "On" : "Off"} />
              <Row
                k="Current period"
                v={
                  sub.currentPeriodStart && sub.currentPeriodEnd
                    ? `${formatShortDate(new Date(sub.currentPeriodStart), now)} – ${formatShortDate(new Date(sub.currentPeriodEnd), now)}`
                    : "—"
                }
              />
              <Row k="Renewal date" v={sub.currentPeriodEnd ? formatShortDate(new Date(sub.currentPeriodEnd), now) : "—"} />
              {sub.cancelledAt ? <Row k="Cancelled" v={formatShortDate(new Date(sub.cancelledAt), now)} /> : null}
              {isTrialing && sub.currentPeriodEnd ? (
                <Row k="Trial ends in" v={`${Math.max(daysBetween(now, new Date(sub.currentPeriodEnd)), 0)} days`} />
              ) : null}
            </dl>
          ) : (
            <p className="text-[12.5px] text-mute">This gym has no subscription record.</p>
          )}
        </section>

        <section className="flex flex-col gap-3 border-[1.5px] border-line bg-paper p-4">
          <h2 className="mfd-micro-label">Account</h2>
          <dl className="flex flex-col gap-2 text-[12.5px]">
            <Row k="Created" v={formatShortDate(new Date(gym.createdAt), now)} />
            <Row k="Last updated" v={formatShortDate(new Date(gym.updatedAt), now)} />
            <Row k="Lifetime paid to MyFitDesk" v={formatMinorWhole(gym.lifetimePaidMinor, gym.defaultCurrency)} />
            {gym.suspendedAt ? (
              <>
                <Row k="Suspended" v={formatShortDate(new Date(gym.suspendedAt), now)} />
                {gym.suspensionReason ? <Row k="Reason" v={gym.suspensionReason} /> : null}
              </>
            ) : null}
          </dl>
        </section>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line pb-1.5">
      <dt className="text-mute">{k}</dt>
      <dd className="text-right font-bold text-ink">{v}</dd>
    </div>
  );
}

function ReminderRow({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line py-2 text-[12.5px]">
      <span className="text-ink2">{label}</span>
      <span
        className={`px-[7px] py-[4px] text-[9.5px] font-bold uppercase tracking-[0.1em] ${
          muted ? "bg-sand text-mute3" : "bg-sand text-ink"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function IntegrationCard({
  title,
  connected,
  status,
  lastError,
}: {
  title: string;
  connected: boolean;
  status: string;
  lastError?: string | null;
}) {
  return (
    <div className="flex flex-col gap-2.5 border-[1.5px] border-line bg-paper p-3.5">
      <div className="flex items-center gap-2">
        <span className="text-[13.5px] font-bold">{title}</span>
        <span
          className={`ml-auto px-[7px] py-[4px] text-[9.5px] font-bold uppercase tracking-[0.1em] ${
            connected ? "bg-sand text-ink" : "bg-sand text-mute3"
          }`}
        >
          {connected ? "Connected" : "Not connected"}
        </span>
      </div>
      <div className="flex flex-col gap-1.5 border-t border-line pt-2.5 text-[12.5px]">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-mute3">Status</span>
          <span className="font-bold capitalize">{status}</span>
        </div>
        {lastError ? (
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-mute3">Last error</span>
            <span className="text-right text-accent">{lastError}</span>
          </div>
        ) : null}
      </div>
      <p className="text-[10.5px] text-mute3">
        Connection status only — this app never fetches keys, tokens or webhook secrets.
      </p>
    </div>
  );
}
