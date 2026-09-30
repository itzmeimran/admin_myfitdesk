"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Dropdown } from "./Dropdown";
import { PAGE_SIZE_OPTIONS } from "./Pagination";

const OPTIONS = PAGE_SIZE_OPTIONS.map((n) => ({ value: String(n), label: String(n) }));

/** The one interactive piece of Pagination — everything else there is a
 * plain server-rendered Link. Uses the design-system `Dropdown` (which opens
 * upward from the footer and is never clipped by the table wrapper). */
export function PageSizeSelect({ pageSize }: { pageSize: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <div className="flex items-center gap-1.5">
      <span className="mfd-micro-label">Per page</span>
      <div className="w-[68px]">
        <Dropdown
          size="sm"
          align="right"
          ariaLabel="Rows per page"
          value={String(pageSize)}
          options={OPTIONS}
          onChange={(next) => {
            const params = new URLSearchParams(searchParams.toString());
            params.set("pageSize", next);
            params.set("page", "1");
            router.push(`${pathname}?${params.toString()}`);
          }}
        />
      </div>
    </div>
  );
}
