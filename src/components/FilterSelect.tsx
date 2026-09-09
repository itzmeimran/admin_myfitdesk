"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export type FilterOption = { value: string; label: string };

/**
 * URL-driven `<select>` filter shared by every server-paginated table —
 * writes `param=value` (or removes it for the "All" option's empty value)
 * and resets `page` to 1, same reasoning as SearchBox.
 */
export function FilterSelect({
  param,
  options,
  placeholder,
  className = "",
}: {
  param: string;
  options: FilterOption[];
  placeholder: string;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get(param) ?? "";

  function onChange(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (next) params.set(param, next);
    else params.delete(param);
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <select
      value={current}
      onChange={(e) => onChange(e.target.value)}
      className={`min-h-[36px] border-[1.5px] border-line bg-paper px-2.5 text-[12px] font-bold text-ink outline-none focus:border-ink ${className}`}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
