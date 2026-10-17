"use client";

import { useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Dropdown } from "./Dropdown";
import { useNavigationPending } from "./NavigationPending";

export type CustomFilterOption = { value: string; label: string; hint?: string };

/** URL-backed filter built on the design-system `Dropdown`: writes
 * `param=value` (removing it for the "all" option), resets `page`, so server
 * pagination/sorting stay shareable and back/forward keep working. */
export function CustomFilterDropdown({
  param,
  placeholder,
  options,
  className = "",
}: {
  param: string;
  placeholder: string;
  options: CustomFilterOption[];
  className?: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { pending, pendingHref, navigate } = useNavigationPending();
  const [target, setTarget] = useState<string | null>(null);
  const selected = searchParams.get(param) ?? "";

  function choose(value: string) {
    const next = new URLSearchParams(searchParams.toString());
    if (value) next.set(param, value);
    else next.delete(param);
    next.delete("page");
    const href = `${pathname}${next.size ? `?${next}` : ""}`;
    setTarget(href);
    navigate(href, { scroll: false });
  }

  return (
    <div className={`min-w-[150px] max-w-full ${className}`}>
      <Dropdown
        size="sm"
        disabled={pending}
        pending={pending && pendingHref === target}
        ariaLabel={placeholder}
        value={selected}
        onChange={choose}
        options={[{ value: "", label: placeholder }, ...options]}
      />
    </div>
  );
}
