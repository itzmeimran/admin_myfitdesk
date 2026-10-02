/** All admin calendar dates and boundaries use Indian Standard Time.
 * Timestamps exchanged with the database remain ISO UTC instants. */
export const IST_TIME_ZONE = "Asia/Kolkata";
export const DAY_MS = 86_400_000;
const IST_OFFSET_MS = 330 * 60_000;

export function istDateKey(now: Date = new Date()): string {
  return new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** Calendar days, rather than elapsed 24-hour blocks from an arbitrary time. */
export function istDayDifference(from: Date, to: Date): number {
  return (Date.parse(istDateKey(to)) - Date.parse(istDateKey(from))) / DAY_MS;
}

export function millisecondsUntilIstMidnight(now: Date = new Date()): number {
  return Date.parse(`${istDateKey(now)}T00:00:00+05:30`) + DAY_MS - now.getTime();
}

/** Interpret a datetime-local form value as IST, irrespective of device zone. */
export function istInputToIso(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value)) return null;
  const date = new Date(`${value}+05:30`);
  return Number.isNaN(date.getTime()) || istDateKey(date) !== value.slice(0, 10) ? null : date.toISOString();
}

export function istPeriodRange(period: "month" | "quarter" | "year", now: Date) {
  const [year, month] = istDateKey(now).split("-").map(Number);
  const width = period === "year" ? 12 : period === "quarter" ? 3 : 1;
  const firstMonth = period === "year" ? 0 : Math.floor((month - 1) / width) * width;
  const boundary = (offset: number) => new Date(Date.UTC(year, firstMonth + offset, 1) - IST_OFFSET_MS);
  const start = boundary(0);
  return {
    start,
    end: boundary(width),
    prevStart: boundary(-width),
    prevEnd: start,
    label: period === "year" ? String(year) : period === "quarter" ? `Q${firstMonth / 3 + 1} ${year}`
      : now.toLocaleDateString("en-IN", { month: "long", timeZone: IST_TIME_ZONE }),
  };
}
