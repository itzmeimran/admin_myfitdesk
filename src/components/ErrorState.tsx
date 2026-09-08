"use client";

/**
 * The shared body of every error boundary in this app — copied from
 * FitDeskApp/src/components/ErrorState.tsx (see that file's docblock for
 * the full "why this exists" reasoning: a raw Next.js crash page has no
 * branding and no way back).
 *
 * The `digest` is the only thing that ties an operator's report to a
 * server log line, so it is shown (small, selectable) rather than hidden.
 * The raw `error.message` is NOT shown — Next replaces it with a generic
 * string in production anyway, and where it isn't, it tends to be a
 * PostgREST sentence that means nothing without the query it came from.
 */

import Link from "next/link";

export function ErrorState({
  title,
  description,
  digest,
  onRetry,
  homeHref = "/admin",
  homeLabel = "Back to overview",
}: {
  title: string;
  description: string;
  digest?: string;
  /** Next's `reset()`. Omitted on `not-found`, where retrying is pointless. */
  onRetry?: () => void;
  homeHref?: string;
  homeLabel?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-5 px-4 py-16 text-center md:py-24">
      <div
        aria-hidden="true"
        className="flex h-12 w-12 items-center justify-center border-[1.5px] border-accent bg-accent/8 text-[22px] font-bold text-accent"
      >
        !
      </div>

      <div className="flex max-w-sm flex-col gap-2">
        <h1 className="font-display text-[19px] leading-tight text-ink">{title}</h1>
        <p className="text-[13.5px] leading-relaxed text-mute">{description}</p>
      </div>

      <div className="flex w-full max-w-[260px] flex-col gap-2">
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="press-scale flex items-center justify-center bg-hi py-3 text-[12px] font-bold uppercase tracking-[0.12em] text-ink transition hover:bg-ink hover:text-hi"
          >
            Try again
          </button>
        ) : null}
        <Link
          href={homeHref}
          className="press-scale flex items-center justify-center border-[1.5px] border-line bg-paper py-3 text-[12px] font-bold uppercase tracking-[0.12em] text-ink transition hover:border-ink"
        >
          {homeLabel}
        </Link>
      </div>

      {digest ? (
        <p className="text-[11px] text-mute3">
          Reference <span className="select-all font-mono">{digest}</span>
        </p>
      ) : null}
    </div>
  );
}
