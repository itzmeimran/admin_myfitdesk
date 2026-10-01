import type { GymDetail } from "@/features/gyms/detail";
import { formatZonedDate } from "@/core/dates/format";
import { capitalizeBillingPeriod } from "@/core/text/billing-period";

const DAY = 86_400_000;
/** At or below this many days left, a trial is "ending soon" and the panel turns to the accent tone. */
const TRIAL_WARN_DAYS = 7;
/** Meter ticks are one per day, which only reads as a calendar for short periods. */
const MAX_TICKS = 31;

export type SubscriptionPanelView = {
  tone: "calm" | "warn";
  /** Top-right label, e.g. "Growth · Monthly" or "Trial". */
  plan: string;
  headline: { value: string; unit: string | null; compact: boolean };
  /** The date the headline counts toward, e.g. Expires / Renews / Grace ends. */
  anchor: { label: string; value: string } | null;
  meter: { pct: number; ticks: number | null; from: string; mid: string; to: string } | null;
  note: string | null;
  noteMuted: boolean;
  primary: "manage" | "reactivate";
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * Turns a gym's subscription into what the header's right-hand panel shows.
 * Computed on the server so the day counts can't differ between the server
 * render and the browser's hydration pass.
 */
export function buildSubscriptionPanelView(gym: GymDetail, now: Date = new Date()): SubscriptionPanelView {
  const tz = gym.defaultTimezone;
  const sub = gym.subscription;

  const pendingNote = sub?.pending
    ? `Next up: ${sub.pending.packageName ?? "a new package"} starts ${formatZonedDate(sub.pending.periodStart, tz)}.`
    : null;

  const plan = !sub
    ? "No subscription"
    : sub.packageName
      ? `${sub.packageName} · ${capitalizeBillingPeriod(sub.billingPeriod)}`
      : gym.status === "Trialing"
        ? "Trial"
        : "No package";

  const base: SubscriptionPanelView = {
    tone: "calm",
    plan,
    headline: { value: "—", unit: null, compact: false },
    anchor: null,
    meter: null,
    note: pendingNote,
    noteMuted: true,
    primary: "manage",
  };

  if (gym.status === "Suspended") {
    return {
      ...base,
      headline: { value: "Suspended", unit: null, compact: true },
      anchor: gym.suspendedAt ? { label: "Since", value: formatZonedDate(gym.suspendedAt, tz) } : null,
      note: `Suspended by an admin${gym.suspensionReason ? `: ${gym.suspensionReason}` : ""}. Billing is unaffected.`,
      noteMuted: false,
      primary: "reactivate",
    };
  }

  if (gym.status === "Cancelled") {
    const when = sub?.cancelledAt ?? sub?.currentPeriodEnd ?? null;
    return {
      ...base,
      headline: { value: "Cancelled", unit: null, compact: true },
      anchor: when ? { label: "Cancelled", value: formatZonedDate(when, tz) } : null,
    };
  }

  if (!sub?.currentPeriodEnd) return base;

  const end = new Date(sub.currentPeriodEnd);
  const start = sub.currentPeriodStart ? new Date(sub.currentPeriodStart) : null;
  const left = (end.getTime() - now.getTime()) / DAY;
  const periodDays = start ? Math.max(1, Math.round((end.getTime() - start.getTime()) / DAY)) : null;
  const ticks = periodDays && periodDays <= MAX_TICKS ? periodDays : null;
  const from = start ? `Started ${formatZonedDate(start, tz, false)}` : "";
  const to = formatZonedDate(end, tz, false);

  // Past the period end: Grace (still has access) or Read-only (grace used up).
  if (left < 0) {
    const overdue = Math.max(1, Math.floor(-left));
    const graceEnd = new Date(end.getTime() + sub.graceDays * DAY);
    const graceLeft = Math.max(0, sub.graceDays - overdue);
    const readOnly = gym.status === "Read-only";
    return {
      ...base,
      tone: "warn",
      headline: { value: String(overdue), unit: overdue === 1 ? "day overdue" : "days overdue", compact: false },
      anchor: { label: readOnly ? "Read-only since" : "Grace ends", value: formatZonedDate(graceEnd, tz) },
      meter: { pct: 100, ticks, from, mid: "Past due", to },
      note: readOnly
        ? "Access is read-only. Extend the subscription or change the package to restore it."
        : `Payment is overdue. Access turns read-only in ${plural(graceLeft, "day")} unless extended.`,
      noteMuted: false,
    };
  }

  const daysLeft = Math.floor(left);
  const elapsed = start ? Math.min(1, Math.max(0, (now.getTime() - start.getTime()) / (end.getTime() - start.getTime()))) : null;
  const dayNo = start && periodDays ? Math.min(periodDays, Math.max(1, Math.floor((now.getTime() - start.getTime()) / DAY) + 1)) : null;
  const meter =
    elapsed !== null && dayNo !== null && periodDays !== null
      ? { pct: Math.round(elapsed * 100), ticks, from, mid: `Day ${dayNo} of ${periodDays}`, to }
      : null;

  const trialing = gym.status === "Trialing";
  const endingSoon = trialing && daysLeft <= TRIAL_WARN_DAYS;
  return {
    ...base,
    tone: endingSoon ? "warn" : "calm",
    headline: { value: String(daysLeft), unit: trialing ? (daysLeft === 1 ? "day left" : "days left") : daysLeft === 1 ? "day to renewal" : "days to renewal", compact: false },
    anchor: { label: trialing ? "Expires" : "Renews", value: formatZonedDate(end, tz) },
    meter,
    note: endingSoon ? "Trial ends soon. Extend it or assign a package to keep the gym active." : pendingNote,
    noteMuted: !endingSoon,
  };
}
