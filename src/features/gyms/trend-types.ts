/** One bucket of the "Payments & enrollments" chart. `at` is the bucket start
 * (an ISO instant on an IST day/hour boundary); `payMinor` is settled gym-member
 * payments in minor units, `txn` how many payments made it up, `mem` new members.
 * Kept free of `server-only` so the client chart can import the type. */
export type TrendPoint = { at: string; payMinor: number; txn: number; mem: number };

export type GymTrend = {
  /** Latest 60 IST calendar days, oldest first (chart shows 30 + the 30 before). */
  daily: TrendPoint[];
  /** Latest 48 IST clock hours, oldest first (chart shows 24 + the 24 before). */
  hourly: TrendPoint[];
};
