"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { DatePicker } from "@/components/DatePicker";
import { useNavigationPending } from "@/components/NavigationPending";
import { collectionMonthRange } from "@/core/dates/ist";

/** Uses the existing overview range query so totals and chart share IST bounds. */
export function OverviewCollectionMonth({ from, to, label, today, monthly }: {
  from: string; to: string; label: string; today: string; monthly: boolean;
}) {
  const pathname = usePathname(), search = useSearchParams();
  const { pendingHref, navigate } = useNavigationPending();
  const pending = pendingHref !== null && pendingHref.split("?")[0] === pathname;
  const range = collectionMonthRange(from.slice(0, 7), today);
  const value = monthly || range?.from === from && range.to === to ? `${from.slice(0, 7)}-01` : "";
  return <DatePicker mode="month" required value={value} today={today} max={today} disabled={pending}
    placeholder={label} ariaLabel="Collections month" align="right" className="w-[184px] max-w-full"
    onChange={date => {
      const month = collectionMonthRange(date.slice(0, 7), today);
      if (!month) return;
      const params = new URLSearchParams(search.toString());
      params.set("period", "custom");
      params.set("start", month.from);
      params.set("end", month.to);
      params.delete("page");
      navigate(`${pathname}?${params}`, { scroll: false });
    }} />;
}
