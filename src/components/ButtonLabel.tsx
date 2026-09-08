"use client";

import { SpinnerIcon, type IconType } from "@/core/ui/icons";
import { ICON_SIZE } from "@/core/ui/icon-size";

/**
 * The app's one "[icon] Label" button treatment, shared by `SubmitButton`
 * and `AsyncButton` so every button that has an icon spaces and sizes it
 * identically: icon always *before* the text, always `ICON_SIZE.button`,
 * always `gap-2`. Copied verbatim from FitDeskApp/src/components/ButtonLabel.tsx.
 *
 * Deliberately an inline-flex `<span>` wrapper: it centers the icon against
 * the label regardless of the icon's own intrinsic size. `SubmitButton` and
 * `AsyncButton` already center this whole span inside the button itself, so
 * this wrapper only has to handle the icon-to-label relationship.
 *
 * While `pending`, the icon slot renders a spinner instead of the action
 * icon rather than disappearing — the label text already changes ("Archive"
 * -> "Archiving…"), and dropping the icon on top of that would shift the
 * text sideways mid-submit.
 */
export function ButtonLabel({
  icon: Icon,
  pending,
  children,
}: {
  icon?: IconType;
  pending?: boolean;
  children: React.ReactNode;
}) {
  if (!Icon) return <>{children}</>;
  return (
    <span className="inline-flex items-center justify-center gap-2">
      {pending ? (
        <SpinnerIcon size={ICON_SIZE.button} className="flex-shrink-0 animate-spin" aria-hidden />
      ) : (
        <Icon size={ICON_SIZE.button} className="flex-shrink-0" aria-hidden />
      )}
      <span>{children}</span>
    </span>
  );
}
