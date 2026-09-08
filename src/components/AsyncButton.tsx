"use client";

import { useCallback, useState } from "react";
import type { IconType } from "@/core/ui/icons";
import { ButtonLabel } from "./ButtonLabel";

/**
 * Pending/disabled/prevent-double-submit for an *imperative* async call —
 * the counterpart to SubmitButton.tsx's useFormStatus, which only works for
 * a plain `<form action={...}>`. Copied verbatim from
 * FitDeskApp/src/components/AsyncButton.tsx. Not yet wired to any real
 * action in this app (everything today is mock data — see each page's
 * `// TODO(real-data)` markers) but the primitive is here so the first real
 * imperative admin action (e.g. archiving a package) doesn't need to
 * reinvent it.
 */
export function useAsyncAction<Args extends unknown[]>(
  action: (...args: Args) => Promise<void>,
): { run: (...args: Args) => void; pending: boolean } {
  const [pending, setPending] = useState(false);

  const run = useCallback(
    (...args: Args) => {
      if (pending) return; // prevent duplicate submissions
      setPending(true);
      void action(...args).finally(() => setPending(false));
    },
    [action, pending],
  );

  return { run, pending };
}

/** A button that runs an imperative async action and shows its own pending
 * state — same visual/behavioral contract as SubmitButton, for call sites
 * that aren't a plain form submit. Takes the same optional `icon` prop, so
 * an imperative action and a form-bound one look identical.
 *
 * Always `inline-flex items-center justify-center`, so the icon+label pair
 * stays centered inside the button regardless of how wide the button ends
 * up. Call sites should not repeat `flex`/`items-center`/`justify-center`
 * in their own `className`; just pass sizing/spacing/color classes. */
export function AsyncButton({
  onClick,
  pendingLabel,
  className,
  children,
  disabled,
  type = "button",
  icon,
}: {
  onClick: () => Promise<void>;
  pendingLabel: string;
  className: string;
  children: React.ReactNode;
  disabled?: boolean;
  type?: "button" | "submit";
  icon?: IconType;
}) {
  const { run, pending } = useAsyncAction(onClick);
  return (
    <button
      type={type}
      disabled={disabled || pending}
      onClick={() => run()}
      className={`press-scale inline-flex items-center justify-center ${className} disabled:pointer-events-none disabled:opacity-60`}
    >
      <ButtonLabel icon={icon} pending={pending}>
        {pending ? pendingLabel : children}
      </ButtonLabel>
    </button>
  );
}
