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
    <>
      {pending ? (
        <SpinnerIcon size={ICON_SIZE.button} className="flex-shrink-0 animate-spin" aria-hidden />
      ) : Icon ? (
        <Icon size={ICON_SIZE.button} className="flex-shrink-0" aria-hidden />
      ) : null}
      {children}
    </>
  );
}
