"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import type { IconType } from "@/core/ui/icons";
import { buttonClasses, type ButtonStyleProps } from "@/core/ui/button-styles";
import { ButtonLabel } from "./ButtonLabel";

export type ButtonLinkProps = ComponentProps<typeof Link> & ButtonStyleProps & {
  icon?: IconType;
  disabled?: boolean;
};

/** Uses a real link for navigation, with the same visual contract as Button. */
export function ButtonLink({
  variant = "secondary", size, iconOnly, selected, tone, icon, disabled = false,
  className, children, onClick, tabIndex, ...props
}: ButtonLinkProps) {
  const unavailable = disabled || props["aria-disabled"] === true || props["aria-disabled"] === "true";
  return (
    <Link
      {...props}
      aria-disabled={unavailable || undefined}
      tabIndex={unavailable ? -1 : tabIndex}
      data-selected={selected || undefined}
      className={buttonClasses({ variant, size, iconOnly, tone, className })}
      onClick={(event) => {
        if (unavailable) { event.preventDefault(); event.stopPropagation(); return; }
        onClick?.(event);
      }}
    >
      <ButtonLabel icon={icon}>{children}</ButtonLabel>
    </Link>
  );
}
