import { formatZonedDate } from "@/core/dates/format";
import { DAY_MS, IST_TIME_ZONE, istDateKey, istDayDifference } from "@/core/dates/ist";

import { EXPIRY_WARNING_DAYS } from "./subscription-rules";
export const GYM_LIST_FILTERS = ["All", "Active", "Trialing", "Expired", "Expiring soon", "Grace", "Read-only", "Cancelled", "Suspended"] as const;
export type GymListFilter = (typeof GYM_LIST_FILTERS)[number];
export function isGymListFilter(value?: string): value is GymListFilter {
  return GYM_LIST_FILTERS.includes(value as GymListFilter);
}

export function expiryWindow(now: Date) {
  const today = Date.parse(`${istDateKey(now)}T00:00:00+05:30`);
  return { now: now.toISOString(), before: new Date(today + (EXPIRY_WARNING_DAYS + 1) * DAY_MS).toISOString() };
}

function validDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function trialDuration(start: string | null, end: string | null): string {
  const from = validDate(start), to = validDate(end);
  if (!from || !to || to <= from) return "Duration unavailable";
  const days = istDayDifference(from, to);
  return days > 0 ? `${days}-day trial` : "Less than a day";
}

export function memberUsage(count: number, limit: number | null | undefined, assignedPlan: boolean) {
  const members = `${count.toLocaleString("en-IN")} ${count === 1 ? "member" : "members"}`;
  // NULL is unlimited only on an existing package (the package schema's convention).
  if (assignedPlan && limit === null) return { label: members, note: "Unlimited", pct: null, over: false };
  if (limit == null || !Number.isFinite(limit) || limit < 0) return { label: members, note: "Limit unavailable", pct: null, over: false };
  const over = count > limit;
  return {
    label: `${count.toLocaleString("en-IN")} / ${limit.toLocaleString("en-IN")} members`,
    note: over ? `${(count - limit).toLocaleString("en-IN")} over limit` : limit === 0 ? "No member capacity" : null,
    pct: limit === 0 ? (count > 0 ? 100 : 0) : Math.min(100, Math.max(0, count / limit * 100)),
    over,
  };
}

export function nextSubscriptionDate(end: string | null, trial: boolean, autoRenew: boolean, now: Date, cancelled = false) {
  const date = validDate(end);
  const label = trial ? "Trial ends" : autoRenew && !cancelled ? "Renewal due" : "Subscription ends";
  if (!date) return { label, date: "—", relative: "Date unavailable", tone: "neutral" as const };
  const days = istDayDifference(now, date);
  const expired = date.getTime() <= now.getTime();
  return {
    label,
    date: formatZonedDate(date, IST_TIME_ZONE),
    relative: expired ? days === 0 ? "Expired today" : `Expired ${Math.abs(days)} ${Math.abs(days) === 1 ? "day" : "days"} ago`
      : days === 0 ? "Ends today" : `${days} ${days === 1 ? "day" : "days"} left`,
    tone: expired ? "expired" as const : days <= EXPIRY_WARNING_DAYS ? "warning" as const : "neutral" as const,
  };
}
