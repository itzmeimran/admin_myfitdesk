import { ButtonLink } from "@/components/ButtonLink";

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
        <ButtonLink
          href={resetHref}
          variant="secondary" size="md"
        >
          {resetLabel}
        </ButtonLink>
      ) : null}
    </div>
  );
}
