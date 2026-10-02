/** Offset (minutes east of UTC) that `timeZone` has at `instant`. */
function offsetMinutes(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60000);
}

/** Start and end instants (ISO) of the calendar day `YYYY-MM-DD` in `timeZone`,
 * so "Today" in a filter means the gym's today, not the server's. */
export function zonedDayRange(day: string, timeZone: string): { start: string; end: string } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const guess = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(guess.getTime()) || guess.toISOString().slice(0, 10) !== day) return null;
  const start = new Date(guess.getTime() - offsetMinutes(guess, timeZone) * 60000);
  const end = new Date(start.getTime() + 24 * 3600 * 1000 - 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

/** Today's date (YYYY-MM-DD) in `timeZone`, optionally shifted by whole days. */
export function zonedToday(timeZone: string, shiftDays = 0, now: Date = new Date()): string {
  const shifted = new Date(now.getTime() + shiftDays * 24 * 3600 * 1000);
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(shifted);
}
