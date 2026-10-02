"use client";

import { SpinnerIcon, type IconType } from "@/core/ui/icons";
import { ICON_SIZE } from "@/core/ui/icon-size";

/** Shared Lucide icon spacing and loading indicator for every button variant. */
export function ButtonLabel({
  icon: Icon,
  pending,
  children,
}: {
  icon?: IconType;
  pending?: boolean;
  children: React.ReactNode;
}) {
  if (!Icon && !pending) return <>{children}</>;
  return (
    <span className="inline-flex min-w-0 max-w-full items-center justify-center gap-2">
      {pending ? (
        <SpinnerIcon size={ICON_SIZE.button} className="flex-shrink-0 animate-spin" aria-hidden />
      ) : Icon ? (
        <Icon size={ICON_SIZE.button} className="flex-shrink-0" aria-hidden />
      ) : null}
      <span className="min-w-0 truncate">{children}</span>
    </span>
  );
}
