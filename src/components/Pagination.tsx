import Link from "next/link";
import { PrevPageIcon, NextPageIcon } from "@/core/ui/icons";
import { PageSizeSelect } from "./PageSizeSelect";

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 25;

/** Clamps and parses a `?page=`/`?pageSize=` pair from raw search params into
 * safe, positive integers — shared by every server-paginated tab so a
 * malformed or missing query string always degrades to page 1 / the
 * default page size rather than a NaN offset reaching the database. */
export function parsePagination(searchParams: Record<string, string | string[] | undefined>) {
  const rawPage = Array.isArray(searchParams.page) ? searchParams.page[0] : searchParams.page;
  const rawSize = Array.isArray(searchParams.pageSize) ? searchParams.pageSize[0] : searchParams.pageSize;
  const page = Math.max(1, Number.parseInt(rawPage ?? "1", 10) || 1);
  const pageSize = PAGE_SIZE_OPTIONS.includes(Number(rawSize) as (typeof PAGE_SIZE_OPTIONS)[number])
    ? Number(rawSize)
    : DEFAULT_PAGE_SIZE;
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function hrefWith(
  pathname: string,
  searchParams: Record<string, string | string[] | undefined>,
  overrides: Record<string, string | undefined>,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (value === undefined) continue;
    params.set(key, Array.isArray(value) ? value[0] : value);
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) params.delete(key);
    else params.set(key, value);
  }
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

/**
 * Prev/Next + page-size selector + "Showing X–Y of Z" — server-rendered
 * (plain `<Link>`s carrying the full, current query string forward) so
 * search/filter/sort state survives a page change without any client JS,
 * per the brief's "preserve search/filter/sort state when changing pages".
 */
export function Pagination({
  pathname,
  searchParams,
  page,
  pageSize,
  total,
  itemLabel = "results",
}: {
  pathname: string;
  searchParams: Record<string, string | string[] | undefined>;
  page: number;
  pageSize: number;
  total: number;
  itemLabel?: string;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-2.5 text-[11.5px] text-mute">
      <span>
        {total === 0 ? `No ${itemLabel}` : `Showing ${from}–${to} of ${total} ${itemLabel}`}
      </span>
      <div className="flex items-center gap-3">
        <PageSizeSelect pageSize={pageSize} />
        <span className="font-bold text-ink">
          Page {page} of {totalPages}
        </span>
        <div className="flex gap-2">
          <Link
            aria-label="Previous page"
            aria-disabled={page <= 1}
            tabIndex={page <= 1 ? -1 : undefined}
            href={hrefWith(pathname, searchParams, { page: String(Math.max(1, page - 1)) })}
            className={`flex h-8 w-8 items-center justify-center border-[1.5px] border-line text-ink ${
              page <= 1 ? "pointer-events-none cursor-not-allowed text-mute3" : ""
            }`}
          >
            <PrevPageIcon size={14} aria-hidden />
          </Link>
          <Link
            aria-label="Next page"
            aria-disabled={page >= totalPages}
            tabIndex={page >= totalPages ? -1 : undefined}
            href={hrefWith(pathname, searchParams, { page: String(Math.min(totalPages, page + 1)) })}
            className={`flex h-8 w-8 items-center justify-center border-[1.5px] border-line text-ink ${
              page >= totalPages ? "pointer-events-none cursor-not-allowed text-mute3" : ""
            }`}
          >
            <NextPageIcon size={14} aria-hidden />
          </Link>
        </div>
      </div>
    </div>
  );
}
