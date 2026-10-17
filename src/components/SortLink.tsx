import { ButtonLink } from "@/components/ButtonLink";
import { ColumnSortIcon } from "@/core/ui/icons";

/** Sortable `<th>` — toggles asc/desc on the given column key, shows a
 * small arrow when it's the active sort, and carries every other current
 * query param forward untouched (search/filters/page size all survive a
 * sort click; `page` resets to 1 since the result ordering changed under
 * whatever page the admin was on). Shared by every server-sorted table in
 * the app (Gyms list, Branches, Staff, Members, Billing history). */
export function SortLink({
  pathname,
  searchParams,
  sortKey,
  currentSort,
  currentDir,
  className = "",
  align = "left",
  children,
  triangle = false,
}: {
  pathname: string;
  searchParams: Record<string, string | string[] | undefined>;
  sortKey: string;
  currentSort: string;
  currentDir: "asc" | "desc";
  className?: string;
  align?: "left" | "right";
  children: React.ReactNode;
  triangle?: boolean;
}) {
  const active = currentSort === sortKey;
  const nextDir = active && currentDir === "asc" ? "desc" : "asc";

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (value === undefined) continue;
    params.set(key, Array.isArray(value) ? value[0] : value);
  }
  params.set("sort", sortKey);
  params.set("dir", nextDir);
  params.delete("page");

  return (
    <th scope="col" aria-sort={active ? (currentDir === "asc" ? "ascending" : "descending") : "none"} className={`group/sort mfd-micro-label border-b border-line px-3 py-2.5 ${align === "right" ? "text-right" : ""} ${className}`}>
      <ButtonLink variant="ghost" layout="control" size="custom"
        href={`${pathname}?${params.toString()}`}
        className={`inline-flex items-center gap-1 transition-colors hover:text-ink ${active ? "text-ink" : ""}`}
        aria-label={`Sort by ${typeof children === "string" ? children : sortKey}, ${nextDir === "asc" ? "ascending" : "descending"}`}
      >
        {children}
        {triangle ? <ColumnSortIcon size={12} aria-hidden className={`!h-3 !w-3 shrink-0 text-ink/75 opacity-0 group-hover/sort:opacity-100 group-focus-within/sort:opacity-100 ${active ? "fill-current" : ""} ${!active || currentDir === "desc" ? "rotate-180" : ""}`} /> : <span aria-hidden="true" className="text-[9px]">
          {active ? (currentDir === "asc" ? "▲" : "▼") : "↕"}
        </span>}
      </ButtonLink>
    </th>
  );
}
