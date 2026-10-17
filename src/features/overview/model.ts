import { DAY_MS, IST_TIME_ZONE, istDateKey, istDayDifference, istPeriodRange } from "@/core/dates/ist";
import { EXPIRY_WARNING_DAYS } from "@/features/gyms/subscription-rules";

export type OverviewPeriod = "month" | "quarter" | "year";
export type OverviewGym = { organization_id: string; name: string; state: string; member_count: number; branch_count: number; member_cap: number | null; branch_cap: number | null; created_at: string };
export type OverviewSubscription = { organization_id: string; package_id: string | null; status: string; current_period_start: string | null; current_period_end: string; grace_days: number };
export type OverviewPackage = { id: string; plan_id: string | null; name: string; price_minor: number; currency: string; duration_days: number };
export type OverviewPayment = { id: string; organization_id: string; package_id: string | null; amount_minor: number; currency: string; status: string; paid_at: string | null; created_at: string; period_start: string | null; period_end: string | null; refunded_minor: string | number | null; pricing_review_required: boolean };
export type FollowUp = { id: string; organizationId: string; gym: string; reason: string; date: string; timing: string; href: string; action: string; priority: number };
export type CapacityRow = { id: string; organizationId: string; gym: string; detail: string; over: boolean };
export type PlanRow = { id: string; name: string; gyms: number; mrrMinor: number | null; currency: string; unavailable: number };
export type CollectionBucket = { key: string; label: string; from: string; to: string; amountMinor: number };
export type WebhookTelemetry = { total: number; signatureFailures: number; processingFailures: number };
export type OverviewData = {
  asOf: string; period: OverviewPeriod; periodLabel: string; rangeStart: string; rangeEnd: string; grouping: "daily" | "weekly" | "monthly";
  totalGyms: number; payingGyms: number; members: number; branches: number;
  mrrMinor: number | null; mrrCurrency: string; missingPrices: number; mrrNote: string;
  plans: PlanRow[]; followUps: FollowUp[]; capacity: CapacityRow[];
  recentGyms: { id: string; name: string; status: string; joinedAt: string }[]; recentCount: number;
  collections: { grossMinor: number | null; refundsMinor: number | null; netMinor: number | null; currency: string; paymentCount: number; buckets: CollectionBucket[]; error: boolean };
  monitoring: { webhooks: WebhookTelemetry | null; stuckOrders: number | null; recentFailedGyms: number | null };
  notices: string[];
};

const timestamp = (value: string | null) => value ? Date.parse(value) : NaN;
const money = (value: number) => Number.isSafeInteger(value) && value >= 0;

/** Match actual calendar months, including month-end and leap-year periods.
 * Day-based contracts use an average Gregorian month, never a 30/365 year. */
export function normalizeMonthly(amountMinor: number, start: string | null, end: string | null): number | null {
  const from = new Date(start ?? ""), to = new Date(end ?? "");
  if (!money(amountMinor) || !Number.isFinite(+from) || !Number.isFinite(+to) || to <= from) return null;
  const [fromYear, fromMonth, fromDay] = istDateKey(from).split("-").map(Number);
  const [toYear, toMonth, toDay] = istDateKey(to).split("-").map(Number);
  const months = (toYear - fromYear) * 12 + toMonth - fromMonth;
  if (months > 0) {
    const finalDay = new Date(Date.UTC(toYear, toMonth, 0)).getUTCDate();
    const sameClock = Math.abs((+from % DAY_MS) - (+to % DAY_MS)) < 1000;
    if (toDay === Math.min(fromDay, finalDay) && sameClock) return Math.round(amountMinor / months);
  }
  const result = Math.round(amountMinor * (365.2425 / 12) / ((+to - +from) / DAY_MS));
  return money(result) ? result : null;
}

export function recordedRefund(payment: OverviewPayment): number | null {
  if (payment.refunded_minor !== null && payment.refunded_minor !== undefined) {
    const amount = Number(payment.refunded_minor);
    return money(amount) && amount <= payment.amount_minor && !(payment.status === "refunded" && amount === 0) ? amount : null;
  }
  return payment.status === "refunded" ? payment.amount_minor : 0;
}

