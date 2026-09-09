"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PAGE_SIZE_OPTIONS } from "./Pagination";

/** The one interactive piece of Pagination — everything else there is a
 * plain server-rendered Link, but a `<select>` needs an onChange handler,
 * which forces this one control into its own Client Component. */
export function PageSizeSelect({ pageSize }: { pageSize: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <label className="flex items-center gap-1.5">
      <span className="mfd-micro-label">Per page</span>
      <select
        value={pageSize}
        className="min-h-[30px] border-[1.5px] border-line bg-paper px-2 text-[11.5px] font-bold text-ink outline-none"
        onChange={(e) => {
          const params = new URLSearchParams(searchParams.toString());
          params.set("pageSize", e.target.value);
          params.set("page", "1");
          router.push(`${pathname}?${params.toString()}`);
        }}
      >
        {PAGE_SIZE_OPTIONS.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
    </label>
  );
}
