"use client";

import { Button } from "@/components/Button";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CancelIcon } from "@/core/ui/icons";

/**
 * Wraps a small picture (a gym logo, a member photo) in a button that opens
 * it full size in a modal viewer. The viewer is portalled to <body> so it
 * sits above Sheets and Dialogs, closes on Escape, on a click outside the
 * picture, or on the close button, and returns focus to the picture that
 * opened it. The Escape press is swallowed so it doesn't also close a Sheet
 * underneath.
 */
export function ImageLightbox({
  src,
  alt,
  title,
  subtitle,
  className = "block h-full w-full",
  children,
}: {
  src: string;
  alt: string;
  title: string;
  subtitle?: string;
  /** Layout classes for the trigger button; it should fill the thumbnail's box. */
  className?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      close();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, close]);

  return (
    <>
      <Button
        ref={triggerRef}
        type="button"
        onClick={() => {
          setFailed(false);
          setOpen(true);
        }}
        aria-label={`View ${title} picture full size`}
        aria-haspopup="dialog"
        title="Click to enlarge"
        variant="surface" size="custom" className={` ${className} group overflow-hidden`}
        style={{ cursor: "zoom-in" }}
      >
        <span className="block h-full w-full transition-transform duration-200 ease-out group-hover:scale-110">{children}</span>
      </Button>

      {open
        ? createPortal(
            <div role="dialog" aria-modal="true" aria-label={`${title} picture`} className="fixed inset-0 z-[70] flex items-center justify-center p-4">
              <Button
                type="button"
                aria-label="Close picture"
                tabIndex={-1}
                onClick={close}
                variant="overlay" size="custom" className="fade-in absolute inset-0 border-none bg-black/75"
                style={{ cursor: "zoom-out" }}
              />
              <figure className="fade-in relative flex max-h-full w-full max-w-[min(92vw,560px)] flex-col border-[1.5px] border-ink bg-paper">
                <div className="flex items-center justify-between gap-3 border-b-[1.5px] border-ink bg-ink px-3.5 py-2 text-paper">
                  <figcaption className="flex min-w-0 flex-col">
                    <span className="truncate font-display text-[15px] tracking-[-0.02em]">{title}</span>
                    {subtitle ? <span className="truncate text-[10.5px] text-mute3">{subtitle}</span> : null}
                  </figcaption>
                  <Button tone="inverse"
                    ref={closeRef}
                    type="button"
                    aria-label="Close"
                    onClick={close}
                    variant="ghost" size="sm" iconOnly className="-mr-2 flex-shrink-0"
                  >
                    <CancelIcon size={17} aria-hidden />
                  </Button>
                </div>
                <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-sand p-3">
                  {failed ? (
                    <p className="px-6 py-10 text-center text-[12.5px] text-mute">This picture couldn&apos;t be loaded. Its link may have expired — reload the page and try again.</p>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={src}
                      alt={alt}
                      referrerPolicy="no-referrer"
                      onError={() => setFailed(true)}
                      className="max-h-[75vh] w-auto max-w-full object-contain"
                    />
                  )}
                </div>
              </figure>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
