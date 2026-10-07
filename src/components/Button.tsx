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
 * require an icon (enforced by mfd-ui/button-icon); link variants and invisible
 * backdrops are exempt. Actions default to type=button; submissions opt in. */
export function Button({
  variant = "secondary", size, iconOnly, selected, tone, icon, pending = false,
  pendingLabel, className, children, disabled, type = "button", ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      type={type}
      disabled={disabled || pending}
      aria-busy={pending || props["aria-busy"] || undefined}
      data-selected={selected || undefined}
      className={buttonClasses({ variant, size, iconOnly, tone, className })}
    >
      <ButtonLabel icon={icon} pending={pending}>
        {pending && pendingLabel !== undefined ? pendingLabel : children}
      </ButtonLabel>
    </button>
  );
}
