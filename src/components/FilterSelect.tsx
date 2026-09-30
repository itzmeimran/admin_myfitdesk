"use client";

import { CustomFilterDropdown } from "./CustomFilterDropdown";

export type FilterOption = { value: string; label: string };

/**
 * URL-driven filter shared by every server-paginated table — writes
 * `param=value` (or removes it for the "All" option's empty value) and resets
 * `page` to 1, same reasoning as SearchBox. Renders the design-system
 * `Dropdown` (via `CustomFilterDropdown`), never a native `<select>`.
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
  return <CustomFilterDropdown param={param} placeholder={placeholder} options={options} className={className} />;
}
