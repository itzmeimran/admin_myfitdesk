"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** Shared "from – to" date range filter (Billing history's date range,
 * Activity log's date range) — two plain `<input type="date">`s writing
 * to the given query params on change/reset `page` to 1, same URL-as-state
 * model as every other filter in this app. */
export function DateRangeFilter({ fromParam = "from", toParam = "to" }: { fromParam?: string; toParam?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const from = searchParams.get(fromParam) ?? "";
  const to = searchParams.get(toParam) ?? "";

  function update(param: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(param, value);
    else params.delete(param);
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex items-center gap-1.5">
      <input
        type="date"
        value={from}
        onChange={(e) => update(fromParam, e.target.value)}
        aria-label="From date"
        className="min-h-[36px] border-[1.5px] border-line bg-paper px-2 text-[12px] text-ink outline-none focus:border-ink"
      />
      <span className="text-[11px] text-mute3">to</span>
      <input
        type="date"
        value={to}
        onChange={(e) => update(toParam, e.target.value)}
        aria-label="To date"
        className="min-h-[36px] border-[1.5px] border-line bg-paper px-2 text-[12px] text-ink outline-none focus:border-ink"
      />
    </div>
  );
}
