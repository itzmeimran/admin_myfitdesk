"use client";

import type { ComponentProps } from "react";
import type { IconType } from "@/core/ui/icons";
import { buttonClasses, type ButtonStyleProps } from "@/core/ui/button-styles";
import { ButtonLabel } from "./ButtonLabel";

export type ButtonProps = ComponentProps<"button"> & ButtonStyleProps & {
  icon?: IconType;
  pending?: boolean;
  pendingLabel?: React.ReactNode;
};

/** Native button semantics, refs and form props are preserved. Visible actions
 * require an icon (enforced by mfd-ui/button-icon); text variants and invisible
 * backdrops and shared calendar date cells are exempt. Actions default to
 * type=button; submissions opt in. */
export function Button({
  variant = "secondary", layout, size, iconOnly, selected, tone, icon, pending = false,
  pendingLabel, className, children, disabled, type = "button", ...props
}: ButtonProps) {
  const unavailable = disabled || pending || props["aria-disabled"] === true || props["aria-disabled"] === "true";
  return (
    <button
      {...props}
      type={type}
      disabled={unavailable}
      aria-busy={pending || props["aria-busy"] || undefined}
      data-selected={selected || undefined}
      className={buttonClasses({ variant, layout, size, iconOnly, tone, className })}
    >
      <ButtonLabel icon={icon} pending={pending}>
        {pending && pendingLabel !== undefined ? pendingLabel : children}
      </ButtonLabel>
    </button>
  );
}