export function currentPrice(subscription: OverviewSubscription, payments: OverviewPayment[]): { amountMinor: number; currency: string } | null {
  if (!subscription.package_id || !subscription.current_period_start) return null;
  const matches = payments.filter(payment => payment.organization_id === subscription.organization_id && payment.package_id === subscription.package_id
    && ["succeeded", "refunded"].includes(payment.status) && payment.pricing_review_required === false
    && timestamp(payment.period_start) === timestamp(subscription.current_period_start) && timestamp(payment.period_end) === timestamp(subscription.current_period_end));
  // Multiple receipts might be installments, duplicates or adjustments. There
  // is no reliable contract-price snapshot to resolve those cases here.
  if (matches.length !== 1 || matches[0].status !== "succeeded" || recordedRefund(matches[0]) !== 0) return null;
  const payment = matches[0];
  const amountMinor = normalizeMonthly(payment.amount_minor, payment.period_start, payment.period_end);
  return amountMinor === null || !payment.currency ? null : { amountMinor, currency: payment.currency };
}

export function collectionBuckets(payments: OverviewPayment[], period: OverviewPeriod, now: Date): CollectionBucket[] {
  const { start, end } = istPeriodRange(period, now);
  const through = Math.min(+end, +now + 1);
  const buckets: CollectionBucket[] = [];
  for (let cursor = +start; cursor < through;) {
    const date = new Date(cursor);
    const next = period === "year" ? Date.parse(`${istDateKey(date).slice(0, 7)}-01T00:00:00+05:30`) + 32 * DAY_MS : cursor + (period === "month" ? 1 : 7) * DAY_MS;
    const nextBoundary = period === "year" ? Date.parse(`${istDateKey(new Date(next)).slice(0, 7)}-01T00:00:00+05:30`) : next;
    const to = Math.min(nextBoundary, through);
    buckets.push({ key: istDateKey(date), from: date.toISOString(), to: new Date(to).toISOString(), label: new Intl.DateTimeFormat("en-IN", { timeZone: IST_TIME_ZONE, ...(period === "year" ? { month: "short" } : { day: "numeric", month: "short" }) }).format(date), amountMinor: 0 });
    cursor = to;
  }
  for (const payment of payments) {
    const paidAt = timestamp(payment.paid_at);
    const bucket = buckets.find(row => paidAt >= timestamp(row.from) && paidAt < timestamp(row.to));
    if (bucket) bucket.amountMinor += payment.amount_minor;
  }
  return buckets;
}

function dueTiming(date: string, now: Date) {
  const days = istDayDifference(now, new Date(date));
  return timestamp(date) <= +now ? days === 0 ? "Overdue today" : `${Math.abs(days)} ${Math.abs(days) === 1 ? "day" : "days"} overdue` : days === 0 ? "Ends today" : `${days} ${days === 1 ? "day" : "days"} left`;
}

