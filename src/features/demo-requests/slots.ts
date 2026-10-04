/** Demo-slot calendar for the public Book-a-demo page.
 *
 * Everything is an IST calendar day (`YYYY-MM-DD` key) — never a bare `Date`
 * in the visitor's device zone — matching this app's IST policy
 * (core/dates/ist.ts). The window rule (tomorrow → 30 days out, Sundays
 * closed, 10:00–18:30 half-hour slots) is the design's.
 *
 * Working hours, holiday closures and confirmed capacity come from the server. */
import { DAY_MS, istDateKey } from "@/core/dates/ist";

export const DEMO_WINDOW_DAYS = 30;
const MONTHS_FULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export type DayStatus = "open" | "past" | "closed" | "full";

export type DemoTime = { index: number; hour: number; label: string; short: string };

/** 10:00 AM … 6:30 PM, 18 half-hour slots, all IST. */
export const DEMO_TIMES: readonly DemoTime[] = Array.from({ length: 18 }, (_, index) => {
  const minutes = 600 + index * 30;
  const hour = Math.floor(minutes / 60);
  const half = minutes % 60 ? "30" : "00";
  const hour12 = ((hour + 11) % 12) + 1;
  return { index, hour, label: `${hour12}:${half} ${hour < 12 ? "AM" : "PM"}`, short: `${hour12}:${half}` };
});

export const TIME_GROUPS = [
  { name: "Morning", range: "10 AM–12 PM", test: (t: DemoTime) => t.hour < 12 },
  { name: "Afternoon", range: "12–5 PM", test: (t: DemoTime) => t.hour >= 12 && t.hour < 17 },
  { name: "Evening", range: "5–7 PM", test: (t: DemoTime) => t.hour >= 17 },
] as const;

const keyToUtc = (key: string) => new Date(`${key}T00:00:00Z`);

export function addDays(key: string, days: number): string {
  return new Date(keyToUtc(key).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

export function dayOfMonth(key: string): number {
  return Number(key.slice(8, 10));
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(key: string): number {
  return keyToUtc(key).getUTCDay();
}

export type DemoWindow = { today: string; earliest: string; last: string };

/** Bookable window. "Too soon" = today itself, so the earliest day is tomorrow (IST). */
export function demoWindow(now: Date = new Date()): DemoWindow {
  const today = istDateKey(now);
  const earliest = addDays(today, 1);
  return { today, earliest, last: addDays(earliest, DEMO_WINDOW_DAYS - 1) };
}

export type DemoCalendar = Record<string, DayStatus>;
export type DemoAvailability = { date: string; status: DayStatus; openSlots: number[] };

export function dayStatus(key: string, win: DemoWindow, calendar?: DemoCalendar): DayStatus {
  if (key < win.earliest || key > win.last) return "past";
  if (weekdayOf(key) === 0) return "closed";
  return calendar?.[key] ?? "open";
}

export function formatDemoDate(key: string): string {
  return `${WEEKDAYS_SHORT[weekdayOf(key)]}, ${dayOfMonth(key)} ${MONTHS_SHORT[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;
}

export type CalendarMonth = { label: string; blanks: number; days: string[] };

/** Every month the bookable window touches (one or two), Monday-first grid. */
export function calendarMonths(win: DemoWindow): CalendarMonth[] {
  const months: CalendarMonth[] = [];
  let year = Number(win.earliest.slice(0, 4));
  let month = Number(win.earliest.slice(5, 7));
  const endYear = Number(win.last.slice(0, 4));
  const endMonth = Number(win.last.slice(5, 7));
  while (year < endYear || (year === endYear && month <= endMonth)) {
    const first = `${year}-${String(month).padStart(2, "0")}-01`;
    const count = new Date(Date.UTC(year, month, 0)).getUTCDate();
    months.push({
      label: `${MONTHS_FULL[month - 1]} ${year}`,
      blanks: (weekdayOf(first) + 6) % 7,
      days: Array.from({ length: count }, (_, i) => `${year}-${String(month).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`),
    });
    month += 1;
    if (month > 12) { month = 1; year += 1; }
  }
  return months;
}
