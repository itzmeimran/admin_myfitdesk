import { notFound } from "next/navigation";
import { createClient } from "@/core/db/server-client";
import { getGymDetail } from "@/features/gyms/detail";
import { UsageBar } from "@/components/UsageBar";
import { formatMinorWhole } from "@/core/money/format";
import { formatShortDate, daysBetween } from "@/core/dates/format";
import { capitalizeBillingPeriod } from "@/core/text/billing-period";

/**
 * Overview tab (task brief §3) — usage vs caps, current subscription,
 * price, renewal date, account creation date, account status, trial
 * details. Deliberately NOT a copy of the gym owner's own dashboard (the
 * brief's explicit instruction): no day-to-day operational widgets
 * (today's check-ins, recent payments feed, etc.) — this is the
 * tenant-summary a platform admin needs, not the gym's own home screen.
 */
export default async function GymOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const gym = await getGymDetail(supabase, id);
  if (!gym) notFound();

  const now = new Date();
  const sub = gym.subscription;
  const isTrialing = gym.status === "Trialing";

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-3 border-[1.5px] border-line bg-paper p-4">
        <h2 className="mfd-micro-label">Usage vs plan caps</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <UsageBar label="Members" used={gym.usage.memberCount} cap={gym.usage.memberCap} />
          <UsageBar label="Branches" used={gym.usage.branchCount} cap={gym.usage.branchCap} />
          <UsageBar label="Staff" used={gym.usage.staffCount} cap={gym.usage.staffCap} />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
            <Row k="Lifetime paid" v={formatMinorWhole(gym.lifetimePaidMinor, gym.defaultCurrency)} />
            <Row k="Timezone" v={gym.defaultTimezone} />
            <Row k="Currency" v={gym.defaultCurrency} />
            {gym.deletionRequestedAt ? (
              <Row k="Deletion requested" v={formatShortDate(new Date(gym.deletionRequestedAt), now)} />
            ) : null}
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
