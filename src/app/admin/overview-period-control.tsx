"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useNavigationPending } from "@/components/NavigationPending";
import { PeriodDropdown, type PeriodPreset } from "@/components/PeriodDropdown";

/** The overview's period lives in the URL (`?period=` and, for a custom range,
 * `&start=&end=`), so a view is linkable and survives refresh and Back. Picking
 * one is a navigation, so the shared progress bar and the results' skeletons
 * react to it exactly as they do for any other overview navigation. */
export function OverviewPeriodControl({ value, presets, rangeFrom, rangeTo, rangeText, today }: {
  value: string; presets: readonly PeriodPreset[]; rangeFrom: string; rangeTo: string; rangeText: string; today: string;
}) {
  const pathname = usePathname();
  const search = useSearchParams();
  const { pendingHref, navigate } = useNavigationPending();
  const pending = pendingHref !== null && pendingHref.split("?")[0] === pathname;
  const go = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(search.toString());
    for (const [key, val] of Object.entries(updates)) { if (val === null) next.delete(key); else next.set(key, val); }
    next.delete("page");
    navigate(`${pathname}?${next}`, { scroll: false });
  };
  return <PeriodDropdown value={value} presets={presets} rangeFrom={rangeFrom} rangeTo={rangeTo} rangeText={rangeText} today={today} pending={pending}
    ariaLabel="Collection period" className="w-full sm:w-[260px]"
    onSelectPreset={preset => go({ period: preset, start: null, end: null })}
    onApplyCustom={range => go({ period: "custom", start: range.from, end: range.to })} />;
}
