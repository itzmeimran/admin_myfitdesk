"use client";

import { useTransition } from "react";
import { Button } from "./Button";
import { ButtonLink } from "./ButtonLink";
import { CalendarIcon } from "@/core/ui/icons";

// Adapted from MyFitDesk's report PeriodSelector. Each screen supplies only
// periods its data supports; date ranges use the same shared DatePicker.
export type PeriodOption<T extends string = string> = { value: T; label: string; href?: string };
export function PeriodSelector<T extends string>({ value, options, onChange, ariaLabel = "Period", disabled = false }: {
  value: T | ""; options: readonly PeriodOption<T>[]; onChange?: (value: T) => void;
  ariaLabel?: string; disabled?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  return <div role="group" aria-label={ariaLabel} aria-busy={pending || undefined} className="flex max-w-full flex-wrap gap-0">
    {options.map((option) => option.href ? (
      <ButtonLink key={option.value} href={option.href} variant="secondary" size="sm" selected={value === option.value} disabled={disabled || pending}
        aria-current={value === option.value ? "true" : undefined} className="-ml-[1.5px] first:ml-0">
        <CalendarIcon aria-hidden />{option.label}
      </ButtonLink>
    ) : (
      <Button key={option.value} icon={CalendarIcon} variant="secondary" size="sm" selected={value === option.value}
        aria-pressed={value === option.value} disabled={disabled || pending} className="-ml-[1.5px] first:ml-0"
        onClick={() => startTransition(() => onChange?.(option.value))}>{option.label}</Button>
    ))}
  </div>;
}
