"use client";

import { useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Dropdown } from "./Dropdown";
import { useNavigationPending } from "./NavigationPending";
import { PAGE_SIZE_OPTIONS } from "@/core/ui/pagination";

const OPTIONS = PAGE_SIZE_OPTIONS.map((n) => ({ value: String(n), label: String(n) }));

/** The one interactive piece of Pagination — everything else there is a
 * plain server-rendered Link. Uses the design-system `Dropdown` (which opens
 * upward from the footer and is never clipped by the table wrapper). */
export function PageSizeSelect({ pageSize }: { pageSize: number }) {
  const { pending, pendingHref, navigate } = useNavigationPending();
  const [target, setTarget] = useState<string | null>(null);
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
          disabled={pending}
          pending={pending && pendingHref === target}
          onChange={(next) => {
            const params = new URLSearchParams(searchParams.toString());
            params.set("pageSize", next);
            params.set("page", "1");
            const href = `${pathname}?${params.toString()}`;
            setTarget(href);
            navigate(href, { scroll: false });
          }}
        />
      </div>
    </div>
  );
}
