import Link from "next/link";
import { InboxIcon } from "@/core/ui/icons";

/** Shared "nothing here" state for every filterable/searchable table in the
 * admin app — a search/filter combination with zero matches always says so
 * plainly and always offers a way back to the unfiltered view, rather than
 * silently rendering an empty table. */
export function EmptyState({
  message,
  resetHref,
  resetLabel = "Reset filters",
}: {
  message: string;
  resetHref?: string;
  resetLabel?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-4 py-14 text-center">
      <InboxIcon size={26} className="text-mute3" aria-hidden />
      <p className="max-w-sm text-[12.5px] leading-relaxed text-mute">{message}</p>
      {resetHref ? (
        <Link
          href={resetHref}
          className="border-[1.5px] border-line px-3 py-2 text-[11px] font-bold uppercase tracking-[0.09em] text-ink"
        >
          {resetLabel}
        </Link>
      ) : null}
    </div>
  );
}
