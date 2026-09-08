"use client";

import { useFormStatus } from "react-dom";
import type { IconType } from "@/core/ui/icons";
import { ButtonLabel } from "./ButtonLabel";

/**
 * A submit button that shows its own pending state via `useFormStatus`, for
 * the plain `<form action={someServerAction}>` pattern (no
 * `useActionState`, so the parent stays a Server Component) — e.g. sign
 * out. Must render as a descendant of the `<form>` it belongs to. Copied
 * verbatim from FitDeskApp/src/components/SubmitButton.tsx.
 *
 * Always `inline-flex items-center justify-center`, so the icon+label pair
 * stays centered inside the button regardless of how wide the button ends
 * up. Call sites should not repeat `flex`/`items-center`/`justify-center`
 * in their own `className`; just pass sizing/spacing/color classes.
 */
export function SubmitButton({
  children,
  pendingLabel,
  className,
  icon,
}: {
  children: React.ReactNode;
  pendingLabel: string;
  className: string;
  icon?: IconType;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`press-scale inline-flex items-center justify-center ${className} disabled:pointer-events-none disabled:opacity-60`}
    >
      <ButtonLabel icon={icon} pending={pending}>
        {pending ? pendingLabel : children}
      </ButtonLabel>
    </button>
  );
}
