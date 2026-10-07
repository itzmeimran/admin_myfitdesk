"use client";

import { Select, type SelectOption } from "./Select";

export type DropdownOption = SelectOption;

/** Existing admin filter API, backed by MyFitDesk's shared Select. */
export function Dropdown({ value, options, onChange, ariaLabel, size = "md", className, ...props }: {
  value: string;
  options: readonly DropdownOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
  className?: string;
  size?: "md" | "sm";
  align?: "left" | "right";
  disabled?: boolean;
  id?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}) {
  return <Select {...props} className={className} triggerClassName={className} value={value} options={options} onChange={onChange}
    aria-label={ariaLabel} size={size === "sm" ? "compact" : "default"} />;
}
