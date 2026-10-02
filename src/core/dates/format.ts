/** Short, human date formatting for the admin screens — "24 Sep" for a date
 * in the current year, "12 Mar 27" once the year differs, matching the
 * design's own date strings (design-audit.md's Gyms/Revenue sections). New
 * to this app (not copied from FitDeskApp, which formats dates
 * differently) — the design's exact "day short-month [2-digit year]" shape
 * doesn't exist there to copy. */
import { IST_TIME_ZONE, istDateKey, istDayDifference } from "./ist";

export function formatShortDate(date: Date, now: Date = new Date()): string {
  const key = istDateKey(date);
  const day = Number(key.slice(8, 10));
  const month = date.toLocaleDateString("en-IN", { month: "short", timeZone: IST_TIME_ZONE });
  if (key.slice(0, 4) !== istDateKey(now).slice(0, 4)) {
    const yy = key.slice(2, 4);
    return `${day} ${month} ${yy}`;
  }
  return `${day} ${month}`;
}

/** IST calendar days between two instants — used for countdowns and overdue days. */
export function daysBetween(from: Date, to: Date): number {
  return istDayDifference(from, to);
}

/** Format an instant in the gym's configured IANA timezone. `timestamptz`
 * values arrive as UTC instants; passing the timezone explicitly prevents a
 * Vercel/server locale (or the platform admin's device locale) from silently
 * changing what the gym considers the event time. */
export function formatZonedDateTime(value: string | Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone,
  }).format(typeof value === "string" ? new Date(value) : value);
}

export function formatZonedDate(value: string | Date, timeZone: string, includeYear = true): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    ...(includeYear ? { year: "numeric" as const } : {}),
    timeZone,
  }).format(typeof value === "string" ? new Date(value) : value);
}

export function formatZonedTime(value: string | Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone,
  }).format(typeof value === "string" ? new Date(value) : value);
}

/** Database DATE values are calendar dates, not UTC instants. Formatting at
 * UTC keeps 2026-09-29 as 29 Sep in every deployment timezone. */
export function formatCalendarDate(isoDate: string, includeYear = true): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    ...(includeYear ? { year: "numeric" as const } : {}),
    timeZone: "UTC",
  }).format(new Date(`${isoDate}T00:00:00.000Z`));
}

export function calendarDayDifference(fromIsoDate: string, toIsoDate: string): number {
  const [fy, fm, fd] = fromIsoDate.split("-").map(Number);
  const [ty, tm, td] = toIsoDate.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

export function todayIsoInTimeZone(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).format(now);
}