export function buildFollowUps(gyms: OverviewGym[], subscriptions: OverviewSubscription[], attempts: OverviewPayment[], now: Date): FollowUp[] {
  const rows: FollowUp[] = [];
  const warningEnd = Date.parse(`${istDateKey(now)}T00:00:00+05:30`) + (EXPIRY_WARNING_DAYS + 1) * DAY_MS;
  for (const gym of gyms) {
    const sub = subscriptions.find(row => row.organization_id === gym.organization_id);
    if (!sub || gym.state === "suspended") continue;
    const trial = sub.status === "trialing";
    const expired = timestamp(sub.current_period_end) <= +now;
    let reason: string | null = null, priority = 0;
    if (gym.state === "read_only") { reason = "Read-only access · subscription overdue"; priority = 0; }
    else if (gym.state === "grace") { reason = "Grace period · payment overdue"; priority = 1; }
    else if (expired && sub.status !== "cancelled") { reason = "Subscription overdue"; priority = 2; }
    else if (trial && !expired && timestamp(sub.current_period_end) < warningEnd) { reason = "Trial ending soon"; priority = 4; }
    if (reason && Number.isFinite(timestamp(sub.current_period_end))) rows.push({ id: `${gym.organization_id}:subscription`, organizationId: gym.organization_id, gym: gym.name, reason, date: sub.current_period_end, timing: dueTiming(sub.current_period_end, now), href: `/admin/gyms/${gym.organization_id}/billing`, action: trial ? "Review trial" : "Review subscription", priority });
  }
  // One unresolved latest charge issue per gym. A later successful payment
  // closes earlier failures; multiple retries do not become duplicate rows.
  const latest = new Map<string, OverviewPayment>();
  const attemptTime = (payment: OverviewPayment) => timestamp(payment.status === "succeeded" || payment.status === "refunded" ? payment.paid_at ?? payment.created_at : payment.created_at);
  for (const attempt of attempts) {
    if (!attempt.package_id || !["failed", "succeeded", "refunded"].includes(attempt.status)) continue;
    if (!Number.isFinite(attemptTime(attempt)) || attemptTime(attempt) > +now) continue;
    const old = latest.get(attempt.organization_id);
    if (!old || attemptTime(attempt) > attemptTime(old) || (attemptTime(attempt) === attemptTime(old) && attempt.id > old.id)) latest.set(attempt.organization_id, attempt);
  }
  for (const payment of latest.values()) {
    const gym = gyms.find(row => row.organization_id === payment.organization_id);
    if (!gym || payment.status !== "failed") continue;
    rows.push({ id: `${gym.organization_id}:charge`, organizationId: gym.organization_id, gym: gym.name, reason: "Latest payment attempt failed", date: payment.created_at, timing: `${Math.max(0, istDayDifference(new Date(payment.created_at), now))} days ago`, href: `/admin/gyms/${gym.organization_id}/billing?status=failed`, action: "Review failed payment", priority: 3 });
  }
  return rows.sort((a, b) => a.priority - b.priority || timestamp(a.date) - timestamp(b.date) || a.id.localeCompare(b.id));
}

