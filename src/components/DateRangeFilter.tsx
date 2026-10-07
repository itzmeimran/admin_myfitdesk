"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DatePicker, type DateRange } from "./DatePicker";
import { istDateKey } from "@/core/dates/ist";

/** MyFitDesk range calendar: Apply changes both URL endpoints together. */
export function DateRangeFilter({ fromParam = "from", toParam = "to" }: { fromParam?: string; toParam?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  function apply(range: DateRange) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [param, value] of [[fromParam, range.from], [toParam, range.to]]) {
      if (value) params.set(param, value);
      else params.delete(param);
    }
    params.delete("page");
    startTransition(() => router.push(`${pathname}${params.size ? `?${params}` : ""}`, { scroll: false }));
  }

  return <DatePicker mode="range" rangeValue={{ from: searchParams.get(fromParam) ?? "", to: searchParams.get(toParam) ?? "" }}
    onRangeChange={apply} ariaLabel="Date range" placeholder="Select date range" today={istDateKey()}
    disabled={pending} className="w-full sm:w-[260px]" />;
}
