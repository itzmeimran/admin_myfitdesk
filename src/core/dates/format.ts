/** Short, human date formatting for the admin screens — "24 Sep" for a date
 * in the current year, "12 Mar 27" once the year differs, matching the
 * design's own date strings (design-audit.md's Gyms/Revenue sections). New
 * to this app (not copied from FitDeskApp, which formats dates
 * differently) — the design's exact "day short-month [2-digit year]" shape
 * doesn't exist there to copy. */
export function formatShortDate(date: Date, now: Date = new Date()): string {
  const day = date.getDate();
  const month = date.toLocaleDateString("en-IN", { month: "short" });
  if (date.getFullYear() !== now.getFullYear()) {
    const yy = String(date.getFullYear()).slice(-2);
    return `${day} ${month} ${yy}`;
  }
  return `${day} ${month}`;
}

/** Whole days between two instants, floored — used for "Overdue Nd". */
export function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
}
