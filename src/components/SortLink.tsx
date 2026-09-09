import Link from "next/link";

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
}: {
  pathname: string;
  searchParams: Record<string, string | string[] | undefined>;
  sortKey: string;
  currentSort: string;
  currentDir: "asc" | "desc";
  className?: string;
  align?: "left" | "right";
  children: React.ReactNode;
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
    <th scope="col" className={`mfd-micro-label border-b border-line px-3 py-2.5 ${align === "right" ? "text-right" : ""} ${className}`}>
      <Link
        href={`${pathname}?${params.toString()}`}
        className={`inline-flex items-center gap-1 hover:text-ink ${active ? "text-ink" : ""}`}
        aria-sort={active ? (currentDir === "asc" ? "ascending" : "descending") : "none"}
      >
        {children}
        <span aria-hidden="true" className="text-[9px]">
          {active ? (currentDir === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </Link>
    </th>
  );
}
