"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Dropdown } from "./Dropdown";

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
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const selected = searchParams.get(param) ?? "";

  function choose(value: string) {
    const next = new URLSearchParams(searchParams.toString());
    if (value) next.set(param, value);
    else next.delete(param);
    next.delete("page");
    startTransition(() => router.push(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false }));
  }

  return (
    <div className={`min-w-[150px] max-w-full ${className}`}>
      <Dropdown
        size="sm"
        disabled={pending}
        ariaLabel={placeholder}
        value={selected}
        onChange={choose}
        options={[{ value: "", label: placeholder }, ...options]}
      />
    </div>
  );
}
