"use client";

import Link from "next/link";
import type { ComponentProps, MouseEvent } from "react";
import type { IconType } from "@/core/ui/icons";
import { buttonClasses, type ButtonStyleProps } from "@/core/ui/button-styles";
import { ButtonLabel } from "./ButtonLabel";
import { PendingLink } from "./NavigationPending";

export type ButtonLinkProps = ComponentProps<typeof Link> & ButtonStyleProps & {
  icon?: IconType;
  disabled?: boolean;
};

/** Uses a real link for navigation, with the same visual contract as Button. */
export function ButtonLink({
  variant = "secondary", layout, size, iconOnly, selected, tone, icon, disabled = false,
  className, children, onClick, tabIndex, href, ...props
}: ButtonLinkProps) {
  const unavailable = disabled || props["aria-disabled"] === true || props["aria-disabled"] === "true";
  const linkProps = {
      ...props,
      "aria-disabled": unavailable || undefined,
      tabIndex: unavailable ? -1 : tabIndex,
      "data-selected": selected || undefined,
      className: buttonClasses({ variant, layout, size, iconOnly, tone, className }),
      onClick: (event: MouseEvent<HTMLAnchorElement>) => {
        if (unavailable) { event.preventDefault(); event.stopPropagation(); return; }
        onClick?.(event);
      },
  };
  const content = <ButtonLabel icon={icon}>{children}</ButtonLabel>;
  if (typeof href === "string" && href.startsWith("/") && !href.startsWith("//")) {
    return <PendingLink {...linkProps} href={href} pendingChildren={layout === "content" ? <><span className="sr-only">Loading…</span>{content}</> : <ButtonLabel pending>{iconOnly ? <span className="sr-only">Loading…</span> : children}</ButtonLabel>}>
      {content}
    </PendingLink>;
  }
  return <Link {...linkProps} href={href}>{content}</Link>;
}
