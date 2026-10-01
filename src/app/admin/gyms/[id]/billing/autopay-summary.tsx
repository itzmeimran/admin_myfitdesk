import { createClient } from "@/core/db/server-client";
import { formatMinorWhole } from "@/core/money/format";

/** Same admin session and active DEV/PROD database as the rest of this tab.
 * Existing platform-admin SELECT policy remains the authorization boundary. */
export async function AutoPaySummary({ organizationId }: { organizationId: string }) {
  const client = await createClient();
  const { data: row, error } = await client.from("organization_subscriptions")
    .select("auto_renew, recurring_status, recurring_environment, next_billing_at, last_successful_payment_at, last_failed_payment_at, recurring_payment_method, cancel_at_period_end, provider_subscription_id, renewal_price_minor, renewal_currency, renewal_price_effective_at, renewal_price_status, renewal_price_error")
    .eq("organization_id", organizationId).maybeSingle();
  if (error) return <p className="border-[1.5px] border-line p-3 text-[12px] text-mute">AutoPay status unavailable. Apply the shared AutoPay migration to the selected environment first.</p>;
  if (!row) return null;
  const date = (iso: string | null) => iso ? new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" }).format(new Date(iso)) : "—";
  const status = row.cancel_at_period_end ? "Cancellation scheduled" : row.recurring_status ?? "No mandate";
  const details = [
    ["AutoPay", row.renewal_price_status === "pending_cancel" ? "Stopping previous mandate" : row.renewal_price_status === "review_required" ? "Requires reconciliation" : row.renewal_price_status ? "Authorization required" : row.auto_renew ? "Enabled" : "Disabled"], ["Razorpay status", status],
    ["Environment", row.recurring_environment ?? "—"], ["Next billing", date(row.next_billing_at)],
    ["Last successful charge", date(row.last_successful_payment_at)], ["Last failed charge", date(row.last_failed_payment_at)],
    ["Payment method", row.recurring_payment_method ?? "—"], ["Subscription reference", row.provider_subscription_id ?? "—"],
    ["Price change", row.renewal_price_status ?? "None"],
    ["Updated renewal price", row.renewal_price_minor !== null ? formatMinorWhole(row.renewal_price_minor, row.renewal_currency ?? "INR") : "—"],
    ["Effective renewal", date(row.renewal_price_effective_at)],
  ];
  return <section className="flex flex-col gap-3 border-2 border-ink bg-paper p-4">
    <h2 className="mfd-micro-label">MyFitDesk AutoPay</h2>
    {row.renewal_price_error ? <p className="border-[1.5px] border-accent p-3 text-[12px] text-accent">{row.renewal_price_error}</p> : null}
    <dl className="grid gap-3 text-[12px] sm:grid-cols-3">{details.map(([label, value]) => <div key={label}><dt className="text-mute">{label}</dt><dd className="break-all font-bold">{value}</dd></div>)}</dl>
  </section>;
}