export function buildOverview({ gyms, subscriptions, packages, currentPayments, periodPayments, attempts, stuckOrders, webhooks, period, now, notices = [] }: {
  gyms: OverviewGym[]; subscriptions: OverviewSubscription[]; packages: OverviewPackage[]; currentPayments: OverviewPayment[] | null; periodPayments: OverviewPayment[] | null; attempts: OverviewPayment[] | null;
  stuckOrders: number | null; webhooks: WebhookTelemetry | null; period: OverviewPeriod; now: Date; notices?: string[];
}): OverviewData {
  const range = istPeriodRange(period, now);
  const plans = new Map<string, PlanRow>();
  let payingGyms = 0, missingPrices = 0;
  for (const gym of gyms) {
    const sub = subscriptions.find(row => row.organization_id === gym.organization_id);
    const pkg = packages.find(row => row.id === sub?.package_id);
    const trial = sub?.status === "trialing";
    const name = trial ? "Free trial" : pkg?.name ?? "No plan assigned";
    const key = trial ? "trial" : pkg?.plan_id ?? pkg?.id ?? "unassigned";
    const currency = pkg?.currency ?? "INR";
    const plan = plans.get(`${key}:${currency}`) ?? { id: `${key}:${currency}`, name, gyms: 0, mrrMinor: 0, currency, unavailable: 0 };
    plan.gyms++;
    const price = sub && currentPayments ? currentPrice(sub, currentPayments) : null;
    if (sub && pkg && !trial && sub.status !== "cancelled" && ["active", "grace"].includes(gym.state) && (!sub.current_period_start || timestamp(sub.current_period_start) <= +now) && (pkg.price_minor > 0 || (price?.amountMinor ?? 0) > 0)) {
      payingGyms++;
      if (!price || price.currency !== currency) { plan.unavailable++; plan.mrrMinor = null; missingPrices++; }
      else if (plan.mrrMinor !== null) {
        const combined = plan.mrrMinor + price.amountMinor;
        if (money(combined)) plan.mrrMinor = combined;
        else { plan.mrrMinor = null; plan.unavailable++; missingPrices++; }
      }
    }
    plans.set(`${key}:${currency}`, plan);
  }
  const planRows = [...plans.values()].sort((a, b) => b.gyms - a.gyms || a.name.localeCompare(b.name));
  const mrrCurrencies = new Set(planRows.filter(row => row.mrrMinor !== 0).map(row => row.currency));
  const knownMrr = planRows.reduce((sum, row) => sum + (row.mrrMinor ?? 0), 0);
  const mrrMinor = missingPrices || mrrCurrencies.size > 1 || !money(knownMrr) ? null : knownMrr;
  const mrrCurrency = [...mrrCurrencies][0] ?? "INR";
  const eligible = periodPayments?.filter(payment => payment.package_id && ["succeeded", "refunded"].includes(payment.status) && timestamp(payment.paid_at) >= +range.start && timestamp(payment.paid_at) < Math.min(+range.end, +now + 1)) ?? [];
  const currencies = new Set(eligible.map(payment => payment.currency));
  const grossCandidate = eligible.reduce((sum, payment) => sum + payment.amount_minor, 0);
  const reliableCollections = periodPayments !== null && currencies.size <= 1 && eligible.every(payment => money(payment.amount_minor)) && money(grossCandidate);
  const refunds = eligible.map(recordedRefund);
  const grossMinor = reliableCollections ? grossCandidate : null;
  const refundsMinor = reliableCollections && refunds.every(amount => amount !== null) ? refunds.reduce<number>((sum, amount) => sum + amount!, 0) : null;
  const recentStart = Date.parse(`${istDateKey(now)}T00:00:00+05:30`) - 6 * DAY_MS;
  const recent = gyms.filter(gym => timestamp(gym.created_at) >= recentStart && timestamp(gym.created_at) <= +now).sort((a, b) => timestamp(b.created_at) - timestamp(a.created_at) || a.organization_id.localeCompare(b.organization_id));
  const capacity: CapacityRow[] = [];
  for (const gym of gyms) for (const resource of ["members", "branches"] as const) {
    const used = resource === "members" ? gym.member_count : gym.branch_count, cap = resource === "members" ? gym.member_cap : gym.branch_cap;
    if (cap === null || cap < 0 || (used === 0 && cap !== 0) || (used < cap && (resource === "branches" || cap === 0 || used / cap < 0.9))) continue;
    if (used === 0 && cap === 0) continue;
    const label = resource === "members" ? "Member" : "Branch";
    capacity.push({ id: `${gym.organization_id}:${resource}`, organizationId: gym.organization_id, gym: gym.name, detail: `${label} limit ${used > cap ? "exceeded" : used === cap ? "reached" : "nearly reached"} · ${used} of ${cap}`, over: used > cap });
  }
  return {
    asOf: now.toISOString(), period, periodLabel: range.label, rangeStart: range.start.toISOString(), rangeEnd: range.end.toISOString(), grouping: period === "month" ? "daily" : period === "quarter" ? "weekly" : "monthly",
    totalGyms: gyms.length, payingGyms, members: gyms.reduce((sum, row) => sum + row.member_count, 0), branches: gyms.reduce((sum, row) => sum + row.branch_count, 0),
    mrrMinor, mrrCurrency, missingPrices, mrrNote: mrrCurrencies.size > 1 ? "Multiple currencies; no exchange-rate conversion is applied." : !money(knownMrr) ? "The total exceeds the supported safe monetary range." : missingPrices ? `${missingPrices} paying ${missingPrices === 1 ? "gym has" : "gyms have"} no unambiguous, unrefunded receipt matching current coverage. Catalogue prices are not substituted.` : "Current paid coverage, after recorded pricing discounts. Calendar cycles use their actual month count; day-based cycles use an average calendar month. Gateway fees are not deducted.",
    plans: planRows, followUps: buildFollowUps(gyms, subscriptions, attempts ?? [], now), capacity: capacity.sort((a, b) => Number(b.over) - Number(a.over) || a.gym.localeCompare(b.gym)),
    recentCount: recent.length, recentGyms: recent.slice(0, 5).map(gym => ({ id: gym.organization_id, name: gym.name, status: gym.state === "trialing" ? "Free trial" : gym.state === "read_only" ? "Read-only" : gym.state.charAt(0).toUpperCase() + gym.state.slice(1), joinedAt: gym.created_at })),
    collections: { grossMinor, refundsMinor, netMinor: grossMinor !== null && refundsMinor !== null ? grossMinor - refundsMinor : null, currency: [...currencies][0] ?? "INR", paymentCount: eligible.length, buckets: reliableCollections ? collectionBuckets(eligible, period, now) : [], error: !reliableCollections },
    monitoring: { webhooks, stuckOrders, recentFailedGyms: attempts === null ? null : new Set(buildFollowUps(gyms, [], attempts, now).map(row => row.organizationId)).size }, notices,
  };
}
